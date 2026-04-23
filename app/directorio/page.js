'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, signInAnonymously } from '../firebase';
import { ArrowLeft, Search, Loader2, Star, Phone, Globe, MapPin, X, ExternalLink, Play, Calendar, Activity, Filter, Server, ShieldCheck, Smartphone, Target, CheckCircle } from 'lucide-react';

const APP_ID = "marketspider-v3";
const USER_ID = "Hp1YGeni2DgiWrtrIKUgmgki7UL2";

export default function DirectoryExcelView() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [batchAuditStatus, setBatchAuditStatus] = useState({ active: false, current: 0, total: 0 });

  const handleBatchAudit = async () => {
    const targets = filteredPlaces.filter(p => p.website && p.scanId);
    if(targets.length === 0) {
        alert("Ningún local en esta lista tiene sitio web para auditar.");
        return;
    }
    if(!confirm(`¿Auditar masivamente la parte técnica de ${targets.length} sitios web secuencialmente? Esto puede tomar un tiempo.`)) return;

    setBatchAuditStatus({ active: true, current: 0, total: targets.length });
    
    let processed = 0;
    for (const target of targets) {
        try {
            const res = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json'},
                body: JSON.stringify({ url: target.website })
            });
            if(res.ok) {
                const data = await res.json();
                const newAudit = data.audit;

                // Actualizar Firestore obteniendo el doc fresco para evitar sobreescritura de estado stale
                const scanRef = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/scans/`, target.scanId);
                const scanSnap = await getDoc(scanRef);
                if(scanSnap.exists()) {
                    const scanData = scanSnap.data();
                    const newPlaces = scanData.places.map(p => {
                        if (p.name === target.name) {
                            return { ...p, webAudit: newAudit, webScore: newAudit.score };
                        }
                        return p;
                    });
                    await updateDoc(scanRef, { places: newPlaces });
                }
            }
        } catch(err) {
            console.error(err);
        }
        processed++;
        setBatchAuditStatus({ active: true, current: processed, total: targets.length });
        
        // Timer de 1 segundo para no estresar Firebase ni Cloud Functions/Nextjs API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setBatchAuditStatus({ active: false, current: 0, total: 0 });
    alert("Auditoría Masiva Completada.");
  };

  const handleManualAudit = async () => {
    if (!selectedPlace || !selectedPlace.website || !selectedPlace.scanId) {
        alert("Este local no tiene sitio web o no posee Scan ID.");
        return;
    }
    setAuditing(true);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ url: selectedPlace.website })
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Error al auditar la web: " + (data.error || "Desconocido"));
        setAuditing(false);
        return;
      }
      
      const newAudit = data.audit;
      
      // Update Firestore
      const scanRef = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/scans/`, selectedPlace.scanId);
      const scanObj = scans.find(s => s.id === selectedPlace.scanId);
      if(scanObj) {
         const newPlaces = scanObj.places.map(p => {
             if (p.name === selectedPlace.name) {
                 return { ...p, webAudit: newAudit, webScore: newAudit.score };
             }
             return p;
         });
         await updateDoc(scanRef, { places: newPlaces });
         setSelectedPlace({...selectedPlace, webAudit: newAudit, webScore: newAudit.score});
      }
    } catch(err) {
      console.error(err);
      alert("Error crítico conectando a la API de auditoría.");
    } finally {
      setAuditing(false);
    }
  };

  const handleMoveToCRM = async () => {
    if (!selectedPlace) return;
    setAuditing(true); // Reutilizamos el estado de carga
    try {
      // Verificar si ya existe (opcional, pero recomendado)
      // Por simplicidad en esta vista de "excel", lo agregamos directamente
      await addDoc(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/crm_leads`), {
        name: selectedPlace.name,
        phone: selectedPlace.phone || '',
        website: selectedPlace.website || '',
        rank: selectedPlace.rank || 0,
        status: 'Prospecto',
        notes: '',
        gmapsLink: selectedPlace.url || '',
        category: selectedPlace.category || '',
        location: selectedPlace.location || '',
        updatedAt: serverTimestamp(),
      });
      alert(`¡${selectedPlace.name} enviado al CRM!`);
    } catch(err) {
      console.error(err);
      alert("Error al mover al CRM.");
    } finally {
      setAuditing(false);
    }
  };

  // Auth and Data Fetching
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      const q = query(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/scans`), orderBy("date", "desc"));
      const unsub = onSnapshot(q, (snapshot) => {
        setScans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Error fetching scans:", err);
        setLoading(false);
      });
      return () => unsub();
    });
  }, []);

  // Proceso de Datos: Extraer todos los locales y dedupicarlos (manteniendo el mas reciente)
  const allPlaces = useMemo(() => {
    const placesMap = new Map();
    // scans ya están ordenados de más reciente a más antiguo por el query (desc).
    // si iteramos, el primero que pongamos en el map será el más reciente.
    scans.forEach(scan => {
      if (scan.places) {
         scan.places.forEach(place => {
            if (!placesMap.has(place.name)) {
               placesMap.set(place.name, {
                   ...place,
                   category: scan.category,
                   location: scan.location,
                   scanDate: scan.date,
                   scanId: scan.id
               });
            }
         });
      }
    });
    return Array.from(placesMap.values());
  }, [scans]);

  const uniqueCategories = useMemo(() => Array.from(new Set(allPlaces.map(p => p.category).filter(Boolean))), [allPlaces]);

  const filteredPlaces = useMemo(() => {
    let result = allPlaces;
    if (filterCategory) {
       result = result.filter(p => p.category === filterCategory);
    }
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(lowerQ) || 
        p.category?.toLowerCase().includes(lowerQ) ||
        p.location?.toLowerCase().includes(lowerQ)
      );
    }
    return result;
  }, [allPlaces, searchQuery, filterCategory]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
      <Loader2 className="animate-spin text-indigo-500" size={48} />
      <p className="animate-pulse">Cargando Directorio Global...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 selection:bg-emerald-500/30 flex flex-col">
      <header className="max-w-screen-2xl mx-auto w-full mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-medium mb-2 text-sm transition-colors">
            <ArrowLeft size={16} /> Volver al Dashboard Principal
          </Link>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
             Directorio Consolidado
          </h1>
          <p className="text-slate-400 text-sm">Vista estilo hoja de cálculo de todas las empresas extraídas.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto items-center">
          
          {batchAuditStatus.active ? (
            <div className="flex items-center gap-2 bg-indigo-500/20 text-indigo-400 font-bold px-4 py-2.5 rounded-xl text-sm border border-indigo-500/30 whitespace-nowrap">
               <Loader2 size={16} className="animate-spin" />
               <span>Auditando {batchAuditStatus.current} de {batchAuditStatus.total}</span>
            </div>
          ) : (
            <button 
              onClick={handleBatchAudit}
              className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold px-4 py-2.5 rounded-xl text-sm border border-indigo-500/30 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
              title="Auditar Web secuencialmente de todos los locales listados en tabla"
            >
               <Server size={16} /> Auditar Todos
            </button>
          )}

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <select 
              className="w-full md:w-48 bg-slate-900 border border-slate-700 text-white pl-10 pr-8 py-2.5 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors appearance-none"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
               <option value="">Todos los Rubros</option>
               {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar nombre o ciudad..." 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* TABLA ESTILO EXCEL */}
      <main className="max-w-screen-2xl mx-auto w-full flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col relative shadow-2xl">
        <div className="overflow-x-auto flex-1 h-[calc(100vh-250px)]">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-max border-collapse">
            <thead className="text-xs text-slate-300 uppercase bg-slate-800 sticky top-0 z-10 shadow-sm border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Empresa</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Rank</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Rubro</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Ciudad</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-center">Contactos</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Rating (Reviews)</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Puntaje Visual</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50 text-indigo-400">Auditoría Web</th>
                <th className="px-6 py-4 font-bold border-r border-slate-700/50">Último Rastreo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredPlaces.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-slate-500 bg-slate-900">
                    No se encontraron resultados en el directorio.
                  </td>
                </tr>
              ) : (
                filteredPlaces.map((place, idx) => (
                  <tr 
                    key={`${place.name}-${idx}`}
                    onClick={() => setSelectedPlace(place)}
                    className="hover:bg-slate-800/80 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-3 border-r border-slate-800 font-medium text-white max-w-[250px] truncate">{place.name}</td>
                    <td className="px-6 py-3 border-r border-slate-800 font-bold text-center">
                        <span className="bg-slate-950 px-2.5 py-1 rounded text-cyan-400 border border-cyan-500/20">#{place.rank}</span>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-slate-300">{place.category || '-'}</td>
                    <td className="px-6 py-3 border-r border-slate-800 text-slate-300">{place.location || '-'}</td>
                    <td className="px-6 py-3 border-r border-slate-800 flex items-center justify-center gap-3">
                        {place.phone ? <Phone size={14} className="text-emerald-400" title={place.phone}/> : <Phone size={14} className="text-slate-700" />}
                        {place.website ? <Globe size={14} className="text-indigo-400" title="Tiene Sitio Web"/> : <Globe size={14} className="text-slate-700" />}
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + (place.location || ''))}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 transition-colors" title="Ver en Google My Business">
                            <MapPin size={14} />
                        </a>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800">
                        <div className="flex items-center gap-1.5">
                            <Star size={14} className="text-amber-400" fill="currentColor" />
                            <span className="text-white font-medium">{place.rating || 'S/D'}</span>
                            <span className="text-slate-500 text-xs">({place.reviews || 0})</span>
                        </div>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800">
                        <div className="flex items-center gap-2">
                           <div className="w-16 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
                              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(place.visualScore || 0, 100)}%`}}></div>
                           </div>
                           <span className="text-xs text-slate-400">{place.visualScore || 0}/100</span>
                        </div>
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800">
                        {place.webScore !== undefined ? (
                           <div className="flex items-center gap-2">
                              {place.webScore >= 70 ? <Server size={14} className="text-emerald-400"/> : place.webScore >= 40 ? <Server size={14} className="text-amber-400"/> : <Server size={14} className="text-rose-400"/>}
                              <span className="text-xs font-bold text-white">{place.webScore} pt</span>
                           </div>
                        ) : <span className="text-[10px] text-slate-600 border border-slate-800 px-1.5 rounded">Pendiente</span>}
                    </td>
                    <td className="px-6 py-3 border-r border-slate-800 text-xs text-slate-500">
                        {new Date(place.scanDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-950 p-3 border-t border-slate-700 text-xs text-slate-500 flex justify-between items-center">
           <span>Total extraídos únicos: <strong className="text-white">{allPlaces.length} locales</strong></span>
           <span className="flex items-center gap-1"><Activity size={14}/> {filteredPlaces.length} mostrados</span>
        </div>
      </main>

      {/* PANEL MODAL LATERAL / FLOTANTE */}
      {selectedPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm p-4 sm:p-0">
          <div className="bg-slate-900 w-full max-w-md h-auto sm:h-full overflow-y-auto sm:rounded-l-2xl rounded-2xl border border-slate-700 shadow-2xl flex flex-col transform transition-transform animate-in slide-in-from-right relative">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900/90 backdrop-blur border-b border-slate-800 p-6 flex justify-between items-start">
               <div>
                  <h3 className="text-2xl font-bold text-white mb-2 leading-tight pr-6">{selectedPlace.name}</h3>
                  <div className="flex gap-2">
                     <span className="bg-emerald-500/10 text-emerald-400 text-[10px] uppercase font-bold px-2 py-1 rounded border border-emerald-500/20">{selectedPlace.category}</span>
                     <span className="bg-slate-800 text-slate-300 text-[10px] uppercase font-bold px-2 py-1 rounded border border-slate-700">{selectedPlace.location}</span>
                  </div>
               </div>
               <button onClick={() => setSelectedPlace(null)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full transition-colors absolute top-4 right-4">
                  <X size={16} />
               </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 flex-1">
               {/* Metrics Grid */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col">
                     <span className="text-xs text-slate-500 mb-1">Ranking Búsqueda</span>
                     <span className="text-2xl font-bold text-cyan-400 flex items-end gap-1">#{selectedPlace.rank} <span className="text-[10px] uppercase text-slate-600 mb-1">Gmaps</span></span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col">
                     <span className="text-xs text-slate-500 mb-1">Valoración</span>
                     <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-amber-400">{selectedPlace.rating || 'S/D'}</span>
                        <div className="flex text-amber-400 mb-1 text-[10px]">
                            {"★".repeat(Math.round(selectedPlace.rating || 0))}
                        </div>
                     </div>
                     <span className="text-[10px] text-slate-500">{selectedPlace.reviews} reseñas totales</span>
                  </div>
               </div>

               {/* Score Oportunidad */}
               <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-4">
                  <h4 className="text-emerald-400 font-bold text-sm mb-3 flex items-center gap-2"><Star size={16}/> Inteligencia Visual</h4>
                  
                  <div className="flex items-center justify-between mb-4">
                     <div>
                        <div className="text-white text-3xl font-extrabold">{selectedPlace.visualScore || 0}<span className="text-slate-500 text-sm">/100</span></div>
                        <span className="text-xs text-slate-400">Score de Contenido</span>
                     </div>
                     <span className="bg-slate-900 border border-slate-700 font-medium text-xs px-3 py-1.5 rounded-lg text-white">
                        {selectedPlace.opportunityType || 'Oportunidad'}
                     </span>
                  </div>

                  <ul className="space-y-2 text-xs">
                     <li className="flex justify-between items-center text-slate-300">
                        <span className="flex items-center gap-2"><Play size={14} className={selectedPlace.hasVideo ? 'text-emerald-400' : 'text-slate-600'}/> ¿Tiene Video Promocional?</span>
                        <strong className={selectedPlace.hasVideo ? 'text-emerald-400' : 'text-rose-400'}>{selectedPlace.hasVideo ? 'Sí' : 'No'}</strong>
                     </li>
                     <li className="flex justify-between items-center text-slate-300">
                        <span className="flex items-center gap-2"><Calendar size={14} className="text-slate-500"/> Último material</span>
                        <strong>Aprox. {selectedPlace.lastPhoto}</strong>
                     </li>
                  </ul>
               </div>

               {/* Auditoria WEB */}
               <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3 border-b border-indigo-500/20 pb-2">
                     <h4 className="text-indigo-400 font-bold text-sm flex items-center gap-2"><Server size={16}/> Auditoría Técnica de Web</h4>
                     {selectedPlace.website ? (
                       <button 
                         onClick={handleManualAudit} 
                         disabled={auditing}
                         className="flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors disabled:opacity-50"
                       >
                         {auditing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                         {auditing ? 'Auditando...' : selectedPlace.webAudit ? 'Re-Auditar' : 'Forzar Auditoría'}
                       </button>
                     ) : null}
                  </div>
                  {selectedPlace.webAudit ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                         <div className="text-white text-3xl font-extrabold">{selectedPlace.webScore}<span className="text-slate-500 text-sm">/100</span></div>
                         <span className="bg-slate-900 border border-slate-700 font-medium text-xs px-3 py-1.5 rounded-lg text-white">
                           {selectedPlace.webScore >= 70 ? 'Buen Estado' : selectedPlace.webScore > 0 ? 'Optimización Urgente' : 'Página Inactiva'}
                         </span>
                      </div>
                      <ul className="space-y-2 text-xs">
                         <li className="flex justify-between items-center text-slate-300">
                            <span className="flex items-center gap-2"><ShieldCheck size={14} className={selectedPlace.webAudit.secure ? 'text-emerald-400' : 'text-rose-400'}/> Certificado SSL (Seguro)</span>
                            <strong className={selectedPlace.webAudit.secure ? 'text-emerald-400' : 'text-rose-400'}>{selectedPlace.webAudit.secure ? 'Sí' : 'Http'}</strong>
                         </li>
                         <li className="flex justify-between items-center text-slate-300">
                            <span className="flex items-center gap-2"><Smartphone size={14} className={selectedPlace.webAudit.responsive ? 'text-emerald-400' : 'text-slate-500'}/> Optimizado Móvil</span>
                            <strong className={selectedPlace.webAudit.responsive ? 'text-emerald-400' : 'text-rose-400'}>{selectedPlace.webAudit.responsive ? 'Sí' : 'No'}</strong>
                         </li>
                         {selectedPlace.webAudit.video_count !== undefined && (
                             <li className="flex justify-between items-center text-slate-300">
                                <span className="flex items-center gap-2"><Play size={14} className={selectedPlace.webAudit.video_count > 0 ? 'text-emerald-400' : 'text-slate-500'}/> Audiovisual en Sitio Web</span>
                                <strong className={selectedPlace.webAudit.video_count > 0 ? 'text-emerald-400' : 'text-rose-400'}>{selectedPlace.webAudit.video_count > 0 ? `${selectedPlace.webAudit.video_count} video(s)` : 'Sin videos detectados'}</strong>
                             </li>
                         )}
                      </ul>
                    </>
                  ) : <p className="text-xs text-slate-400 italic">No hay información de auditoría para este escaneo. Realiza un nuevo rastreo en MarketSpider.</p>}
               </div>

               {/* Contact Info */}
               <div className="space-y-4">
                  <h4 className="text-slate-500 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2">Datos de Contacto Directo</h4>
                  
                  {selectedPlace.phone ? (
                     <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-3">
                           <div className="bg-slate-800 p-2 rounded-lg text-emerald-400"><Phone size={16}/></div>
                           <div>
                              <p className="text-xs text-slate-500">Teléfono</p>
                              <a href={`tel:${selectedPlace.phone.replace(/\s/g,'')}`} className="text-white hover:underline font-mono text-sm">{selectedPlace.phone}</a>
                           </div>
                        </div>
                     </div>
                  ) : <p className="text-xs text-slate-500 ml-1">Sin teléfono en Google Maps.</p>}

                  {selectedPlace.website ? (
                     <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-3">
                           <div className="bg-slate-800 p-2 rounded-lg text-indigo-400"><Globe size={16}/></div>
                           <div className="overflow-hidden">
                              <p className="text-xs text-slate-500">Sitio Web Oficial</p>
                              <a href={selectedPlace.website} target="_blank" className="text-white hover:underline text-sm truncate block max-w-[200px]">{selectedPlace.website.replace('http://','').replace('https://','')}</a>
                           </div>
                        </div>
                        <a href={selectedPlace.website} target="_blank" className="text-slate-500 hover:text-white p-2">
                           <ExternalLink size={16}/>
                        </a>
                     </div>
                  ) : <p className="text-xs text-slate-500 ml-1">Sin sitio web listado.</p>}
               </div>
               
               {/* Location data */}
               <div className="space-y-3 pt-2">
                  {(selectedPlace.lat && selectedPlace.lng) && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${selectedPlace.lat},${selectedPlace.lng}`} target="_blank" className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors border border-slate-700">
                          <MapPin size={16} /> Abrir Geolocalización en Mapas
                      </a>
                  )}

                  <button 
                    onClick={handleMoveToCRM}
                    disabled={auditing}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-2 text-sm font-extrabold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {auditing ? <Loader2 size={18} className="animate-spin" /> : <Target size={18} />}
                    Mover Prospecto al CRM
                  </button>
               </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
