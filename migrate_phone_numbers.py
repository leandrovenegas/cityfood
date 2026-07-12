import sys
import re
import firebase_admin
from firebase_admin import credentials, firestore

# Configuración de codificación para consola Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import os
from dotenv import load_dotenv

load_dotenv()

print("INICIANDO MIGRACIÓN DE TELÉFONOS Y CATEGORÍAS EN FIRESTORE...")

try:
    key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def is_phone_number(val: str) -> bool:
    if not val:
        return False
    cleaned = re.sub(r'[\s\(\)\-\+]', '', val)
    if cleaned.isdigit() and 7 <= len(cleaned) <= 15:
        return True
    return False

def is_opening_hours(val: str) -> bool:
    if not val:
        return False
    val_lower = val.lower()
    keywords = ["cierra a", "abre a", "abierto", "cerrado", "p.m.", "a.m.", "hs", "horas"]
    if any(kw in val_lower for kw in keywords):
        return True
    return False

def is_address(val: str) -> bool:
    if not val:
        return False
    val_lower = val.lower()
    keywords = ["av.", "avenida", "calle", "pasaje", "camino", "ruta", "nº", "#", "depto", "oficina", "cra.", "cl.", "nro"]
    if any(kw in val_lower for kw in keywords):
        return True
    if len(val) > 12 and any(c.isdigit() for c in val) and ' ' in val:
        return True
    return False

def run_migration():
    businesses_ref = db.collection("artifacts/marketspider-v3/global_businesses")
    docs = businesses_ref.stream()
    
    count = 0
    updated = 0
    
    batch = db.batch()
    batch_count = 0
    
    for doc in docs:
        count += 1
        data = doc.to_dict()
        doc_id = doc.id
        
        category = data.get("category", "")
        phone = data.get("phone", "")
        hours = data.get("hours", "")
        
        updates = {}
        
        if category:
            if is_phone_number(category):
                # Es un teléfono. Mover a 'phone' y limpiar 'category'
                updates["phone"] = category
                updates["category"] = ""
                # Si el needScore original asumía que no tenía teléfono (o queremos recalcularlo)
                # en general podemos actualizarlo.
            elif is_opening_hours(category):
                # Son horas. Guardar en 'hours' y limpiar 'category'
                updates["hours"] = category
                updates["category"] = ""
            elif is_address(category):
                # Es una dirección. Limpiar 'category'
                updates["category"] = ""
                if "address" not in data or not data["address"]:
                    updates["address"] = category
        
        if updates:
            batch.update(doc.reference, updates)
            batch_count += 1
            updated += 1
            
            if batch_count >= 400:
                print(f"Enviando lote de {batch_count} actualizaciones a Firestore...")
                batch.commit()
                batch = db.batch()
                batch_count = 0
                
    if batch_count > 0:
        print(f"Enviando lote final de {batch_count} actualizaciones a Firestore...")
        batch.commit()
        
    print(f"\n✅ MIGRACIÓN EN FIRESTORE COMPLETADA.")
    print(f"Total escaneados: {count}")
    print(f"Total actualizados: {updated}")

if __name__ == "__main__":
    run_migration()
