import sys
import os
import argparse
import asyncio
import random
import datetime
import json
import urllib.parse
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from dotenv import load_dotenv
from supabase import create_client, Client

# Asegurar codificación UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Dominios por país
DOMAINS = {
    "cl": "https://www.amarillas.cl",
    "pe": "https://www.paginasamarillas.com.pe",
    "ar": "https://www.paginasamarillas.com.ar",
    "co": "https://www.paginasamarillas.com.co",
    "ec": "https://www.paginas-amarillas.com.ec",
    "sv": "https://www.paginasamarillas.com.sv",
    "gt": "https://www.paginasamarillas.com.gt",
    "ni": "https://www.paginasamarillas.com.ni",
    "pa": "https://www.paginasamarillas.com.pa",
}

def ts():
    """Devuelve timestamp actual para logs."""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

MASTER_CATEGORIES = [
    "restaurante", "cafeteria", "pasteleria", "bar", "sushi", "pizzeria", "comida rapida",
    "peluqueria", "barberia", "salon de belleza", "spa", "gimnasio", "clinica dental", "optica",
    "almacen", "minimarket", "veterinaria", "pet shop", "jugueteria", "taller mecanico",
    "servicio tecnico", "imprenta", "hotel", "hostal", "motel", "abogado", "contador"
]

# Inicialización de Supabase
load_dotenv()
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = None
if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        print(f"[{ts()}] [SUPABASE] ✅ Conectado exitosamente a la base de datos.", flush=True)
    except Exception as e:
        print(f"[{ts()}] [SUPABASE] ❌ Error al inicializar: {e}. Operando en modo local.", flush=True)
else:
    print(f"[{ts()}] [SUPABASE] ⚠️  Credenciales no encontradas en .env. Operando solo localmente.", flush=True)

def save_local_backup(country, business_id, data):
    backup_file = f"amarillas_businesses_{country}.json"
    all_data = {}
    
    if os.path.exists(backup_file):
        try:
            with open(backup_file, "r", encoding="utf-8") as f:
                all_data = json.load(f)
        except Exception:
            pass
            
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    # Preservar fecha de creación e incluir estado
    status = data.get("status", "pending")
    if business_id in all_data:
        data["created_at"] = all_data[business_id].get("created_at", now_str)
        data["status"] = all_data[business_id].get("status", status)
    else:
        data["created_at"] = now_str
        data["status"] = status
        
    data["last_seen"] = now_str
    
    # Serializar campos para JSON
    serialized_data = {}
    for k, v in data.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            serialized_data[k] = v.isoformat()
        else:
            serialized_data[k] = v
            
    all_data[business_id] = serialized_data
    
    try:
        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error guardando respaldo JSON local: {e}", flush=True)

def upsert_business(country, business_id, data):
    # Asegurar que data tenga status antes de guardarla localmente
    data["status"] = data.get("status", "pending")
    
    # Guardar en local siempre como respaldo
    save_local_backup(country, business_id, data.copy())
    
    # Intentar guardar en Supabase
    if supabase is not None:
        try:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            
            payload = {
                "id": f"{country}_{business_id}",
                "name": data["name"],
                "ficha_url": data["ficha_url"],
                "phones": data["phones"],
                "websites": data["websites"],
                "whatsapp": data["whatsapp"],
                "rubro": data.get("rubro", ""),
                "country": country,
                "status": data["status"],
                "raw_text": data["raw_text"],
                "last_seen": now
            }
            
            # Upsert inserta o actualiza basándose en la primary key 'id'
            response = (
                supabase.table("amarillas_businesses")
                .upsert(payload, on_conflict="id")
                .execute()
            )
            phones_str = ', '.join(data.get('phones', [])) or 'sin tel.'
            webs_str = ', '.join(data.get('websites', [])) or 'sin web'
            print(f"[{ts()}] ⚡ [INSERTADO] {data['name'][:40]!r} | 📞 {phones_str[:40]} | 🌐 {webs_str[:40]}", flush=True)
        except Exception as e:
            print(f"[{ts()}] ❌ [ERROR SUPABASE] {data.get('name','?')[:30]}: {e}", flush=True)
    else:
        print(f"[{ts()}] 💾 [LOCAL] {data['name'][:40]!r} guardado en JSON.", flush=True)

def get_business_id_from_url(url):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.strip("/")
    # Reemplaza barras con guiones bajos para tener un ID único y limpio
    safe_path = path.replace("/", "_")
    return safe_path

def load_checkpoint(country):
    checkpoint_file = f"scratch/amarillas_checkpoint_{country}.json"
    if os.path.exists(checkpoint_file):
        try:
            with open(checkpoint_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"current_category_idx": 0}

def save_checkpoint(country, idx):
    os.makedirs("scratch", exist_ok=True)
    checkpoint_file = f"scratch/amarillas_checkpoint_{country}.json"
    try:
        with open(checkpoint_file, "w") as f:
            json.dump({"current_category_idx": idx}, f)
    except Exception as e:
        print(f"Error guardando checkpoint: {e}", flush=True)

async def scrape_page_listings(page, rubro):
    # Script JS inteligente para extraer y agrupar datos por tarjeta
    js_extract = """() => {
        let results = [];
        let fichaLinks = Array.from(document.querySelectorAll('a[href*="/fichas/"], a[href*="/empresas/"]'));
        
        let seen = new Set();
        let uniqueLinks = [];
        for (let a of fichaLinks) {
            if (a.href && !seen.has(a.href) && a.innerText.trim().length > 0) {
                seen.add(a.href);
                uniqueLinks.push(a);
            }
        }
        
        for (let a of uniqueLinks) {
            let name = a.innerText.trim();
            let url = a.href;
            
            // Subir por el DOM buscando el contenedor de la tarjeta comercial
            let container = a.parentElement;
            let depth = 0;
            while (container && depth < 7) {
                let phones = container.querySelectorAll('a[href^="tel:"]');
                let webs = container.querySelectorAll('a[href*="http"]:not([href*="amarillas"]):not([href*="gurusoluciones"])');
                let wasap = container.querySelectorAll('a[href*="wa.me"]');
                if (phones.length > 0 || webs.length > 0 || wasap.length > 0) {
                    break;
                }
                container = container.parentElement;
                depth++;
            }
            
            let activeContainer = container || a.parentElement;
            
            // Teléfonos
            let phones = Array.from(activeContainer.querySelectorAll('a[href^="tel:"]')).map(el => {
                return el.href.replace('tel:', '').replace(/\\s+/g, '').trim();
            });
            // Remover duplicados
            phones = [...new Set(phones)];
            
            // Sitios Web
            let webs = Array.from(activeContainer.querySelectorAll('a[href*="http"]:not([href*="amarillas"]):not([href*="gurusoluciones"]):not([href*="google"]):not([href*="facebook"]):not([href*="instagram"]):not([href*="twitter"])')).map(el => el.href);
            webs = [...new Set(webs)];
            
            // WhatsApp
            let wasap = Array.from(activeContainer.querySelectorAll('a[href*="wa.me"]')).map(el => el.href);
            wasap = [...new Set(wasap)];
            
            let allText = activeContainer.innerText || "";
            
            results.push({
                name: name,
                ficha_url: url,
                phones: phones,
                websites: webs,
                whatsapp: wasap,
                raw_text: allText
            });
        }
        return results;
    }"""
    
    return await page.evaluate(js_extract)

async def run_scraper(country, limit_one_page=False, force_rubro=None):
    base_url = DOMAINS.get(country)
    if not base_url:
        print(f"Error: País '{country}' no está soportado. Países válidos: {list(DOMAINS.keys())}", flush=True)
        return
        
    print(f"\n==================================================================")
    print(f"INICIANDO CRAWLER AMARILLAS - PAIS: {country.upper()} | URL: {base_url}")
    print(f"==================================================================\n", flush=True)
    
    checkpoint = load_checkpoint(country)
    start_idx = checkpoint.get("current_category_idx", 0)
    
    categories = MASTER_CATEGORIES
    if force_rubro:
        categories = [force_rubro]
            
    async with async_playwright() as p:
        exec_path = '/usr/bin/chromium-browser' if os.path.exists('/usr/bin/chromium-browser') else None
        browser = await p.chromium.launch(headless=True, executable_path=exec_path)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        while True:
            checkpoint = load_checkpoint(country)
            start_idx = checkpoint.get("current_category_idx", 0)
            
            # Si el checkpoint indica que terminamos todos los rubros, reseteamos y dormimos 24 horas
            if start_idx >= len(categories) and not force_rubro and not limit_one_page:
                print(f"[CRAWLER] Todos los rubros escaneados. Reseteando checkpoint para el próximo ciclo...", flush=True)
                save_checkpoint(country, 0)
                
                total_sleep = 24 * 3600
                sleep_chunk = 120  # 2 minutos
                elapsed_sleep = 0
                while elapsed_sleep < total_sleep:
                    print(f"[CRAWLER] Espera diaria activa. Próximo ciclo en {(total_sleep - elapsed_sleep)/3600:.2f} horas...", flush=True)
                    await asyncio.sleep(sleep_chunk)
                    elapsed_sleep += sleep_chunk
                continue
            elif start_idx >= len(categories):
                break
                
            for idx in range(start_idx, len(categories)):
                rubro = categories[idx]
                print(f"[{ts()}] 🕷️  [RUBRO {idx+1}/{len(categories)}] Iniciando rubro: '{rubro.upper()}'...", flush=True)
                
                # Navegar a la primera página de resultados del rubro
                url = f"{base_url}/b/{rubro}"
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    await page.wait_for_timeout(3000)
                    print(f"[{ts()}] 🔗 [NAV] {page.url}", flush=True)
                except Exception as e:
                    print(f"[{ts()}] ❌ [NAV ERROR] {url}: {e}", flush=True)
                    continue
                    
                page_num = 1
                while True:
                    # Extraer los datos de la página actual
                    listings = await scrape_page_listings(page, rubro)
                    print(f"[{ts()}] 📄 [PAG {page_num}] Rubro '{rubro}' → {len(listings)} locales detectados", flush=True)
                    
                    # Guardar en base de datos
                    for item in listings:
                        business_id = get_business_id_from_url(item["ficha_url"])
                        item["rubro"] = rubro
                        upsert_business(country, business_id, item)
                        
                    if limit_one_page:
                        print("   [TEST] Limitado a una sola página. Terminando rubro.", flush=True)
                        break
                        
                    # Buscar botón "Siguiente" activo para avanzar
                    next_btn = page.locator("li.page-item-next:not(.disabled) a.page-link")
                    next_btn_count = await next_btn.count()
                    
                    if next_btn_count > 0 and await next_btn.first.is_visible():
                        # Polite Crawling Delay: Retraso aleatorio educado (entre 10 y 30 segundos)
                        delay = random.uniform(10.0, 30.0)
                        print(f"[{ts()}] ⏳ [DELAY] Esperando {delay:.1f}s antes de avanzar a página {page_num+1}...", flush=True)
                        await asyncio.sleep(delay)
                        
                        try:
                            print(f"[{ts()}] ➡️  [NAV] Avanzando a página {page_num+1}...", flush=True)
                            await next_btn.first.click()
                            await page.wait_for_timeout(4000) # Esperar a que cargue el contenido
                            page_num += 1
                        except Exception as e:
                            print(f"[{ts()}] ❌ [NAV] Error al avanzar: {e}. Fin de paginación.", flush=True)
                            break
                    else:
                        print(f"[{ts()}] ✅ [FIN RUBRO] '{rubro}' completado (sin más páginas).", flush=True)
                        break
                
                # Guardar checkpoint al finalizar exitosamente el rubro
                if not force_rubro and not limit_one_page:
                    save_checkpoint(country, idx + 1)
                    
                if limit_one_page or force_rubro:
                    break
            
            if limit_one_page or force_rubro:
                break
                
        await browser.close()
    
    print(f"[{ts()}] ✅ PROCESO TERMINADO EXITOSAMENTE PARA EL PAIS: {country.upper()}\n", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scraper de Páginas Amarillas (Guru Soluciones)")
    parser.add_argument("--country", type=str, default="cl", help="Código de país (cl, pe, ar, etc.)")
    parser.add_argument("--test", action="store_true", help="Si se activa, solo escanea la primera página del rubro")
    parser.add_argument("--rubro", type=str, default=None, help="Si se especifica, solo escanea este rubro e ignora checkpoint")
    
    args = parser.parse_args()
    asyncio.run(run_scraper(args.country.lower(), limit_one_page=args.test, force_rubro=args.rubro))
