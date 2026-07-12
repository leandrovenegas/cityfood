import json
import re
import sys

# Reconfigure stdout to use UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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

def test():
    data = json.load(open('global_businesses.json', encoding='utf-8'))
    
    phone_count = 0
    hours_count = 0
    address_count = 0
    clean_cat_count = 0
    
    classified = []
    
    for doc in data:
        cat = doc.get("category", "")
        if not cat:
            continue
            
        if is_phone_number(cat):
            phone_count += 1
            classified.append(("phone", cat, doc.get("name")))
        elif is_opening_hours(cat):
            hours_count += 1
            classified.append(("hours", cat, doc.get("name")))
        elif is_address(cat):
            address_count += 1
            classified.append(("address", cat, doc.get("name")))
        else:
            clean_cat_count += 1
            
    print(f"Total classified:")
    print(f"  Phones: {phone_count}")
    print(f"  Hours: {hours_count}")
    print(f"  Address: {address_count}")
    print(f"  Clean Categories: {clean_cat_count}")
    print("\nSample Phones:")
    for item in [c for c in classified if c[0] == "phone"][:10]:
        print(f"  {item[1]} -> {item[2]}")
    print("\nSample Hours:")
    for item in [c for c in classified if c[0] == "hours"][:10]:
        print(f"  {item[1]} -> {item[2]}")
    print("\nSample Address:")
    for item in [c for c in classified if c[0] == "address"][:10]:
        print(f"  {item[1]} -> {item[2]}")

if __name__ == "__main__":
    test()
