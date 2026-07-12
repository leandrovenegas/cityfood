import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

print("INICIANDO MIGRACION DE DATOS: Calculando Need Scores...")

try:
    key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def run_migration():
    businesses_ref = db.collection("artifacts/marketspider-v3/global_businesses")
    docs = businesses_ref.stream()
    
    count = 0
    updated = 0
    
    for doc in docs:
        count += 1
        data = doc.to_dict()
        
        # Omitir los que ya estan en CRM o descartados
        if data.get("status") in ["crm", "discarded"]:
            continue
            
        # Calcular Need Score
        need_score = 0
        
        rating = data.get("rating", 0)
        if rating > 0 and rating < 4.0: need_score += 25
        
        # Asignar puntajes extra por cosas que todavia no sabemos o si sabemos que fallan
        if data.get("hasVideo") is False: need_score += 30
        elif "hasVideo" not in data: need_score += 30 # default
        
        if not data.get("website") and not data.get("url"): need_score += 20
        elif "website" not in data and "url" not in data: need_score += 20 # default
        
        if data.get("claimed") is False: need_score += 15
        elif "claimed" not in data: need_score += 15 # default
        
        # Actualizar en Firebase
        doc.reference.update({
            "status": "pending",
            "needScore": need_score
        })
        
        updated += 1
        if updated % 100 == 0:
            print(f"Progreso: {updated} locales actualizados...")

    print(f"\n✅ MIGRACIÓN COMPLETADA. Se escanearon {count} locales y se actualizaron {updated}.")

if __name__ == "__main__":
    run_migration()
