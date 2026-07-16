#!/usr/bin/env python3
"""
check_and_migrate.py
Compara los datos locales de los .json contra Supabase y sube los faltantes.
Se puede correr varias veces de forma segura (usa upsert).
"""
import os
import json
import sys
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    print("[ERROR] Falta la librería 'supabase'. Instala con: pip install supabase")
    sys.exit(1)

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    print("[ERROR] Credenciales de Supabase no encontradas en .env")
    sys.exit(1)

db = create_client(url, key)

FILES = [
    ("amarillas_businesses_cl.json", "amarillas_businesses", "cl"),
    ("amarillas_businesses_pe.json", "amarillas_businesses", "pe"),
]

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def load_json(filename):
    """Carga un .json con detección de encoding."""
    for enc in ['utf-8', 'utf-8-sig', 'latin-1']:
        try:
            with open(filename, "r", encoding=enc) as f:
                return json.load(f)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            log(f"Fallo encoding {enc} en {filename}: {e}")
    return None

def get_supabase_count(table, country_col, country_val):
    """Cuenta cuántos registros existen en Supabase para ese país."""
    try:
        res = db.table(table).select("id", count="exact").eq(country_col, country_val).execute()
        return res.count
    except Exception as e:
        log(f"Error contando en Supabase: {e}")
        return -1

def get_existing_ids(table, country_col, country_val):
    """Obtiene todos los IDs que ya están en Supabase para ese país (en páginas)."""
    ids = set()
    page_size = 1000
    offset = 0
    while True:
        try:
            res = (
                db.table(table)
                .select("id")
                .eq(country_col, country_val)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            batch = res.data
            if not batch:
                break
            for row in batch:
                ids.add(row["id"])
            offset += page_size
            if len(batch) < page_size:
                break
        except Exception as e:
            log(f"Error paginando IDs: {e}")
            break
    return ids

def upsert_batch(table, records):
    """Sube un lote usando upsert (no falla si ya existe)."""
    db.table(table).upsert(records, on_conflict="id").execute()

def migrate_file(file_name, table, country):
    log(f"=== Procesando: {file_name} → tabla '{table}' (país: {country.upper()}) ===")

    if not os.path.exists(file_name):
        log(f"[SKIP] Archivo '{file_name}' no encontrado.")
        return

    data = load_json(file_name)
    if data is None:
        log(f"[ERROR] No se pudo parsear '{file_name}'.")
        return

    local_count = len(data)
    log(f"[LOCAL] {local_count} registros en el archivo JSON.")

    supabase_count = get_supabase_count(table, "country", country)
    log(f"[SUPABASE] {supabase_count} registros ya en la base de datos.")

    if supabase_count == local_count:
        log(f"[OK] Totales coinciden. No hay nada que migrar para {country.upper()}.")
        return

    log(f"[DIFF] Faltan {local_count - supabase_count} registros. Obteniendo IDs existentes...")
    existing_ids = get_existing_ids(table, "country", country)
    log(f"[IDS] {len(existing_ids)} IDs cargados desde Supabase.")

    # Filtrar solo los que faltan
    missing = []
    for key_id, record in data.items():
        if key_id not in existing_ids:
            record["id"] = key_id
            record["country"] = country
            missing.append(record)

    log(f"[MISSING] {len(missing)} registros para insertar.")

    if not missing:
        log("[OK] No hay registros faltantes (conteo ya coincide).")
        return

    # Subir en lotes de 500
    batch_size = 500
    total_inserted = 0
    for i in range(0, len(missing), batch_size):
        batch = missing[i:i + batch_size]
        try:
            upsert_batch(table, batch)
            total_inserted += len(batch)
            log(f"[UPLOAD] Lote {i // batch_size + 1} OK → {total_inserted}/{len(missing)} insertados")
        except Exception as e:
            log(f"[ERROR] Fallo en lote {i // batch_size + 1}: {e}")

    log(f"[DONE] {total_inserted} registros insertados para {country.upper()}.")

if __name__ == "__main__":
    log("Iniciando verificación y migración de datos locales → Supabase")
    for file_name, table, country in FILES:
        migrate_file(file_name, table, country)
    log("Proceso finalizado.")
