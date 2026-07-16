import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
print("INICIANDO SPIDER GLOBAL...")
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
import datetime
import urllib.parse
import urllib.request
import re

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    print("[SUPABASE] Conectado exitosamente.", flush=True)
else:
    print("[SUPABASE] Credenciales no encontradas.", flush=True)
    sys.exit(1)

MASTER_CATEGORIES = [
    "restaurante", "cafeteria", "pasteleria", "bar", "sushi", "pizzeria", "comida rapida",
    "peluqueria", "barberia", "salon de belleza", "spa", "gimnasio", "clinica dental", "optica",
    "almacen", "minimarket", "ferretería", "tienda de ropa", "veterinaria", "pet shop", "jugueteria",
    "taller mecanico", "vulcanizacion", "repuestos automotriz", "servicio tecnico", "imprenta",
    "ferretería industrial", "bodega", "carpinteria", "metalurgica", "gasfiteria", "electricista",
    "abogado", "contador", "agencia de publicidad", "hotel", "hostal", "motel", "apartamento turistico"
]

def fetch_and_lock():
    try:
        response = supabase.table("global_job_queue").select("*").eq("status", "pending").limit(1).execute()
        if response.data and len(response.data) > 0:
            snapshot = response.data[0]
            attempts = snapshot.get("attempts") or 0
            
            if attempts < 3:
                now = datetime.datetime.now(datetime.timezone.utc).isoformat()
                supabase.table("global_job_queue").update({
                    "status": "processing",
                    "last_run": now,
                    "attempts": attempts + 1
                }).eq("id", snapshot["id"]).execute()
                return snapshot
    except Exception as e:
        print(f"Error en fetch_and_lock: {e}")
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
    """Guarda en coleccion de negocios"""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    place_data["id"] = place_id
    place_data["last_seen"] = now
    
    try:
        response = supabase.table("global_businesses").select("status, created_at").eq("id", place_id).execute()
        if response.data and len(response.data) > 0:
            old_data = response.data[0]
            place_data["status"] = old_data.get("status", "pending")
            place_data["created_at"] = old_data.get("created_at")
            
            # Upsert actualiza el registro existente
            supabase.table("global_businesses").upsert(place_data, on_conflict="id").execute()
            print(f"      \033[93m⚡ [UPDATE]\033[0m {place_data['name'][:30]}")
        else:
            # Nuevo negocio
            place_data["created_at"] = now
            supabase.table("global_businesses").upsert(place_data, on_conflict="id").execute()
            print(f"      \033[92m🟢 [NUEVO]\033[0m {place_data['name'][:30]} indexado por 1ra vez.")
    except Exception as e:
        print(f"Error upsert_business: {e}")

def sync_upsert_business(place_data, place_id):
    upsert_business(place_data, place_id)

async def extract_feed_data(page, lat, lng, worker_id):
    now_ts = datetime.datetime.now().strftime('%H:%M:%S')
    
    # Seleccionar 3 categorias al azar para cada pasada para no ser detectado y variar
    import random
    selected_cats = random.sample(MASTER_CATEGORIES, 4)
    query_str = " OR ".join(selected_cats)
    
    print(f"[{now_ts}] [W-{worker_id}] Hyper-Scanning en: {lat:.6f}, {lng:.6f}...")
    print(f"      BUSCANDO: {', '.join(selected_cats)}")
    
    url = f"https://www.google.com/maps/search/{urllib.parse.quote(query_str)}/@{lat},{lng},17z"
    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    
    try:
        # Esperar a que el panel de resultados aparezca
        await page.wait_for_selector('div[role="feed"]', timeout=5000)
    except:
        pass

    try:
        await page.locator("button:has-text('Aceptar')").click(timeout=1500)
    except:
        pass
        
    print(f"[{now_ts}] [W-{worker_id}] Escaneando panel izquierdo (Scrolleo profundo 10x)...")
    try:
        feed = page.locator('div[role="feed"]')
        for _ in range(10): # Scrolleo profundo para Hyper-Scanning
            await feed.hover()
            await page.mouse.wheel(0, 5000)
            await asyncio.sleep(1.2)
    except Exception as e:
        pass
        
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
            
    print(f"[{now_ts}] [W-{worker_id}] Locales detectados en esta pasada: {len(unique_businesses)}")
    
    # Process each roughly
    processed_count = 0
    for href, text_block in unique_businesses.items():
        
        place_id = extract_place_id_from_url(href)
        m = re.search(r'/place/([^/]+)/', href)
        name = urllib.parse.unquote(m.group(1).replace('+', ' ')) if m else "Local_Desconocido"
        
        rating = 0.0
        reviews = 0
        category = ""
        phone = ""
        hours = ""
        address = ""
        
        # Parse extra text lines for details
        lines = [line.strip() for line in text_block.split('\n') if line.strip()]
        for i, line_str in enumerate(lines):
            if i == 0:
                continue # Skip name line
                
            # 1. Catch rating like 4.5 (130) or 4.5 (1.2K)
            match_rev = re.search(r'([\d\.,]+)\s*\(([\d\.,Kk]+)\)', line_str)
            if match_rev:
                try:
                    rating_str = match_rev.group(1).replace(',', '.')
                    rating = float(rating_str)
                    
                    rev_str = match_rev.group(2).lower()
                    if 'k' in rev_str:
                        rev_num = float(rev_str.replace('k', '').replace('.', '').replace(',', '')) * 1000
                        reviews = int(rev_num)
                    else:
                        reviews = int(rev_str.replace('.', '').replace(',', ''))
                except:
                    pass
            
            # 2. Check each part separated by middle dot
            parts = [p.strip() for p in line_str.split('·')]
            for part in parts:
                # Check for phone
                cleaned_phone = re.sub(r'[\s\(\)\-\+]', '', part)
                if cleaned_phone.isdigit() and 7 <= len(cleaned_phone) <= 15:
                    letter_count = sum(c.isalpha() for c in part)
                    if letter_count == 0 or (letter_count <= 2 and part.lower().startswith('tel')):
                        phone = part
                        continue
                
                # Check for hours
                if any(h in part.lower() for h in ["abierto", "cerrado", "cierra a", "abre a", "horas"]):
                    hours = part
                    continue

                # Check for category candidates
                is_rating = re.search(r'^\d[\d\.,]*$', part) or '(' in part or ')' in part
                is_price = re.search(r'^[\$\€\£\¥\¢\+]+$', part)
                is_service = any(s in part.lower() for s in ["consumo en el", "para llevar", "entrega a", "reparto a", "domicilio", "tienda", "recogida"])
                is_hour_related = any(h in part.lower() for h in ["abierto", "cerrado", "cierra", "abre", "horas"])
                is_address_related = any(a in part.lower() for a in ["av.", "calle", "pasaje", "camino", "ruta", "nº", "#", "depto", "oficina"])
                
                if (3 <= len(part) <= 40 and 
                    not is_rating and 
                    not is_price and 
                    not is_service and 
                    not is_hour_related and 
                    not is_address_related and 
                    sum(c.isdigit() for c in part) < 3):
                    
                    if not category or i <= 2:
                        category = part

        # 3. Check for address candidates
        for i, line_str in enumerate(lines):
            if i == 0:
                continue
            parts = [p.strip() for p in line_str.split('·')]
            for part in parts:
                if part in [category, phone, hours]:
                    continue
                is_service = any(s in part.lower() for s in ["consumo en el", "para llevar", "entrega a", "reparto a", "domicilio", "tienda", "recogida"])
                is_rating = '(' in part or ')' in part or re.search(r'^\d[\d\.,]*$', part)
                is_price = re.search(r'^[\$\€\£\¥\¢\+]+$', part)
                if len(part) > 5 and not is_service and not is_rating and not is_price:
                    if not address:
                        address = part

        # Calcular Need Score Base
        need_score = 0
        if rating > 0 and rating < 4.0: need_score += 25
        need_score += 30 # default no video assumption
        need_score += 20 # default no web assumption
        need_score += 15 # default no reclamada assumption

        await asyncio.to_thread(upsert_business, {
            "name": name,
            "name_lower": name.lower() if name else "",
            "url": href,
            "hex_lat": lat,
            "hex_lng": lng,
            "rating": rating,
            "reviews": reviews,
            "category": category,
            "phone": phone,
            "hours": hours,
            "address": address,
            "status": "pending",
            "needScore": need_score
        }, place_id)
        processed_count += 1

async def worker(worker_id):
    async with async_playwright() as p:
        exec_path = '/usr/bin/chromium-browser' if os.path.exists('/usr/bin/chromium-browser') else None
        browser = await p.chromium.launch(headless=True, executable_path=exec_path)
        context = await browser.new_context(
            user_agent=f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 WID/{worker_id}"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        while True:
            job = await get_next_job()
            now_ts = datetime.datetime.now().strftime('%H:%M:%S')
            
            if not job:
                print(f"[{now_ts}] [W-{worker_id}] ZZZ No hay celdas pendientes. Durmiendo 10s...")
                await asyncio.sleep(10)
                continue
                
            cell_id = job.get("id")
            lat, lng = job.get("lat"), job.get("lng")
            
            print(f"\n[{now_ts}] [W-{worker_id}] ================== COORDENADA H3: {cell_id} ==================")
            
            try:
                await extract_feed_data(page, lat, lng, worker_id)
                
                # Marcar completado
                def mark_completed():
                    supabase.table("global_job_queue").update({"status": "completed"}).eq("id", cell_id).execute()
                await asyncio.to_thread(mark_completed)
                print(f"[{now_ts}] [W-{worker_id}] OK - Celda validada y completada. Moviendo a la siguiente...")
                
            except Exception as e:
                print(f"[{now_ts}] [W-{worker_id}] ERROR: {e}")
                def mark_failed():
                    supabase.table("global_job_queue").update({"status": "failed"}).eq("id", cell_id).execute()
                await asyncio.to_thread(mark_failed)
                
        await browser.close()

async def main():
    print("\n--------------------------------------------------------------")
    print("MARKET SPIDER GLOBAL v3 - Motor de Sincronizacion Espacial")
    print("--------------------------------------------------------------")
    print("Levantando flota asincronica. Precalentando 3 navegadores Playwright...\n")
    workers = [worker(i) for i in range(1, 4)]
    await asyncio.gather(*workers)

if __name__ == "__main__":
    asyncio.run(main())
