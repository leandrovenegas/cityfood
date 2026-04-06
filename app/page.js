'use client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Video, TrendingDown, Copy, Star, MapPin, Activity, Calendar, Search, Loader2, AlertCircle, Play, Clock, CheckCircle, XCircle, PlusCircle, RefreshCw, Trash2, Phone, Globe, Map } from 'lucide-react';
import { db, auth, signInAnonymously } from './firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";

const MapComponent = dynamic(() => import('./components/MapComponent'), { ssr: false });

const APP_ID = "marketspider-v3";

const JOB_STATUS_CONFIG = {
  pending: { label: "En cola", className: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Clock },
  running: { label: "Corriendo", className: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: RefreshCw },
  scheduled: { label: "Programado", className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30", icon: Clock },
  done: { label: "Completado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  error: { label: "Error", className: "bg-rose-500/10 text-rose-400 border-rose-500/30", icon: XCircle },
};

const REPEAT_OPTIONS = [
  { value: 0, label: "Sin repetición" },
  { value: 6, label: "Cada 6 horas" },
  { value: 12, label: "Cada 12 horas" },
  { value: 24, label: "Cada 24 horas (diario)" },
  { value: 48, label: "Cada 48 horas" },
];

export default function MarketSpiderDashboard() {
  const [scans, setScans] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('opportunities');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);

  const [formConfig, setFormConfig] = useState({ rubro: 'Cafetería', ciudad: '', maxResults: 15, autoRepeatHours: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // 1. Auth
  useEffect(() => {
    signInAnonymously(auth).then((result) => setUserId(result.user.uid)).catch((err) => {
      setError("Error de autenticación. Verifica Firebase."); setLoading(false);
    });
  }, []);

  // 2. Fetch Scans
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/scans`), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setScans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userId]);

  // 3. Fetch Jobs
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => unsub();
  }, [userId]);

  // Derivar Listado de Categorias y Ciudades
  const filterOptions = useMemo(() => {
    const list = new Set();
    scans.forEach(s => { if (s.category && s.location) list.add(`${s.category}|${s.location}`); });
    return Array.from(list).map(str => {
      const [c, l] = str.split('|');
      return { category: c, location: l, key: str };
    });
  }, [scans]);

  useEffect(() => {
    if (filterOptions.length > 0 && (!filterCategory || !filterLocation)) {
      setFilterCategory(filterOptions[0].category);
      setFilterLocation(filterOptions[0].location);
    }
  }, [filterOptions]);

  // Scans filtrados globalmente (para Tracking y Mapa y Oportunidades)
  const filteredScans = useMemo(() => {
    return scans.filter(s => s.category === filterCategory && s.location === filterLocation);
  }, [scans, filterCategory, filterLocation]);

  const latestScan = filteredScans[0];
  const opportunities = latestScan?.places?.filter(p => true) || []; // Mostrar todos en oportunidades o filtrar

  // Tracking Histórico Segmentado
  const businessRankHistory = useMemo(() => {
    const map = {};
    const sortedScans = [...filteredScans].sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedScans.forEach(scan => {
      scan.places?.forEach(place => {
        if (!map[place.name]) map[place.name] = [];
        map[place.name].push({
          date: new Date(scan.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
          rank: place.rank,
          visualScore: place.visualScore ?? null,
          hasVideo: place.hasVideo ?? null,
          category: scan.category,
          location: scan.location,
        });
      });
    });
    return map;
  }, [filteredScans]);

  const businessList = useMemo(() => {
    return Object.entries(businessRankHistory)
      .map(([name, history]) => {
        const first = history[0];
        const last = history[history.length - 1];
        const delta = first && last ? first.rank - last.rank : 0;
        return { name, history, firstRank: first?.rank, currentRank: last?.rank, delta, scans: history.length };
      })
      .sort((a, b) => b.delta - a.delta);
  }, [businessRankHistory]);

  const handleCopyPitch = (place) => {
    const pitch = `Hola equipo de ${place.name}, analizaron su negocio y he notado que tienen potencial para escalar en Google Maps. Están en posición #${place.rank} y podríamos mejorar su perfil visual.`;
    navigator.clipboard.writeText(pitch);
    alert(`Pitch copiado para ${place.name}!`);
  };

  const handleDeletePlace = async (scanId, placeName) => {
    if (!confirm(`¿Ignorar permanentemente a ${placeName} de este escaneo?`)) return;
    const scan = scans.find(s => s.id === scanId);
    if (!scan) return;
    const newPlaces = scan.places.filter(p => p.name !== placeName);
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scans/`, scanId), { places: newPlaces });
  };

  const handleDeleteScan = async (scanId, e) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este escaneo entero? Se perderá permanentemente del tracking.")) return;
    await deleteDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scans/`, scanId));
  };

  const handleForceScan = async (jobId) => {
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs/`, jobId), { status: 'pending', message: 'Forzado manual...' });
  };

  const handleSubmitJob = async (e) => {
    e.preventDefault();
    if (!userId || !formConfig.ciudad.trim()) return;
    setSubmitting(true); setSubmitSuccess(false);
    try {
      await addDoc(collection(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs`), {
        status: "pending",
        config: formConfig,
        message: "Enviado al Playwright Spider...",
        createdAt: serverTimestamp(),
      });
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) { setError("Error al enviar trabajo."); }
    finally { setSubmitting(false); }
  };

  const tabs = [
    { id: 'opportunities', label: 'Locales', color: 'indigo' },
    { id: 'tracking', label: 'Tracking', color: 'cyan' },
    { id: 'map', label: 'Mapa', color: 'emerald' },
    { id: 'new-scan', label: 'Rastreo', color: 'violet' },
    { id: 'history', label: 'Historial', color: 'slate' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
      <Loader2 className="animate-spin text-indigo-500" size={48} />
      <p className="animate-pulse">Cargando MarketSpider V3...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-8 selection:bg-indigo-500/30">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent mb-2 flex items-center gap-3">
            <Activity className="text-indigo-400" size={36} />
            MarketSpider V3
          </h1>
          <p className="text-slate-400 text-sm flex items-center gap-2">Google Maps Directory & Ranking suite</p>
        </div>
        <nav className="mt-4 md:mt-0 flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                ? `bg-${tab.color}-600 text-white shadow-lg shadow-${tab.color}-600/20`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Segmentador Global */}
      {(activeTab === 'opportunities' || activeTab === 'tracking' || activeTab === 'map') && (
        <div className="max-w-7xl mx-auto mb-6 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin size={20} className="text-indigo-400" />
            <span className="font-semibold text-white">Filtro Activo de Rubro/Ciudad:</span>
          </div>
          <select
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:border-indigo-500 min-w-[250px]"
            value={`${filterCategory}|${filterLocation}`}
            onChange={(e) => {
              const [c, l] = e.target.value.split('|');
              setFilterCategory(c); setFilterLocation(l);
              setSelectedBusiness(null);
            }}
          >
            {filterOptions.length === 0 ? <option value="|">Sin datos</option> : null}
            {filterOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.category} en {opt.location}</option>
            ))}
          </select>
        </div>
      )}

      <main className="max-w-7xl mx-auto">

        {/* ======================== TAB: OPORTUNIDADES ======================== */}
        {activeTab === 'opportunities' && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
              <Star className="text-amber-400" /> Locales Competidores
              <span className="ml-auto bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs border border-slate-700">
                {opportunities.length} encontrados en último scan
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {opportunities.map((place, idx) => (
                <div key={idx} className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all flex flex-col justify-between">

                  {/* Boton Borrar */}
                  <button onClick={() => handleDeletePlace(latestScan.id, place.name)}
                    className="absolute top-4 right-4 bg-slate-950/50 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 p-2 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                    title="Ocultar local de este escaneo"
                  >
                    <Trash2 size={16} />
                  </button>

                  <div>
                    <h3 className="font-bold text-lg text-white mb-2 pr-8">{place.name}</h3>
                    <div className="flex items-center text-xs text-slate-400 gap-3 mb-4">
                      <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" /> {place.rating} ({place.reviews})</span>
                      <span className="flex items-center gap-1 font-bold text-indigo-400">Rank #{place.rank}</span>
                    </div>

                    <div className="space-y-3 mb-6 bg-slate-950 p-4 rounded-xl border border-white/5 text-sm">
                      <div className="flex items-center gap-3">
                        <Phone size={14} className="text-slate-500 shrink-0" />
                        {place.phone ? <a href={`tel:${place.phone.replace(/\s/g, '')}`} className="text-indigo-400 hover:underline truncate">{place.phone}</a> : <span className="text-slate-600">No listado</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Globe size={14} className="text-slate-500 shrink-0" />
                        {place.website ? <a href={place.website} target="_blank" className="text-indigo-400 hover:underline truncate">{place.website.replace('https://', '').replace('http://', '')}</a> : <span className="text-slate-600">No listada</span>}
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2 py-1 rounded border border-indigo-500/20">{place.opportunityType || 'Oportunidad'}</span>
                    <button onClick={() => handleCopyPitch(place)} className="flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg transition-colors border border-white/10">
                      <Copy size={16} /> Pitch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================== TAB: TRACKING ======================== */}
        {activeTab === 'tracking' && (
          <div className="animate-in fade-in duration-500">
            {businessList.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                Aún no hay scans agrupados para este rubro.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {businessList.map(({ name, currentRank, delta, scans: scanCount }) => (
                      <button key={name} onClick={() => setSelectedBusiness(name)}
                        className={`w-full text-left rounded-xl p-3 border transition-all ${selectedBusiness === name ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm truncate">{name}</p>
                          {delta !== 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${delta > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Ranking Actual: #{currentRank} · {scanCount} fotos</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  {!selectedBusiness ? (
                    <div className="h-[400px] bg-slate-900 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 gap-3">
                      <TrendingDown size={36} /> <p>Selecciona un negocio del ranking lateral.</p>
                    </div>
                  ) : (() => {
                    const history = businessRankHistory[selectedBusiness] || [];
                    const last = history[history.length - 1];
                    const worstRank = Math.max(...history.map(h => h.rank)) + 2;
                    return (
                      <div className="space-y-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                          <h3 className="text-2xl font-bold text-white mb-4">{selectedBusiness}</h3>
                          {history.length >= 2 ? (
                            <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={history} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                  <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} />
                                  <YAxis reversed domain={[1, worstRank]} stroke="#475569" tick={{ fontSize: 11 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} formatter={(val) => [`#${val}`, 'Posición Gmaps']} />
                                  <Line type="monotone" dataKey="rank" stroke="#06b6d4" strokeWidth={3} dot={{ fill: '#06b6d4', r: 5 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-slate-500 text-sm">Realiza más de 1 escaneo en distintos días para ver evolución.</p>
                          )}
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                          <h4 className="text-sm text-slate-400 font-medium mb-4">Registro Cronológico</h4>
                          <div className="space-y-3">
                            {[...history].reverse().map((snap, idx) => (
                              <div key={idx} className="flex items-center gap-4 py-2 border-b border-slate-800/50 last:border-0 text-sm">
                                <span className="text-slate-400 w-32">{snap.date}</span>
                                <span className="font-bold text-white flex-1">Raking #{snap.rank}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================== TAB: MAPA ======================== */}
        {activeTab === 'map' && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
              <Map className="text-emerald-400" /> Mapa de Oportunidades
            </h2>
            {latestScan ? (
              <MapComponent places={latestScan.places || []} />
            ) : (
              <div className="p-12 text-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-500">
                No hay datos geográficos para graficar.
              </div>
            )}
          </div>
        )}

        {/* ======================== TAB: NUEVO RASTREO ======================== */}
        {activeTab === 'new-scan' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            <form onSubmit={handleSubmitJob} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-white"><PlusCircle className="text-violet-400" /> Nuevo Spider Job</h2>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rubro</label>
                <input required type="text" value={formConfig.rubro} onChange={e => setFormConfig(p => ({ ...p, rubro: e.target.value }))} className="w-full bg-slate-800 border-slate-700 rounded-lg p-3 text-white" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ciudad / Zona</label>
                <input required type="text" value={formConfig.ciudad} onChange={e => setFormConfig(p => ({ ...p, ciudad: e.target.value }))} className="w-full bg-slate-800 border-slate-700 rounded-lg p-3 text-white" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Cantidad límite ({formConfig.maxResults})</label>
                <input type="range" min={5} max={100} step={5} value={formConfig.maxResults} onChange={e => setFormConfig(p => ({ ...p, maxResults: parseInt(e.target.value) }))} className="w-full accent-violet-500" />
              </div>
              <button disabled={submitting} type="submit" className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="animate-spin" /> : <Play />} Lanzar Spider
              </button>
              {submitSuccess && <p className="text-emerald-400 text-sm text-center">¡Trabajo enviado al servidor Playwright!</p>}
            </form>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-white"><Activity className="text-violet-400" /> Cola de Servidor</h2>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {jobs.map((job) => {
                  const cfg = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={job.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 flex items-center gap-1 text-[10px] uppercase font-bold rounded border ${cfg.className}`}>
                            <Icon size={12} className={job.status === 'running' ? 'animate-spin' : ''} /> {cfg.label}
                          </span>
                          <span className="font-bold text-white text-sm">{job.config?.rubro}</span>
                        </div>
                        {job.status === 'scheduled' && (
                          <button onClick={() => handleForceScan(job.id)} className="flex items-center gap-1 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30 transition-colors">
                            <Play size={10} fill="currentColor" /> Forzar Ahora
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{job.message}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB: HISTORIAL ======================== */}
        {activeTab === 'history' && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6"><Calendar className="text-slate-400" /> Registro de Scans Exactos</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/50">
              {scans.length === 0 && <div className="p-10 text-center text-slate-500">Vacío.</div>}
              {scans.map((scan) => (
                <div key={scan.id} className="p-5 flex justify-between items-center group">
                  <div>
                    <h3 className="font-bold text-white text-lg">{scan.location}</h3>
                    <p className="text-indigo-400 text-sm font-medium">{scan.category}</p>
                    <p className="text-xs text-slate-500 mt-1">{new Date(scan.date).toLocaleString('es-ES')}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="bg-slate-800 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-700">
                      {scan.places?.length || 0} Locales
                    </span>
                    <button onClick={(e) => handleDeleteScan(scan.id, e)} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20" title="Eliminar Escaneo Permanentemente">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
