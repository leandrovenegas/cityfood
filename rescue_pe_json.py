#!/usr/bin/env python3
"""Cuenta registros en el JSON de Perú recuperando solo los válidos."""
import json

path = '/home/lv/proyects/cityfood/amarillas_businesses_pe.json'

# Try loading fully
try:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        raw = f.read()
    
    # Try direct parse
    try:
        data = json.loads(raw)
        print(f'PE JSON OK: {len(data)} registros')
    except json.JSONDecodeError as e:
        print(f'JSON invalido en posicion {e.pos}. Intentando rescatar registros...')
        # Truncate to last valid character before error
        truncated = raw[:e.pos]
        # Find the last complete entry (closing brace + comma or closing brace before })
        last_brace = truncated.rfind('},')
        if last_brace == -1:
            last_brace = truncated.rfind('}')
        if last_brace > 0:
            fixed = truncated[:last_brace+1] + '}'
            try:
                data = json.loads(fixed)
                print(f'Rescatados: {len(data)} registros (de un JSON truncado)')
                # Save repaired file
                with open('/home/lv/proyects/cityfood/amarillas_businesses_pe_fixed.json', 'w', encoding='utf-8') as out:
                    json.dump(data, out, ensure_ascii=False)
                print('Guardado: amarillas_businesses_pe_fixed.json')
            except Exception as e2:
                print(f'No se pudo reparar: {e2}')
        else:
            print('No se encontro punto de corte válido.')
except Exception as e:
    print(f'Error leyendo archivo: {e}')
