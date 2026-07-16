#!/usr/bin/env python3
"""Migra el JSON reparado de Perú a Supabase."""
import json, os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
db = create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

log('Cargando JSON reparado de Perú...')
with open('/home/lv/proyects/cityfood/amarillas_businesses_pe_fixed.json', encoding='utf-8') as f:
    data = json.load(f)

log(f'JSON: {len(data)} registros rescatados.')

# IDs ya en Supabase
log('Obteniendo IDs existentes en Supabase (PE)...')
existing = set()
offset = 0
while True:
    r = db.table('amarillas_businesses').select('id').eq('country','pe').range(offset, offset+999).execute()
    for row in r.data:
        existing.add(row['id'])
    if len(r.data) < 1000:
        break
    offset += 1000

log(f'Supabase tiene {len(existing)} registros PE.')

missing = [(k, v) for k, v in data.items() if k not in existing]
log(f'Faltantes: {len(missing)} registros para insertar.')

if not missing:
    log('Todo ya está sincronizado. Nada que hacer.')
else:
    batch_size = 500
    total = 0
    for i in range(0, len(missing), batch_size):
        batch_kv = missing[i:i+batch_size]
        records = []
        for k, v in batch_kv:
            v['id'] = k
            v['country'] = 'pe'
            records.append(v)
        try:
            db.table('amarillas_businesses').upsert(records, on_conflict='id').execute()
            total += len(records)
            log(f'Lote {i//batch_size+1} OK → {total}/{len(missing)} insertados')
        except Exception as e:
            log(f'Error en lote {i//batch_size+1}: {e}')

log('Migracion PE finalizada.')
