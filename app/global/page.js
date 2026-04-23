'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, getDocs, limit, getAggregateFromServer, count, addDoc, serverTimestamp, doc, getDoc, startAfter, where } from "firebase/firestore";
import { db, auth, signInAnonymously } from '../firebase';
import { ArrowLeft, Loader2, Globe2, Activity, Map, RefreshCw, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

const APP_ID = "marketspider-v3";

export default function GlobalTrackerView() {
  const [businesses, setBusinesses] = useState([]);
  const [stats, setStats] = useState({ total_scanned: 0, queue_size: 6615 });
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);

  // Filtros y Búsqueda
  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Paginación
  const [page, setPage] = useState(1);
  const [lastDocs, setLastDocs] = useState([]); // Guarda el último doc de páginas anteriores
  const [currentLastDoc, setCurrentLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  // Auth and Data Fetching inicial
  useEffect(() => {
    signInAnonymously(auth).then(async (userCredential) => {
      setCurrentUser(userCredential.user.uid);
        
      try {
          const coll = collection(db, `artifacts/${APP_ID}/global_businesses`);
          const snapshot = await getAggregateFromServer(coll, { countOfDocs: count() });
          setStats(s => ({ ...s, total_scanned: snapshot.data().countOfDocs }));
      } catch(e) {}
        
      try {
          const metaDoc = await getDoc(doc(db, `artifacts/${APP_ID}/meta/categories`));
          if (metaDoc.exists()) {
             // Solo tomamos categorías válidas que no sean strings larguísimos basura
             const validCats = (metaDoc.data().list || []).filter(c => c && c.length > 2 && c.length < 50);
             setCategories(validCats);
          }
      } catch(e) {}
      
      setLoading(false);
    });
  }, []);

  // Effect para manejar búsqueda y filtros con debounce
  useEffect(() => {
      if(!currentUser) return;
      const timer = setTimeout(() => {
          fetchPlaces('next', true);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery, filterCategory, currentUser]);

  const fetchPlaces = async (direction = 'next', reset = false) => {
    setLoadingList(true);
    let collRef = collection(db, `artifacts/${APP_ID}/global_businesses`);
    let qConstraints = [];
    
    if (filterCategory) {
      qConstraints.push(where("category", "==", filterCategory));
    }
    
    if (searchQuery) {
       const lowerQ = searchQuery.toLowerCase();
       qConstraints.push(where("name_lower", ">=", lowerQ));
       qConstraints.push(where("name_lower", "<=", lowerQ + "\uf8ff"));
       qConstraints.push(orderBy("name_lower", "asc")); 
    } else {
       qConstraints.push(orderBy("last_seen", "desc"));
    }

    if (reset) {
       qConstraints.push(limit(PAGE_SIZE));
    } else if (direction === 'next' && currentLastDoc) {
       qConstraints.push(startAfter(currentLastDoc));
       qConstraints.push(limit(PAGE_SIZE));
    } else if (direction === 'prev' && page > 2) {
       const prevLastDoc = lastDocs[page - 3]; 
       if (prevLastDoc) {
           qConstraints.push(startAfter(prevLastDoc));
       }
       qConstraints.push(limit(PAGE_SIZE));
    } else if (direction === 'prev' && page === 2) {
       qConstraints.push(limit(PAGE_SIZE));
    }
    
    try {
        const q = query(collRef, ...qConstraints);
        const snapshot = await getDocs(q);
        
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setBusinesses(docs);
        
        if (snapshot.docs.length > 0) {
            const newLastDoc = snapshot.docs[snapshot.docs.length - 1];
            
            if (direction === 'next' && !reset) {
                setLastDocs(prev => [...prev, currentLastDoc]);
                setPage(p => p + 1);
            } else if (direction === 'prev' && !reset) {
                setLastDocs(prev => prev.slice(0, -1));
                setPage(p => p - 1);
            } else if (reset) {
                setPage(1);
                setLastDocs([]);
            }
            
            setCurrentLastDoc(newLastDoc);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } else {
            setHasMore(false);
            if (reset) {
                setBusinesses([]);
                setPage(1);
                setLastDocs([]);
                setCurrentLastDoc(null);
            }
        }
    } catch(err) {
        console.error("Error fetching", err);
        // Alert silencioso o consola si falta índice compuesto
    } finally {
        setLoadingList(false);
    }
  };

  const [absorbModal, setAbsorbModal] = useState({ open: false, rubro: "", ciudad: "" });

  const toggleSelection = (id) => {
      const newSet = new Set(selectedIds);
      if(newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };
  
  const openAbsorbModal = () => {
      if(selectedIds.size === 0) return;
      setAbsorbModal({ open: true, rubro: "", ciudad: "" });
  };

  const confirmAbsorb = async () => {
      if(selectedIds.size === 0) return;
      if(!currentUser) return;
      
      const selectedBusinesses = businesses.filter(b => selectedIds.has(b.id));
      
      const jobCol = collection(db, `artifacts/${APP_ID}/users/${currentUser}/scan_jobs`);
      await addDoc(jobCol, {
          status: "pending",
          config: {
              type: "enrich_urls",
              rubro: absorbModal.rubro || "Directorio Global",
              ciudad: absorbModal.ciudad || "Varias Ciudades",
              places: selectedBusinesses.map(b => ({ name: b.name, url: b.url }))
          },
          created_at: serverTimestamp(),
      });
      
      setSelectedIds(new Set());
      setAbsorbModal({ open: false, rubro: "", ciudad: "" });
      alert("Locales transferidos a la cola de extracción. Enciende 'spider.py' (rastreador local) para que los absorba y enriquezca.");
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
          <p className="text-slate-400 text-sm">Directorio maestro de más de {stats.total_scanned} locales indexados con paginación optimizada.</p>
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

      {/* CONTROLES DE FILTRO Y BÚSQUEDA */}
      <div className="max-w-screen-2xl mx-auto w-full mb-4 flex flex-col md:flex-row gap-3">
          <div className="relative w-full md:w-64">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <select 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-8 py-2.5 rounded-xl focus:border-fuchsia-500 focus:outline-none transition-colors appearance-none"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
               <option value="">Todos los Rubros</option>
               {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar nombre de local..." 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-xl focus:border-fuchsia-500 focus:outline-none transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
      </div>

      <main className="max-w-screen-2xl mx-auto w-full flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col relative shadow-2xl">
        <div className="bg-slate-800/50 p-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-4">
            <h3 className="font-bold text-white flex items-center gap-2">
                <RefreshCw size={16} className={`text-fuchsia-400 ${loadingList ? 'animate-spin' : ''}`} /> 
                Directorio Global
            </h3>
            
            <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                    <button 
                        onClick={openAbsorbModal}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold px-4 py-2 rounded-lg text-sm border border-emerald-500/30 transition-colors shadow-sm focus:outline-none"
                    >
                        Agrupar y Extraer ({selectedIds.size})
                    </button>
                )}
            </div>
        </div>
        
        <div className="overflow-x-auto flex-1 h-[calc(100vh-420px)]">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-max border-collapse">
            <thead className="text-xs text-slate-300 uppercase bg-slate-800 sticky top-0 z-10 shadow-sm border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 w-10 text-center">Sel</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Place ID</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Local</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Categoría</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Rating</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Cuadrícula Origen</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-right">Último Upsert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loadingList && businesses.length === 0 ? (
                 <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                      <Loader2 className="animate-spin mx-auto mb-2 text-fuchsia-500" size={24} />
                      Cargando locales...
                    </td>
                 </tr>
              ) : businesses.length === 0 ? (
                 <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                    No se encontraron resultados.
                  </td>
                </tr>
              ) : (
                businesses.map((place, idx) => (
                  <tr key={`${place.id}-${idx}`} onClick={() => toggleSelection(place.id)} className={`hover:bg-slate-800/80 transition-colors cursor-pointer ${selectedIds.has(place.id) ? 'bg-indigo-900/40' : ''}`}>
                    <td className="px-6 py-3 border-r border-slate-800 text-center">
                        <input type="checkbox" checked={selectedIds.has(place.id)} readOnly className="rounded border-slate-600 bg-slate-800 text-fuchsia-500 focus:ring-fuchsia-500 focus:ring-offset-slate-900" />
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 font-mono text-xs text-slate-400 max-w-[100px] truncate" title={place.id}>
                        {place.id.substring(0, 12)}...
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 font-bold text-fuchsia-100 max-w-[200px] truncate" title={place.name}>
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
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-xs">Lat: {place.hex_lat?.toFixed(4) || 'N/A'}</span>
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-xs">Lng: {place.hex_lng?.toFixed(4) || 'N/A'}</span>
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

        {/* CONTROLES DE PAGINACIÓN */}
        <div className="bg-slate-950 p-3 border-t border-slate-700 flex justify-between items-center text-sm">
            <span className="text-slate-500">
                Página <strong className="text-white">{page}</strong> 
                {loadingList && <Loader2 size={12} className="inline animate-spin ml-2 text-fuchsia-500" />}
            </span>
            <div className="flex gap-2">
                <button 
                    onClick={() => fetchPlaces('prev')} 
                    disabled={page === 1 || loadingList}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-600 disabled:opacity-50 transition-colors"
                >
                    <ChevronLeft size={16} /> Anterior
                </button>
                <button 
                    onClick={() => fetchPlaces('next')} 
                    disabled={!hasMore || loadingList}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-600 disabled:opacity-50 transition-colors"
                >
                    Siguiente <ChevronRight size={16} />
                </button>
            </div>
        </div>

      </main>

      {/* MODAL DE EXTRACCIÓN EXHAUSTIVA */}
      {absorbModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl p-6 relative">
            <h3 className="text-xl font-bold text-white mb-2">Configurar Extracción</h3>
            <p className="text-sm text-slate-400 mb-6">Asigna un Rubro y una Ciudad a estos {selectedIds.size} locales para agruparlos en tu CRM.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Rubro / Categoría</label>
                <input 
                  type="text" 
                  value={absorbModal.rubro}
                  onChange={(e) => setAbsorbModal({...absorbModal, rubro: e.target.value})}
                  placeholder="Ej: Restaurante, Ferretería..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Ciudad</label>
                <input 
                  type="text" 
                  value={absorbModal.ciudad}
                  onChange={(e) => setAbsorbModal({...absorbModal, ciudad: e.target.value})}
                  placeholder="Ej: Viña del Mar, Valparaíso..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setAbsorbModal({ open: false, rubro: "", ciudad: "" })}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmAbsorb}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-500/20"
              >
                Enviar a Spider
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
