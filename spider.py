import random
import datetime
import time
import threading
import signal
import sys
import firebase_admin
from firebase_admin import credentials, firestore

# ==========================================
# CONFIGURACIÓN
# ==========================================
SERVICE_ACCOUNT_FILE = 'serviceAccountKey.json'
USER_ID = "Hp1YGeni2DgiWrtrIKUgmgki7UL2"
APP_ID = "marketspider-v3"

# Flag global para apagado limpio
running = True

def signal_handler(sig, frame):
    global running
    print("\n\n⛔ Señal recibida. Apagando Spider limpiamente... ¡hasta pronto!")
    running = False
    sys.exit(0)

# ==========================================
# LÓGICA DE NEGOCIO (CALCULADORA DE SCORE)
# ==========================================
def calculate_visual_score(has_video: bool, num_photos: int, last_photo_days_ago: int) -> int:
    score = 0
    if has_video:
        score += 40
    score += min(num_photos, 30)
    if last_photo_days_ago <= 30:
        score += 30
    return score

def determine_opportunity(score: int, has_video: bool, last_photo_days_ago: int) -> str:
    if score >= 80:
        return "Mantenimiento Visual"
    if not has_video and last_photo_days_ago > 30:
        return "Video + Refresh de Fotos"
    if not has_video:
        return "Video Promocional"
    return "Refresco de Contenido"

# ==========================================
# MOTOR DEL SPIDER (PLAYWRIGHT REAL SCRAPER)
# ==========================================
from playwright.sync_api import sync_playwright
import urllib.parse
import re

def extract_place_data(page, url_href, rank):
    """Navega al detalle interactivo de Google Maps y extrae datos reales."""
    try:
        page.goto(url_href, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(2000) # Dejar que la info renderice
    except Exception as e:
        print(f"    [Error] No se pudo cargar lugar: {url_href[:30]}...")
        return None

    # Nombre
    name = "Desconocido"
    try:
        name = page.locator('h1').first.inner_text(timeout=3000)
    except:
        pass

    # Coordenadas
    lat, lng = 0.0, 0.0
    match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', page.url)
    if match:
        lat, lng = float(match.group(1)), float(match.group(2))

    # Rating y Reviews (Extracción simple desde el padre del h1)
    rating, reviews = 0.0, 0
    try:
        h1_parent = page.locator('h1').first.locator('..')
        if h1_parent.count() > 0:
            parent_text = h1_parent.inner_text()
            rmatch = re.search(r'(\d+[\.,]\d+)[\s\n]*\(([\d\.]+)\)', parent_text)
            if rmatch:
                rating = float(rmatch.group(1).replace(',', '.'))
                reviews = int(rmatch.group(2).replace('.', ''))
    except:
        pass

    # Teléfono y URL (sitio web) - Extraidos de vínculos interactivos
    website, phone = "", ""
    try:
        links = page.locator('a[href]').all()
        for a in links:
            href = a.get_attribute("href") or ""
            if href.startswith("tel:"):
                phone = href.replace("tel:", "")
            elif href.startswith("http") and "google.com" not in href:
                if not website:
                    website = href
    except:
        pass

    # Heurísticas de Visual Score (Adaptadas para datos reales aproximados)
    has_video = False
    last_photo_days_ago = 10 if website else 45
    score = calculate_visual_score(has_video, 50, last_photo_days_ago) # Suponemos info general
    opp_type = determine_opportunity(score, has_video, last_photo_days_ago)
    last_photo_str = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=last_photo_days_ago)).strftime("%Y-%m-%d")

    return {
        "rank": rank,
        "name": name,
        "rating": rating,
        "reviews": reviews,
        "phone": phone,
        "website": website,
        "lat": lat,
        "lng": lng,
        "visualScore": score,
        "hasVideo": has_video,
        "lastPhoto": last_photo_str,
        "opportunityType": opp_type
    }

def run_spider_engine(config: dict) -> dict:
    rubro = config.get("rubro", "Cafetería")
    ciudad = config.get("ciudad", "Centro")
    max_results = min(int(config.get("maxResults", 7)), 50) # Limitamos a 50 para no bloquear 

    print(f"\n  🔍 Rastreando en Google Maps: '{rubro} en {ciudad}' (máx {max_results} locales)...")

    query = f"{rubro} en {ciudad}"
    url = f"https://www.google.com/maps/search/{urllib.parse.quote(query)}"
    places = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=40000)
            
            try:
                page.locator("button:has-text('Aceptar')", timeout=2000).click()
            except:
                pass

            # Despliegue de Sidebar list
            print("  ⏳ Deslizando panel para recolectar competidores...")
            try:
                feed = page.locator('div[role="feed"]')
                feed.wait_for(timeout=10000)
                for _ in range(4):
                    feed.hover()
                    page.mouse.wheel(0, 5000)
                    page.wait_for_timeout(1000)
            except:
                print("  ⚠️ Contenedor de lista no estandar. Leyendo enlaces de pantalla actual...")

            # Acumular hrefs limpios
            links_locators = page.locator('a[href*="https://www.google.com/maps/place/"]').all()
            hrefs = []
            for l in links_locators:
                h = l.get_attribute("href")
                if h and h not in hrefs:
                    hrefs.append(h)
            
            hrefs = hrefs[:max_results]
            print(f"  📌 {len(hrefs)} locales detectados. Extrayendo datos específicos...")

            for rank, href in enumerate(hrefs, start=1):
                pdata = extract_place_data(page, href, rank)
                if pdata:
                    places.append(pdata)
                    print(f"    [{rank:02d}] {pdata['name']:<25} | Rank: {pdata['rank']} | Phone: {pdata['phone']}")

            browser.close()
    except Exception as e:
        print(f"  ❌ Error fatal Playwright: {e}")

    return {
        "category": rubro,
        "location": ciudad,
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "places": places
    }

# ==========================================
# PROCESADOR DE TRABAJOS
# ==========================================
def process_job(db, job_ref, job_data, active_timers):
    config = job_data.get("config", {})
    auto_repeat_hours = int(config.get("autoRepeatHours", 0))
    job_id = job_ref.id

    try:
        # 1. Marcar como corriendo
        job_ref.update({
            "status": "running",
            "lastRunAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "message": "Spider ejecutando rastreo..."
        })

        # 2. Ejecutar el motor del spider
        scan_data = run_spider_engine(config)

        # 3. Subir resultados a la colección de scans del usuario
        scans_path = f"artifacts/{APP_ID}/users/{USER_ID}/scans"
        db.collection(scans_path).document().set(scan_data)
        print(f"  ✅ {len(scan_data['places'])} locales guardados en Firestore.")

        # 4. Calcular próxima ejecución o marcar como done
        if auto_repeat_hours > 0:
            next_run = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=auto_repeat_hours)
            job_ref.update({
                "status": "scheduled",
                "nextRunAt": next_run.isoformat(),
                "message": f"Esperando... próxima ejecución a las {next_run.strftime('%H:%M')} UTC"
            })
            print(f"  ⏰ Auto-rastreo programado en {auto_repeat_hours}h (a las {next_run.strftime('%H:%M')} UTC)")

            # Programar re-ejecución en un hilo daemon
            def delayed_rerun():
                time.sleep(auto_repeat_hours * 3600)
                if running:
                    print(f"\n⏰ Ejecutando rastreo automático programado: {config.get('rubro', '?')} en {config.get('ciudad', '?')}")
                    job_ref.update({"status": "pending", "message": "Re-ejecución automática iniciada"})

            timer_thread = threading.Thread(target=delayed_rerun, daemon=True)
            timer_thread.start()
            active_timers[job_id] = timer_thread

        else:
            job_ref.update({
                "status": "done",
                "message": f"Rastreo completado: {len(scan_data['places'])} locales encontrados."
            })
            print(f"  🏁 Trabajo finalizado.\n")

    except Exception as e:
        print(f"  ❌ Error al procesar el trabajo '{job_id[:8]}': {e}")
        try:
            job_ref.update({"status": "error", "message": str(e)})
        except:
            pass

# ==========================================
# LISTENER PRINCIPAL
# ==========================================
def start_listening(db):
    jobs_path = f"artifacts/{APP_ID}/users/{USER_ID}/scan_jobs"
    print(f"👂 Escuchando trabajos en: .../{USER_ID[:8]}.../scan_jobs")
    print(f"   Presiona Ctrl+C para detener el spider.\n")
    print("-" * 50)

    processed_jobs = set()
    active_timers = {}

    def on_snapshot(col_snapshot, changes, read_time):
        for change in changes:
            if change.type.name in ('ADDED', 'MODIFIED'):
                job_ref = change.document.reference
                job_data = change.document.to_dict()
                job_id = change.document.id
                status = job_data.get("status", "")

                if status == "pending" and job_id not in processed_jobs:
                    processed_jobs.add(job_id)
                    config = job_data.get("config", {})
                    print(f"\n📋 ¡Nuevo trabajo! ID: {job_id[:8]}  |  {config.get('rubro','?')} en {config.get('ciudad','?')}")

                    # Procesar en hilo separado para no bloquear el listener
                    t = threading.Thread(
                        target=process_job,
                        args=(db, job_ref, job_data, active_timers),
                        daemon=True
                    )
                    t.start()

                elif status == "pending" and job_id in processed_jobs:
                    # Re-desencolar si fue re-puesto a pending (auto-repeat)
                    processed_jobs.discard(job_id)

    col_ref = db.collection(jobs_path)
    col_watch = col_ref.on_snapshot(on_snapshot)
    return col_watch

# ==========================================
# MAIN — BUCLE PRINCIPAL
# ==========================================
if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("\n" + "=" * 50)
    print("  🕷️  MarketSpider V3 — Servidor Persistente")
    print("=" * 50)
    print(f"  Usuario: {USER_ID[:12]}...")
    print(f"  Proyecto: {APP_ID}")
    print()

    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("🔥 Firebase Firestore conectado.\n")
    except FileNotFoundError:
        print(f"❌ No se encontró '{SERVICE_ACCOUNT_FILE}'.")
        print("   Descárgalo desde Firebase Console > Project Settings > Service Accounts")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error iniciando Firebase: {e}")
        sys.exit(1)

    col_watch = start_listening(db)

    # Mantener el proceso vivo
    while running:
        time.sleep(1)
