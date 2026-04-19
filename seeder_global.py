import h3
import firebase_admin
from firebase_admin import credentials, firestore
import datetime

# Inicializar Firebase
try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
except ValueError:
    pass

db = firestore.client()

def seed_h3_grid():
    bbox = [
        (-32.915, -71.554), # Norte Concón
        (-32.915, -71.350), # Norte interior (Villa Alemana)
        (-33.150, -71.350), # Sur interior (Placilla / Curauma Este)
        (-33.150, -71.650), # Sur costa (Laguna Verde)
    ]
    
    poly = h3.LatLngPoly(bbox)
    cells = h3.polygon_to_cells(poly, 9)
    print(f"| Generando malla H3 nivel 9. Total celdas H3: {len(cells)}")
    
    collection_ref = db.collection(f"artifacts/marketspider-v3/global_job_queue")
    
    batch = db.batch()
    batch_count = 0
    total_added = 0
    
    print(" Subiendo a Firestore (esto tomara uns segundos)...")
    
    for cell in cells:
        lat, lng = h3.cell_to_latlng(cell)
        doc_ref = collection_ref.document(cell)
        
        batch.set(doc_ref, {
            "id": cell,
            "status": "pending",
            "lat": lat,
            "lng": lng,
            "attempts": 0,
            "created_at": datetime.datetime.now(datetime.timezone.utc),
            "last_run": None,
        }, merge=True)
        
        batch_count += 1
        total_added += 1
        
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
            print(f"  > {total_added}/{len(cells)} subidos...")

    if batch_count > 0:
        batch.commit()
        print(f"  > {total_added}/{len(cells)} subidos...")
        
    print("X Grid H3 sembrada con exito en Firestore. Coleccion: global/job_queue")

if __name__ == "__main__":
    seed_h3_grid()
