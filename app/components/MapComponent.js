'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Globe, Star } from 'lucide-react';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function MapComponent({ places }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const validPlaces = places.filter(p => p && p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
  
  if (validPlaces.length === 0) {
    return (
      <div className="h-[600px] w-full bg-slate-900 rounded-2xl flex items-center justify-center border border-dashed border-slate-800 text-slate-500">
        <p>No hay coordenadas válidas para mostrar en el mapa de esta búsqueda.</p>
      </div>
    );
  }

  const centerLat = validPlaces.reduce((sum, p) => sum + p.lat, 0) / validPlaces.length;
  const centerLng = validPlaces.reduce((sum, p) => sum + p.lng, 0) / validPlaces.length;

  return (
    <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-800 z-0 relative shadow-2xl">
      <MapContainer center={[centerLat, centerLng]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validPlaces.map((place, idx) => (
          <Marker key={`${place.name}-${idx}`} position={[place.lat, place.lng]} icon={customIcon}>
            <Popup>
              <div className="p-1 font-sans">
                <h3 className="font-bold text-base mb-1 ml-0 leading-tight" style={{margin: '0 0 4px 0'}}>{place.name}</h3>
                <div className="flex items-center gap-1 text-sm text-slate-500 mb-2">
                  <Star size={12} className="text-amber-500" /> {place.rating} ({place.reviews})
                  <strong className="ml-1 text-indigo-600">Rank #{place.rank}</strong>
                </div>
                
                <div className="flex flex-col gap-2 mt-3 pt-2 border-t border-slate-200">
                  {place.phone ? (
                    <a href={`tel:${place.phone.replace(/\s+/g,'')}`} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-xs truncate font-medium">
                      <Phone size={12} className="shrink-0" /> {place.phone}
                    </a>
                  ) : <span className="text-xs text-slate-400 flex items-center gap-2"><Phone size={12} /> Sin teléfono</span>}
                  
                  {place.website ? (
                    <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-xs truncate font-medium">
                      <Globe size={12} className="shrink-0" /> <span className="truncate max-w-[150px]">{place.website.replace('https://','').replace('http://','')}</span>
                    </a>
                  ) : <span className="text-xs text-slate-400 flex items-center gap-2"><Globe size={12} /> Sin sitio web</span>}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
