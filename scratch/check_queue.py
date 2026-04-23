import firebase_admin
from firebase_admin import credentials, firestore

try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
except:
    pass

db = firestore.client()
queue_ref = db.collection(f"artifacts/marketspider-v3/global_job_queue")
# Contar pendientes
pending = queue_ref.where("status", "==", "pending").limit(5).get()
print(f"DEBUG: Encontradas {len(pending)} celdas con status='pending'")
for p in pending:
    print(f" - Celda: {p.id}")
