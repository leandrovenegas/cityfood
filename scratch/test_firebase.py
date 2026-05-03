import firebase_admin
from firebase_admin import credentials, firestore
import sys

SERVICE_ACCOUNT_FILE = 'serviceAccountKey.json'

try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    # Intenta leer una colección (cualquiera) para verificar permisos
    print("Intentando conectar a Firebase...")
    collections = db.collections()
    print("Conexion exitosa. Colecciones encontradas:")
    for coll in collections:
        print(f" - {coll.id}")
    
    print("\nLos permisos parecen estar bien.")
except Exception as e:
    print(f"Error conectando a Firebase: {e}")
    sys.exit(1)
