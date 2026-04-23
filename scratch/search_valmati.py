import firebase_admin
from firebase_admin import credentials, firestore

try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
except:
    pass

db = firestore.client()
USER_ID = "Hp1YGeni2DgiWrtrIKUgmgki7UL2"
scans_ref = db.collection(f"artifacts/marketspider-v3/users/{USER_ID}/scans")
docs = scans_ref.stream()

found = False
for doc in docs:
    data = doc.to_dict()
    places = data.get("places", [])
    for p in places:
        if "valmati" in p.get("name", "").lower():
            print(f"FOUND: {p['name']} in scan {doc.id} ({data.get('category')} in {data.get('location')})")
            found = True

if not found:
    print("NOT FOUND: No business named 'Valmati' found in current scans.")
