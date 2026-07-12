import sys
print("INICIANDO DEEP SPIDER...")
import asyncio
import re
import datetime
from playwright.async_api import async_playwright
import firebase_admin
from firebase_admin import credentials, firestore

import os
from dotenv import load_dotenv

load_dotenv()

# Firebase Setup
try:
    key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def fetch_and_lock_deep_job():
    queue_ref = db.collection("artifacts/marketspider-v3/deep_scan_queue")
    docs = queue_ref.where("status", "==", "pending").limit(1).get() 
    for doc in docs:
        snapshot = doc.to_dict()
        if snapshot.get("attempts", 0) < 3:
            doc.reference.update({
                "status": "processing",
                "last_run": datetime.datetime.now(datetime.timezone.utc),
                "attempts": snapshot.get("attempts", 0) + 1
            })
            return {"id": doc.id, **snapshot}
        else:
            doc.reference.update({"status": "failed"})
    return None

async def get_next_job():
    return await asyncio.to_thread(fetch_and_lock_deep_job)

def update_lead(user_id, lead_id, deep_data, job_id):
    # Actualizamos el documento del lead en el CRM
    lead_ref = db.collection(f"artifacts/marketspider-v3/users/{user_id}/crm_leads").document(lead_id)
    lead_ref.update({
        "deepScrape": deep_data,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    # Marcamos el job como completado
    job_ref = db.collection("artifacts/marketspider-v3/deep_scan_queue").document(job_id)
    job_ref.update({
        "status": "completed",
        "completedAt": datetime.datetime.now(datetime.timezone.utc)
    })

def mark_failed(job_id, error_msg):
    job_ref = db.collection("artifacts/marketspider-v3/deep_scan_queue").document(job_id)
    job_ref.update({
        "status": "failed",
        "error": error_msg,
        "completedAt": datetime.datetime.now(datetime.timezone.utc)
    })

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
        browser = await p.chromium.launch(headless=True)
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
