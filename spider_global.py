import sys
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import urllib.parse
import urllib.request
import re

# Firebase Setup
try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def fetch_and_lock():
    queue_ref = db.collection(f"artifacts/marketspider-v3/global_job_queue")
    docs = queue_ref.where("status", "in", ["pending", "failed"]).limit(1).get() # get gives a list, stream is an iterator
    for doc in docs:
        snapshot = doc.to_dict()
        if snapshot.get("attempts", 0) < 3:
            doc.reference.update({
                "status": "processing",
                "last_run": datetime.datetime.now(datetime.timezone.utc),
                "attempts": snapshot.get("attempts", 0) + 1
            })
            return {"id": doc.id, **snapshot}
    return None

async def get_next_job():
    """Obtiene el proximo hexagono disponible atomicamente via threadpool."""
    return await asyncio.to_thread(fetch_and_lock)

def extract_place_id_from_url(url: str) -> str:
    # Extraer identificador unico hexadecimal de google maps url
    # Ejemplo: /data=!4m9!1m2!2m1!1scafeteria!3m5!1s0x9689e0c5210e5bd7:0x52ed67a3f89d3d3
    matches = re.findall(r'!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)', url)
    if matches:
        return matches[-1]
    
    # Fallback to pure string regex matching place name
    # e.g., /place/Cafeteria+Nombre/
    m = re.search(r'/place/([^/]+)/', url)
    if m:
        return m.group(1)
        
    return "UNKNOWN_" + str(hash(url))

def upsert_business(place_data: dict, place_id: str):
    """Guarda en coleccion de negocios y genera History Snapshot si es necesario"""
    businesses_ref = db.collection(f"artifacts/marketspider-v3/global_businesses").document(place_id)
    doc = businesses_ref.get()
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    if doc.exists:
        old_data = doc.to_dict()
        old_reviews = old_data.get("reviews", 0)
        new_reviews = place_data.get("reviews", 0)
        
        # Si hubo un cambio relevante, guardar historial
        if old_reviews != new_reviews or old_data.get("rating") != place_data.get("rating"):
            # Enviar Snapshot
            history_ref = businesses_ref.collection("history").document(now.isoformat())
            history_ref.set({
                "date": now,
                "rating": place_data.get("rating"),
                "reviews": new_reviews,
                "visualScore": place_data.get("visualScore", 0)
            })
            # Actualizar master record
            businesses_ref.update(place_data)
            print(f"      \033[93m⚡ [UPDATE]\033[0m {place_data['name'][:30]} (Cambios detectados. Snapshot listo)")
        else:
            print(f"      \033[90m〰️ [SKIP]\033[0m {place_data['name'][:30]} (Sin cambios recientes)")
    else:
        # Nuevo negocio
        place_data["created_at"] = now
        businesses_ref.set(place_data)
        
        history_ref = businesses_ref.collection("history").document(now.isoformat())
        history_ref.set({
            "date": now,
            "rating": place_data.get("rating"),
            "reviews": place_data.get("reviews"),
            "visualScore": place_data.get("visualScore", 0)
        })
        print(f"      \033[92m🟢 [NUEVO]\033[0m {place_data['name'][:30]} indexado por 1ra vez.")

def sync_upsert_business(place_data, place_id):
    upsert_business(place_data, place_id)

async def extract_feed_data(page, lat, lng, worker_id):
    now_ts = datetime.datetime.now().strftime('%H:%M:%S')
    print(f"[{now_ts}] [W-{worker_id}] 🌎 Volando a coordenadas: {lat:.6f}, {lng:.6f}...")
    
    url = f"https://www.google.com/maps/search/negocios+o+locales+o+tiendas/@{lat},{lng},17z"
    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    
    try:
        await page.locator("button:has-text('Aceptar')").click(timeout=1500)
    except:
        pass
        
    print(f"[{now_ts}] [W-{worker_id}] 📜 Escaneando panel izquierdo de Maps...")
    try:
        feed = page.locator('div[role="feed"]')
        await feed.wait_for(timeout=10000)
        for _ in range(3): # Bajar un par de veces
            await feed.hover()
            await page.mouse.wheel(0, 5000)
            await asyncio.sleep(1.5)
            print(f"[{now_ts}] [W-{worker_id}] ⏬ Haciendo Scroll inifinito (Vuelta {_ + 1}/3)...")
    except Exception as e:
        print(f"[{now_ts}] [W-{worker_id}] ⚠️ Advertencia: No hay mas negocios en esta vista satelital.")
        
    print(f"[{now_ts}] [W-{worker_id}] ✨ ¡Exito! Extrayendo metadata nativa de Maps UI...")
    
    js_code = """() => {
        let items = [];
        let links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        links.forEach(a => {
            let container = a.closest('div[role="article"]') || a.parentElement.parentElement.parentElement;
            if(container && container.innerText) {
                items.push({ url: a.href, text: container.innerText });
            }
        });
        return items;
    }"""
    raw_businesses = await page.evaluate(js_code)
    
    unique_businesses = {}
    for item in raw_businesses:
        url = item['url']
        if url not in unique_businesses:
            unique_businesses[url] = item['text']
            
    print(f"[{now_ts}] [W-{worker_id}] Evaluando Upserts de {len(unique_businesses)} locales crudos detectados...")
    
    # Process each roughly
    processed_count = 0
    for href, text_block in unique_businesses.items():
        if processed_count >= 15: break # process up to 15 per cell to speed up
        
        place_id = extract_place_id_from_url(href)
        m = re.search(r'/place/([^/]+)/', href)
        name = urllib.parse.unquote(m.group(1).replace('+', ' ')) if m else "Local_Desconocido"
        
        rating = 0.0
        reviews = 0
        category = ""
        
        # Parse extra text lines for details
        lines = text_block.split('\n')
        for line in lines:
            line_str = line.strip()
            # Catch rating like 4.5 (130)
            if not rating and not reviews:
                match_rev = re.search(r'([\d\.,]+)\s*\(([\d\.,]+)\)', line_str)
                if match_rev:
                    try:
                        rating = float(match_rev.group(1).replace(',', '.'))
                        reviews = int(match_rev.group(2).replace('.', '').replace(',', ''))
                    except: pass
            
            # Catch category after middle dot -> 4.5 (130) · Cafeteria
            if '·' in line_str:
                parts = line_str.split('·')
                if len(parts) > 1:
                    cat_candidate = parts[-1].strip()
                    if cat_candidate and len(cat_candidate) > 2 and '¢' not in cat_candidate and '$' not in cat_candidate:
                        category = cat_candidate

        await asyncio.to_thread(upsert_business, {
            "name": name,
            "url": href,
            "hex_lat": lat,
            "hex_lng": lng,
            "rating": rating,
            "reviews": reviews,
            "category": category,
            "last_seen": datetime.datetime.now(datetime.timezone.utc)
        }, place_id)
        processed_count += 1

async def worker(worker_id):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 WID/{worker_id}"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        while True:
            job = await get_next_job()
            now_ts = datetime.datetime.now().strftime('%H:%M:%S')
            
            if not job:
                print(f"[{now_ts}] [W-{worker_id}] 💤 No hay celdas pendientes. Durmiendo 10s...")
                await asyncio.sleep(10)
                continue
                
            cell_id = job.get("id")
            lat, lng = job.get("lat"), job.get("lng")
            
            print(f"\n\033[94m[{now_ts}] [W-{worker_id}] ================== COORDENADA H3: {cell_id} ==================\033[0m")
            
            try:
                await extract_feed_data(page, lat, lng, worker_id)
                
                # Marcar completado
                def mark_completed():
                    db.collection(f"artifacts/marketspider-v3/global_job_queue").document(cell_id).update({
                        "status": "completed"
                    })
                await asyncio.to_thread(mark_completed)
                print(f"[{now_ts}] [W-{worker_id}] ✅ Celda validada y completada. Moviendo a la siguiente...")
                
            except Exception as e:
                print(f"[{now_ts}] [W-{worker_id}] ❌ Error crítico: {e}")
                def mark_failed():
                    db.collection(f"artifacts/marketspider-v3/global_job_queue").document(cell_id).update({
                        "status": "failed"
                    })
                await asyncio.to_thread(mark_failed)
                
        await browser.close()

async def main():
    print("\n--------------------------------------------------------------")
    print("🕸️ MARKET SPIDER GLOBAL v3 - Motor de Sincronización Espacial")
    print("--------------------------------------------------------------")
    print("🚀 Levantando flota asincrónica. Precalentando 3 navegadores Playwright...\n")
    workers = [worker(i) for i in range(1, 4)]
    await asyncio.gather(*workers)

if __name__ == "__main__":
    asyncio.run(main())
