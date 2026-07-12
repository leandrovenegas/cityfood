import firebase_admin
from firebase_admin import credentials, firestore
import json
import datetime
import os

# Configuración de Firebase
import os
from dotenv import load_dotenv

load_dotenv()
SERVICE_ACCOUNT_FILE = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
COLLECTION_PATH = 'artifacts/marketspider-v3/global_businesses'
OUTPUT_FILE = 'global_businesses.json'

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    raise TypeError ("Type %s not serializable" % type(obj))

def export_businesses():
    print(f"Conectando a Firebase usando {SERVICE_ACCOUNT_FILE}...")
    
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        print(f"Error: No se encontró el archivo {SERVICE_ACCOUNT_FILE}")
        return

    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        print(f"Obteniendo negocios de la colección: {COLLECTION_PATH}...")
        businesses_ref = db.collection(COLLECTION_PATH)
        docs = businesses_ref.stream()
        
        businesses = []
        count = 0
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            businesses.append(data)
            count += 1
            if count % 100 == 0:
                print(f"Descargados {count} negocios...")
        
        print(f"Total de negocios recopilados: {len(businesses)}")
        
        print(f"Guardando datos en {OUTPUT_FILE}...")
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(businesses, f, indent=4, ensure_ascii=False, default=json_serial)
        
        print("¡Exportación completada con éxito!")
        
    except Exception as e:
        print(f"Error durante la exportación: {e}")

if __name__ == "__main__":
    export_businesses()
