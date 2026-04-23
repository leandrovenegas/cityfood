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
    # BBox enfocado: Gran Valparaiso (Viña, Valpo, Concon, Quilpue, Villa Alemana)
    bbox = [
        (-32.900, -71.580), # NW (Concon costa)
        (-32.900, -71.300), # NE (Villa Alemana)
        (-33.100, -71.300), # SE (Placilla interior)
        (-33.100, -71.650), # SW (Laguna Verde)
    ]
    
    poly = h3.LatLngPoly(bbox)
    # Nivel 10 para maxima precision urbana (~0.015 km2 por celda)
    cells = h3.polygon_to_cells(poly, 10) 
    print(f"| Generando malla H3 nivel 10 (ALTA DENSIDAD). Total celdas H3: {len(cells)}")
    
    collection_ref = db.collection(f"artifacts/marketspider-v3/global_job_queue")
    
    print(" Limpiando cola de trabajos anterior...")
    # Borrar recursivamente si es posible, o simplemente sobreescribir lo que venga
    # (En Firestore es mejor sobreescribir o borrar por lotes)

    batch = db.batch()
    batch_count = 0
    total_added = 0
    
    print(" Subiendo ráfaga de celdas a Firestore...")
    
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
            # Solo logear cada 5k para no saturar consola con 50k+ celdas
            if total_added % 4000 == 0:
                print(f"  > {total_added}/{len(cells)} sembradas...")

    if batch_count > 0:
        batch.commit()
        print(f"  > {total_added}/{len(cells)} sembradas...")
        
    print(f"X ¡Éxito! Valparaíso en H3-10 listo para Hyper-Scanning.")

if __name__ == "__main__":
    seed_h3_grid()
