'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, onSnapshot, limit, getAggregateFromServer, count, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, signInAnonymously } from '../firebase';
import { ArrowLeft, Loader2, Globe2, Activity, Map, RefreshCw } from 'lucide-react';

const APP_ID = "marketspider-v3";

export default function GlobalTrackerView() {
  const [businesses, setBusinesses] = useState([]);
  const [stats, setStats] = useState({ total_scanned: 0, queue_size: 6615 });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);

  // Auth and Data Fetching
  useEffect(() => {
    signInAnonymously(auth).then(async (userCredential) => {
      setCurrentUser(userCredential.user.uid);
        
      // Fetch stats using aggregation to avoid downloading tens of thousands of docs
      try {
          const coll = collection(db, `artifacts/${APP_ID}/global_businesses`);
          const snapshot = await getAggregateFromServer(coll, { countOfDocs: count() });
          setStats(s => ({ ...s, total_scanned: snapshot.data().countOfDocs }));
      } catch(e) {}
        
      // Fetch latest 50 for the UI
      const q = query(collection(db, `artifacts/${APP_ID}/global_businesses`), orderBy("last_seen", "desc"), limit(50));
      const unsub = onSnapshot(q, (snapshot) => {
        setBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Error fetching global:", err);
        setLoading(false);
      });
      return () => unsub();
    });
  }, []);

  const toggleSelection = (id) => {
      const newSet = new Set(selectedIds);
      if(newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };
  
  const handleAbsorb = async () => {
      if(selectedIds.size === 0) return;
      if(!currentUser) return;
      
      const selectedBusinesses = businesses.filter(b => selectedIds.has(b.id));
      if(!confirm(`¿Transferir ${selectedBusinesses.length} locales al Directorio Consolidado para extracción exhaustiva?`)) return;
      
      const jobCol = collection(db, `artifacts/${APP_ID}/users/${currentUser}/scan_jobs`);
      await addDoc(jobCol, {
          status: "pending",
          config: {
              type: "enrich_urls",
              rubro: "Transferencia Especial",
              ciudad: "Radar Global",
              places: selectedBusinesses.map(b => ({ name: b.name, url: b.url }))
          },
          created_at: serverTimestamp(),
      });
      
      setSelectedIds(new Set());
      alert("Locales transferidos. Enciende 'spider.py' (tu rastreador local de Detalle) para que los absorba inmediatamente.");
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
      <Loader2 className="animate-spin text-fuchsia-500" size={48} />
      <p className="animate-pulse">Sincronizando Estado Global H3...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 selection:bg-fuchsia-500/30 flex flex-col">
      <header className="max-w-screen-2xl mx-auto w-full mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-fuchsia-400 hover:text-fuchsia-300 font-medium mb-2 text-sm transition-colors">
            <ArrowLeft size={16} /> Volver al Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
             <Globe2 size={32} className="text-fuchsia-400" /> MarketSpider GLOBAL
          </h1>
          <p className="text-slate-400 text-sm">Motor asíncrono. Tracking histórico por PlaceID y grilla H3 de la Región de Valparaíso.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-center">
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                 <div className="text-center border-r border-slate-700 pr-4">
                     <p className="text-2xl font-black text-white">{stats.total_scanned}</p>
                     <p className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1"><Activity size={10}/> Locales Absorbidos</p>
                 </div>
                 <div className="text-center">
                     <p className="text-2xl font-black text-slate-300">{stats.queue_size}</p>
                     <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1"><Map size={10}/> Celdas H3 Mapeadas</p>
                 </div>
             </div>
        </div>
      </header>

      {/* TABLA ESTILO EXCEL PARA ULTIMOS EXTRAIDOS */}
      <main className="max-w-screen-2xl mx-auto w-full flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col relative shadow-2xl">
        <div className="bg-slate-800/50 p-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-4">
            <h3 className="font-bold text-white flex items-center gap-2"><RefreshCw size={16} className="text-fuchsia-400" /> Stream de Nodos en Vivo (Últimos 50)</h3>
            
            <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                    <button 
                        onClick={handleAbsorb}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold px-4 py-2 rounded-lg text-sm border border-emerald-500/30 transition-colors shadow-sm focus:outline-none"
                    >
                        Extraer Exhaustivamente ({selectedIds.size})
                    </button>
                )}
                <span className="text-xs bg-fuchsia-500/10 text-fuchsia-400 px-3 py-1 rounded-full border border-fuchsia-500/20 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse"></span> Workers Corriendo
                </span>
            </div>
        </div>
        
        <div className="overflow-x-auto flex-1 h-[calc(100vh-350px)]">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-max border-collapse">
            <thead className="text-xs text-slate-300 uppercase bg-slate-800 sticky top-0 z-10 shadow-sm border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 w-10 text-center">Sel</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Place ID (UID Google)</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Local</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Categoría</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Rating</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Cuadrícula Origen</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-right">Último Upsert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {businesses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-500 bg-slate-900">
                    Arranca watchdog_global.bat en tu servidor local para comenzar la inyección.
                  </td>
                </tr>
              ) : (
                businesses.map((place, idx) => (
                  <tr key={`${place.id}-${idx}`} onClick={() => toggleSelection(place.id)} className={`hover:bg-slate-800/80 transition-colors cursor-pointer ${selectedIds.has(place.id) ? 'bg-indigo-900/40' : ''}`}>
                    <td className="px-6 py-3 border-r border-slate-800 text-center">
                        <input type="checkbox" checked={selectedIds.has(place.id)} readOnly className="rounded border-slate-600 bg-slate-800 text-fuchsia-500 focus:ring-fuchsia-500 focus:ring-offset-slate-900" />
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 font-mono text-xs text-slate-400 max-w-[150px] truncate">
                        {place.id}
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 font-bold text-fuchsia-100 max-w-[200px] truncate">
                        {place.name}
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-center text-slate-300 max-w-[150px] truncate">
                        {place.category || '-'}
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-center">
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-medium text-amber-400">{place.rating || 'S/D'}</span>
                        <span className="text-xs text-slate-500 ml-1">({place.reviews || 0})</span>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-center text-slate-500 flex gap-2 justify-center">
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800">Lat: {place.hex_lat?.toFixed(4) || 'N/A'}</span>
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800">Lng: {place.hex_lng?.toFixed(4) || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-xs text-slate-500 text-right">
                        {place.last_seen ? new Date(place.last_seen.seconds ? place.last_seen.seconds * 1000 : place.last_seen).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
