import random
import datetime
import time
import threading
import signal
import sys
import queue
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

    # Rating y Reviews (Extracción robusta vía Accesibilidad / aria-label)
    rating, reviews = 0.0, 0
    try:
        # En Google Maps, el elemento que agrupa las valoraciones suele tener un aria-label estricto
        # como: "4,5 estrellas 807 reseñas"
        stars_element = page.locator('[aria-label*="estrellas"]').first
        if stars_element.count() > 0:
            aria_text = stars_element.get_attribute('aria-label') or ""
            smatch = re.search(r'([\d,\.]+)\s*estrellas?.*?([\d\.]+)\s*reseñas?', aria_text, re.IGNORECASE)
            if smatch:
                rating = float(smatch.group(1).replace(',', '.'))
                reviews = int(smatch.group(2).replace('.', ''))
        
        # Fallback: Si no lo encontró, buscamos bajo el H1 clásico
        if rating == 0.0:
            h1_parent = page.locator('h1').first.locator('..')
            if h1_parent.count() > 0:
                parent_text = h1_parent.inner_text()
                rmatch = re.search(r'(\d+[\.,]\d+)[\s\n]*\(([\d\.]+)\)', parent_text)
                if rmatch:
                    rating = float(rmatch.group(1).replace(',', '.'))
                    reviews = int(rmatch.group(2).replace('.', ''))
    except Exception as e:
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
# PROCESADOR DE TRABAJOS (WORKER Y COLA)
# ==========================================
job_queue = queue.Queue()

def worker_loop(db):
    """
    Toma trabajos de la cola uno por uno. Limita a Playwright a una sola 
    instancia corriendo a la vez. Implementa pausas anti-ban.
    """
    print("👷 Worker iniciado y esperando trabajos en la cola...")
    while running:
        try:
            # timeout=1 permite chequear el flag 'running' y salir suavemente
            job_ref, job_data, job_id = job_queue.get(timeout=1)
        except queue.Empty:
            continue

        if not running:
            break

        config = job_data.get("config", {})
        try:
            # 1. Marcar como corriendo
            job_ref.update({
                "status": "running",
                "lastRunAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "message": "Spider ejecutando rastreo..."
            })

            # 2. Ejecutar el motor del spider
            scan_data = run_spider_engine(config)

            # 3. Subir resultados a la colección de scans
            scans_path = f"artifacts/{APP_ID}/users/{USER_ID}/scans"
            db.collection(scans_path).document().set(scan_data)
            print(f"  ✅ {len(scan_data['places'])} locales guardados en Firestore.")

            # 4. Marcar como finalizado (Ya no reprogramamos timers acá, de eso se encarga NightCron)
            job_ref.update({
                "status": "done",
                "message": f"Rastreo completado: {len(scan_data['places'])} locales encontrados."
            })
            print(f"  🏁 Trabajo '{job_id}' finalizado.")

        except Exception as e:
            print(f"  ❌ Error al procesar el trabajo '{job_id[:8]}': {e}")
            try:
                job_ref.update({"status": "error", "message": str(e)})
            except:
                pass
        
        job_queue.task_done()

        # 5. Delay Anti-Ban antes de procesar el siguiente trabajo de la cola
        if not job_queue.empty():
            delay = random.randint(60, 180) # 1 a 3 minutos
            print(f"  ⏱️  Pausa Anti-Ban activada. Siguiente trabajo en {delay} segundos...\n")
            for _ in range(delay):
                if not running: break
                time.sleep(1)
        else:
            print("  ☕ Cola vacía, retornando a reposo.\n")

# ==========================================
# LISTENER PRINCIPAL
# ==========================================
def start_listening(db):
    jobs_path = f"artifacts/{APP_ID}/users/{USER_ID}/scan_jobs"
    print(f"👂 Escuchando trabajos... (Los rastreos manuales aplican en tiempo real)")
    print(f"   Presiona Ctrl+C para detener el spider.\n")
    print("-" * 50)

    # Iniciar el Worker (Hilo Secuencial)
    w_t = threading.Thread(target=worker_loop, args=(db,), daemon=True)
    w_t.start()

    processed_jobs = set()

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
                    print(f"\n📋 [ENCOLADO] Trabajo detectado: {config.get('rubro','?')} en {config.get('ciudad','?')}")
                    
                    # Lo mandamos a la cola para procesamiento FIFO por el worker
                    job_queue.put((job_ref, job_data, job_id))

                elif status != "pending" and job_id in processed_jobs:
                    # Liberar del set local si el trabajo cambió de status y finalizó/fayó
                    processed_jobs.discard(job_id)

    col_ref = db.collection(jobs_path)
    col_watch = col_ref.on_snapshot(on_snapshot)
    return col_watch

# ==========================================
# VERIFICADOR DE TAREAS (CRON NOCTURNO)
# ==========================================
def verify_stale_tasks(db):
    """
    Verifica las tareas cada hora, pero SOLO re-encola si 
    nos encontramos en la ventana nocturna (1 AM - 6 AM local).
    """
    local_hour = datetime.datetime.now().hour
    
    if 1 <= local_hour < 6:
        print(f"\n🌙 [NightCron] Hora {local_hour}:00, evaluando tareas > 24hs...")
    else:
        # En horas diurnas mantenemos silencio para no llenar los logs, o podemos 
        # printear un estado sutil ocasional.
        return
        
    jobs_path = f"artifacts/{APP_ID}/users/{USER_ID}/scan_jobs"
    
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        one_day_ago = now - datetime.timedelta(days=1, hours=20) # Añadimos cierto buffer al de un día para ser elásticos
        
        docs = db.collection(jobs_path).stream()
        requeued_count = 0
        
        for doc in docs:
            data = doc.to_dict()
            status = data.get("status")
            last_run_str = data.get("lastRunAt")
            
            # Reprogramamos si pasaron más de ~24hs
            if status in ["done", "scheduled", "error"] and last_run_str:
                try:
                    if last_run_str.endswith("Z"):
                        last_run_str = last_run_str[:-1] + "+00:00"
                    last_run = datetime.datetime.fromisoformat(last_run_str)
                    
                    if last_run < one_day_ago:
                        print(f"  🔄 [NightCron] Reprogramando tarea: {doc.id}")
                        doc.reference.update({
                            "status": "pending",
                            "message": "Re-ejecución automática nocturna iniciada."
                        })
                        requeued_count += 1
                except Exception as e:
                    print(f"  ⚠️ Error parseando fecha en tarea {doc.id}: {e}")
                    
        if requeued_count > 0:
            print(f"✅ [NightCron] {requeued_count} tareas enviadas a la Cola Secuencial.")
            
    except Exception as e:
        print(f"❌ [NightCron] Error: {e}")

def stale_tasks_loop(db):
    """Ejecuta el verificador en bucle cada hora."""
    while running:
        verify_stale_tasks(db)
        # Esperar 60 minutos (3600 segundos) para la siguiente evaluación
        for _ in range(3600):
            if not running:
                break
            time.sleep(1)

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

    # Iniciar el verificador de tareas en un hilo secundario
    verifier_thread = threading.Thread(target=stale_tasks_loop, args=(db,), daemon=True)
    verifier_thread.start()

    # Mantener el proceso vivo
    while running:
        time.sleep(1)

