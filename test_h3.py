import h3

bbox = [
    (-32.915, -71.554), # Norte Concón
    (-32.915, -71.350), # Norte interior (Villa Alemana)
    (-33.150, -71.350), # Sur interior (Placilla / Curauma Este)
    (-33.150, -71.650), # Sur costa (Laguna Verde)
]

try:
    # V4 API Uses Polygon
    poly = h3.Polygon(bbox)
    cells = h3.polygon_to_cells(poly, 9)
    print(f"Generadas {len(cells)} celdas con h3.Polygon")
except Exception as e:
    print(f"Error Polygon: {e}")
    # GeoJSON like object?
    try:
        geo = {
            "type": "Polygon",
            "coordinates": [ [[lng, lat] for lat, lng in bbox] ]
        }
        cells = h3.polygon_to_cells(geo, 9)
        print(f"Generadas con dict")
    except Exception as e2:
        print(f"Error dict: {e2}")

