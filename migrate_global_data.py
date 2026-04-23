import firebase_admin
from firebase_admin import credentials, firestore
import datetime

# Firebase Setup
try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def migrate():
    print("Iniciando migración de negocios globales...")
    businesses_ref = db.collection("artifacts/marketspider-v3/global_businesses")
    docs = businesses_ref.stream()
    
    unique_categories = set()
    batch = db.batch()
    batch_count = 0
    total_processed = 0
    
    for doc in docs:
        data = doc.to_dict()
        doc_ref = businesses_ref.document(doc.id)
        
        # Recolectar categoría
        cat = data.get("category", "")
        if cat and isinstance(cat, str):
            unique_categories.add(cat.strip())
            
        # Añadir name_lower si no existe o actualizar
        name = data.get("name", "")
        name_lower = name.lower() if name else ""
        
        batch.update(doc_ref, {"name_lower": name_lower})
        batch_count += 1
        total_processed += 1
        
        if batch_count >= 400:
            batch.commit()
            print(f"Commit batch de 400. Total procesados: {total_processed}")
            batch = db.batch()
            batch_count = 0
            
    if batch_count > 0:
        batch.commit()
        print(f"Commit final. Total procesados: {total_processed}")
        
    print(f"Total categorías únicas encontradas: {len(unique_categories)}")
    
    # Guardar categorías
    meta_ref = db.collection("artifacts/marketspider-v3/meta").document("categories")
    meta_ref.set({"list": sorted(list(unique_categories)), "updated_at": datetime.datetime.now()})
    print("Categorías guardadas en artifacts/marketspider-v3/meta/categories")
    
if __name__ == "__main__":
    migrate()
