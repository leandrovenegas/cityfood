import sys
print("INICIANDO DEEP SPIDER...")
import asyncio
import re
import datetime
from playwright.async_api import async_playwright

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

def fetch_and_lock_deep_job():
    try:
        response = supabase.table("deep_scan_queue").select("*").eq("status", "pending").limit(1).execute()
        
        if response.data and len(response.data) > 0:
            snapshot = response.data[0]
            attempts = snapshot.get("attempts") or 0
            
            if attempts < 3:
                now = datetime.datetime.now(datetime.timezone.utc).isoformat()
                supabase.table("deep_scan_queue").update({
                    "status": "processing",
                    "last_run": now,
                    "attempts": attempts + 1
                }).eq("id", snapshot["id"]).execute()
                return snapshot
            else:
                supabase.table("deep_scan_queue").update({"status": "failed"}).eq("id", snapshot["id"]).execute()
    except Exception as e:
        print(f"Error en fetch_and_lock_deep_job: {e}")
    return None

async def get_next_job():
    return await asyncio.to_thread(fetch_and_lock_deep_job)

def update_lead(user_id, lead_id, deep_data, job_id):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        # Actualizamos el documento del lead en el CRM
        supabase.table("crm_leads").update({
            "deepScrape": deep_data,
            "updatedAt": now
        }).eq("id", lead_id).execute()
        
        # Marcamos el job como completado
        supabase.table("deep_scan_queue").update({
            "status": "completed",
            "completedAt": now
        }).eq("id", job_id).execute()
    except Exception as e:
        print(f"Error en update_lead: {e}")

def mark_failed(job_id, error_msg):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        supabase.table("deep_scan_queue").update({
            "status": "failed",
            "error": error_msg,
            "completedAt": now
        }).eq("id", job_id).execute()
    except Exception as e:
        print(f"Error en mark_failed: {e}")

async def process_url(page, url):
    print(f"  -> Navegando a: {url}")
    # Normalize url
    if not url.startswith('http'):
        url = 'https://' + url
        
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  -> Error al cargar la pagina principal: {e}")
        return None

    # Esperar un momento a que cargue el contenido dinamico
    await asyncio.sleep(3)

    # 1. Extraer Emails
    js_extract = r"""() => {
        const text = document.body.innerText || "";
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        const matched = text.match(emailRegex) || [];
        
        // Also look for mailto links
        const mailtos = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href.replace('mailto:', '').split('?')[0]);
        
        return Array.from(new Set([...matched, ...mailtos]));
    }"""
    emails_raw = await page.evaluate(js_extract)
    # Filtrar falsos positivos (ej. imagenes con @2x, etc)
    emails = [e for e in emails_raw if e.endswith('.com') or e.endswith('.cl') or e.endswith('.net') or e.endswith('.org')]
    emails = list(set([e.lower() for e in emails]))

    # 2. Extraer Redes Sociales
    js_social = """() => {
        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
        const socials = new Set();
        links.forEach(href => {
            if (href.includes('instagram.com/') || 
                href.includes('facebook.com/') || 
                href.includes('tiktok.com/') || 
                href.includes('linkedin.com/in/') ||
                href.includes('linkedin.com/company/')) {
                // remove query params
                socials.add(href.split('?')[0]);
            }
        });
        return Array.from(socials);
    }"""
    socials = await page.evaluate(js_social)

    # 3. Contar Videos (Etiqueta HTML5 o iframes de YT/Vimeo)
    js_video = """() => {
        const nativeVideos = document.querySelectorAll('video').length;
        const ytVideos = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="vimeo.com"]').length;
        return nativeVideos + ytVideos;
    }"""
    video_count = await page.evaluate(js_video)

    return {
        "emails": emails,
        "socials": socials,
        "video_count": video_count,
        "scrapedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

async def worker(worker_id):
    async with async_playwright() as p:
        # Usar executable_path para usar el Chromium del sistema (en linux)
        exec_path = '/usr/bin/chromium-browser' if os.path.exists('/usr/bin/chromium-browser') else None
        
        browser = await p.chromium.launch(
            headless=True,
            executable_path=exec_path
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 DeepSpider/1.0"
        )
        page = await context.new_page()
        
        while True:
            job = await get_next_job()
            now_ts = datetime.datetime.now().strftime('%H:%M:%S')
            
            if not job:
                # print(f"[{now_ts}] [DS-{worker_id}] No hay sitios web en cola. Durmiendo 5s...")
                await asyncio.sleep(5)
                continue
                
            job_id = job.get("id")
            url = job.get("url")
            lead_id = job.get("leadId")
            user_id = job.get("userId")
            
            print(f"\n[{now_ts}] [DS-{worker_id}] 🕸️ INICIANDO DEEP SCAN: {url}")
            
            try:
                deep_data = await process_url(page, url)
                if deep_data:
                    await asyncio.to_thread(update_lead, user_id, lead_id, deep_data, job_id)
                    print(f"[{now_ts}] [DS-{worker_id}] ✅ ÉXITO: Encontrados {len(deep_data['emails'])} emails, {len(deep_data['socials'])} RRSS, {deep_data['video_count']} videos.")
                else:
                    await asyncio.to_thread(mark_failed, job_id, "No se pudo cargar la pagina")
                    print(f"[{now_ts}] [DS-{worker_id}] ❌ FALLO: No se pudo cargar.")
                    
            except Exception as e:
                print(f"[{now_ts}] [DS-{worker_id}] ❌ ERROR CRÍTICO: {e}")
                await asyncio.to_thread(mark_failed, job_id, str(e))
                
        await browser.close()

async def main():
    print("\n--------------------------------------------------------------")
    print("DEEP SPIDER v1 - Extractor de Contactos y Redes Sociales")
    print("--------------------------------------------------------------")
    print("Levantando worker de Playwright...\n")
    # Para deep scraping usamos solo 1 worker por ahora para evitar saturar la memoria local
    await worker(1)

if __name__ == "__main__":
    asyncio.run(main())
