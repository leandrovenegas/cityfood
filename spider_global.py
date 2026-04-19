import sys
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
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

async def get_next_job():
    """Obtiene el proximo hexagono disponible atomicamente."""
    queue_ref = db.collection(f"artifacts/marketspider-v3/global_job_queue")
    
    # Run in transaction to guarantee no duplicate pulls
    @firestore.transactional
    def lock_job(transaction, job_ref):
        snapshot = job_ref.get(transaction=transaction)
        if snapshot.get("status") == "pending" or (snapshot.get("status") == "failed" and snapshot.get("attempts") < 3):
            transaction.update(job_ref, {
                "status": "processing",
                "last_run": datetime.datetime.now(datetime.timezone.utc),
                "attempts": snapshot.get("attempts") + 1
            })
            return snapshot
        return None

    # Query localmente
    docs = queue_ref.where("status", "in", ["pending", "failed"]).limit(5).stream()
    
    transaction = db.transaction()
    for doc in docs:
        snapshot = lock_job(transaction, doc.reference)
        if snapshot:
            return snapshot
            
    return None

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
            print(f"    [UP] {place_data['name']} actualizado (Rank/Reviews cambiaron). Snapshot generado.")
        else:
            print(f"    [-] {place_data['name']} sin cambios.")
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
        print(f"    [NEW] {place_data['name']} indexado por primera vez.")

async def extract_feed_data(page, lat, lng):
    # This requires specific click sequence or infinite scroll in pure coordinate view
    # Usually coordinate view requires clicking 'Nearby' -> 'Restaurants' or similar. 
    # For a purely generic "business" fetch, we use the Maps query: search/* near lat,lng
    print(f"  > Rastreando Hexagono {lat:.4f},{lng:.4f}...")
    
    url = f"https://www.google.com/maps/search/negocios+o+locales+o+tiendas/@{lat},{lng},17z"
    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    
    try:
        await page.locator("button:has-text('Aceptar')").click(timeout=1500)
    except:
        pass
        
    print("  > Navegando container y ejecutando Scroll...")
    try:
        feed = page.locator('div[role="feed"]')
        await feed.wait_for(timeout=10000)
        for _ in range(3): # Bajar un par de veces
            await feed.hover()
            await page.mouse.wheel(0, 5000)
            await asyncio.sleep(1.5)
    except Exception as e:
        print("  > Advertencia: Contenedor no aparecio (Quizas area vacia).")
        
    links_locators = await page.locator('a[href*="https://www.google.com/maps/place/"]').all()
    hrefs = []
    for l in links_locators:
        h = await l.get_attribute("href")
        if h and h not in hrefs:
            hrefs.append(h)
            
    print(f"  > {len(hrefs)} URLs en bruto extraidas.")
    
    # Process each roughly
    for href in hrefs[:15]: # process up to 15 per cell to speed up
        place_id = extract_place_id_from_url(href)
        # Parse basic name from URL
        m = re.search(r'/place/([^/]+)/', href)
        name = m.group(1).replace('+', ' ') if m else "Local_Desconocido"
        
        # Here we should ideally visit the page, but for now we just register it
        # If we visit it, it's 10x slower.
        upsert_business({
            "name": urllib.parse.unquote(name),
            "url": href,
            "hex_lat": lat,
            "hex_lng": lng,
            "last_seen": datetime.datetime.now(datetime.timezone.utc)
        }, place_id)

async def worker(worker_id):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 WID/{worker_id}"
        )
        page = await context.new_page()
        await stealth_async(page)
        
        while True:
            job = await get_next_job()
            if not job:
                print(f"[Worker {worker_id}] No hay mas trabajos. Esperando...")
                await asyncio.sleep(10)
                continue
                
            cell_id = job.id
            lat, lng = job.get("lat"), job.get("lng")
            
            print(f"\n[Worker {worker_id}] === Iniciando Celda {cell_id} ({lat:.4f}, {lng:.4f}) ===")
            
            try:
                await extract_feed_data(page, lat, lng)
                
                # Marcar completado
                db.collection(f"artifacts/marketspider-v3/global_job_queue").document(cell_id).update({
                    "status": "completed"
                })
                print(f"[Worker {worker_id}] Celda completada con exito.")
                
            except Exception as e:
                print(f"[Worker {worker_id}] Error fatal en celda: {e}")
                db.collection(f"artifacts/marketspider-v3/global_job_queue").document(cell_id).update({
                    "status": "failed"
                })
                
        await browser.close()

async def main():
    print("Iniciando MarketSpider GLOBAL 24/7 (3 Workers concurrentes)...")
    workers = [worker(i) for i in range(1, 4)]
    await asyncio.gather(*workers)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
