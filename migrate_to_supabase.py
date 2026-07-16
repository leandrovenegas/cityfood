import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno
load_dotenv()

url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key: str = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    print("Error: Credenciales de Supabase no encontradas en .env")
    exit(1)

supabase: Client = create_client(url, key)

files_to_migrate = [
    ("amarillas_businesses_cl.json", "cl"),
    ("amarillas_businesses_pe.json", "pe"),
]

def migrate():
    total_migrated = 0
    
    for file_name, country in files_to_migrate:
        if not os.path.exists(file_name):
            print(f"[{country}] Archivo {file_name} no existe, saltando.")
            continue
            
        print(f"[{country}] Leyendo archivo {file_name}...")
        try:
            with open(file_name, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"[{country}] Error leyendo JSON: {e}")
            continue
            
        print(f"[{country}] {len(data)} registros encontrados. Subiendo a Supabase en lotes...")
        
        # Convert dictionary to list of dicts for Supabase
        records_to_insert = []
        for key_id, record in data.items():
            # Add ID and country if missing
            record['id'] = key_id
            record['country'] = country
            
            # Format datetime strings to ISO format compatible with Postgres TIMESTAMPTZ
            # Usually they are already in ISO format from the spider
            
            # Supabase upsert requires a clean dict
            records_to_insert.append(record)
            
        # Insert in batches of 1000
        batch_size = 1000
        for i in range(0, len(records_to_insert), batch_size):
            batch = records_to_insert[i:i + batch_size]
            try:
                # Upsert is safer in case we run the script twice
                response = (
                    supabase.table("amarillas_businesses")
                    .upsert(batch, on_conflict="id")
                    .execute()
                )
                print(f"[{country}] Lote {i//batch_size + 1} insertado con éxito ({len(batch)} registros).")
                total_migrated += len(batch)
            except Exception as e:
                print(f"[{country}] Error insertando lote {i//batch_size + 1}: {e}")
                
    print(f"\nMigración completada. Total registros insertados: {total_migrated}")

if __name__ == "__main__":
    migrate()
