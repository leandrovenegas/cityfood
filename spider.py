import json
import random
import datetime
from google.cloud import firestore
import firebase_admin
from firebase_admin import credentials

# ==========================================
# CONFIGURACIÓN
# ==========================================
# 1. Ve a Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
# 2. Guarda el archivo .json en la misma carpeta que este script y ponle el nombre correcto:
SERVICE_ACCOUNT_FILE = 'serviceAccountKey.json'

# IMPORTANTE: Como la web usa Autenticación Anónima, cada vez que entras se crea un User ID único (o se mantiene si la sesión persiste).
# Debes revisar tu Firebase Authentication o la consola del navegador para copiar tu 'uid' y pegarlo aquí:
USER_ID = "PEGAR_TU_UID_AQUI" 

APP_ID = "marketspider-v3"
CATEGORY = "Restaurantes"
LOCATION = "Centro de la Ciudad"

# ==========================================
# LÓGICA DE NEGOCIO (CALCULADORA DE SCORE)
# ==========================================
def calculate_visual_score(has_video: bool, num_photos: int, last_photo_days_ago: int) -> int:
    """
    Cálculo de Visual Health Score:
    +40 pts si tiene Video.
    +30 pts según cantidad de fotos (1 pt por foto, max 30).
    +30 pts si tiene fotos recientes (< 1 mes, es decir <= 30 días).
    """
    score = 0
    
    # 1. Video (+40)
    if has_video:
        score += 40
        
    # 2. Cantidad de fotos (+30 max)
    score += min(num_photos, 30)
    
    # 3. Fotos recientes (+30)
    if last_photo_days_ago <= 30:
        score += 30
        
    return score

def determine_opportunity(score: int, has_video: bool, last_photo_days_ago: int) -> str:
    if score >= 80:
        return "Mantenimiento Visual"
    if not has_video and last_photo_days_ago > 30:
        return "Video + Refresh de Fotos"
    if not has_video:
        return "Video Promocional"
    return "Refresco de Contenido"

# ==========================================
# GENERADOR DE DATOS SIMULADOS (MOCK SCRAPER)
# ==========================================
def run_spider():
    print("🕷️  Iniciando Web Spider (Modo Simulación)...")
    names = ["Pizzería Luigi", "El Rincón del Asado", "Sushi Go", "Tacos El Chato", "Burger Station", "Café Vintage", "Wok Ninja"]
    
    places = []
    
    for rank, name in enumerate(names, start=1):
        # Generar datos aleatorios que simulan la extracción
        has_video = random.choice([True, False])
        num_photos = random.randint(5, 50)
        last_photo_days_ago = random.randint(5, 90)
        rating = round(random.uniform(3.5, 4.9), 1)
        reviews = random.randint(10, 500)
        
        # Calcular fecha en formato ISO para lastPhoto
        last_photo_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=last_photo_days_ago)
        last_photo_str = last_photo_date.strftime("%Y-%m-%d")
        
        # Evaluar
        score = calculate_visual_score(has_video, num_photos, last_photo_days_ago)
        opp_type = determine_opportunity(score, has_video, last_photo_days_ago)
        
        place = {
            "rank": rank,
            "name": name,
            "rating": rating,
            "reviews": reviews,
            "visualScore": score,
            "hasVideo": has_video,
            "lastPhoto": last_photo_str,
            "opportunityType": opp_type
        }
        places.append(place)
        print(f"[{rank}] Extrayendo {name}... Score: {score}/100")
        
    # Construir objeto JSON principal
    scan_data = {
        "category": CATEGORY,
        "location": LOCATION,
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "places": places
    }
    
    return scan_data

# ==========================================
# INTEGRACIÓN CON FIREBASE
# ==========================================
def upload_to_firestore(scan_data):
    if USER_ID == "PEGAR_TU_UID_AQUI":
        print("❌ ERROR: Debes cambiar el valor de USER_ID en spider.py por el UID de Firebase de tu usuario anónimo.")
        return

    try:
        print("\n🔥 Conectando con Firebase Firestore...")
        cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        # Colección: /artifacts/{APP_ID}/users/{userId}/scans
        collection_path = f"artifacts/{APP_ID}/users/{USER_ID}/scans"
        
        print(f"⬆️  Subiendo datos a {collection_path} ...")
        # Generamos un ID automático para el documento o usamos add()
        ref = db.collection(collection_path).document()
        ref.set(scan_data)
        
        print("✅ ¡Exito! Escaneo guardado en Firebase.")
        
    except FileNotFoundError:
        print(f"❌ ERROR: No se encontró el archivo de credenciales '{SERVICE_ACCOUNT_FILE}'.")
        print("Descárgalo desde la consola de Firebase e indícale la ruta correcta en el script.")
    except Exception as e:
        print(f"❌ ERROR inesperado: {e}")

if __name__ == "__main__":
    data = run_spider()
    upload_to_firestore(data)
