'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Video, TrendingDown, Copy, Star, MapPin, Activity, Calendar, Search, Loader2, AlertCircle, Play, Square, Clock, CheckCircle, XCircle, PlusCircle, RefreshCw, Trash2, Phone, Globe, Map as MapIcon, FileText, Target, DollarSign, CheckSquare, XSquare, Sparkles } from 'lucide-react';
import { supabase } from './supabase';
export const dynamic = 'force-dynamic';
const MapComponent = nextDynamic(() => import('./components/MapComponent'), { ssr: false });

const APP_ID = "marketspider-v3";

const JOB_STATUS_CONFIG = {
  pending: { label: "En cola", className: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Clock },
  paused: { label: "Pausado (Cerrojo)", className: "bg-slate-500/10 text-slate-400 border-slate-500/30", icon: XCircle },
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
  const [selectedSource, setSelectedSource] = useState('gmaps');
  const [scans, setScans] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [globalBusinesses, setGlobalBusinesses] = useState([]);
  const [totalGlobalBusinesses, setTotalGlobalBusinesses] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [lastVisible, setLastVisible] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userConfig, setUserConfig] = useState({ 
    categories: ['Cafetería', 'Restaurante', 'Bar / Pub', 'Peluquería / Barbería', 'Gimnasio', 'Bienes Raíces', 'Hostal Residencial', 'Hotel'], 
    locations: ['Valparaíso', 'Viña del Mar', 'Santiago'] 
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configTab, setConfigTab] = useState('jobs');
  const [triageFilter, setTriageFilter] = useState('sin_revisar');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);

  const [formConfig, setFormConfig] = useState({ rubro: '', ciudad: '', maxResults: 15, autoRepeatHours: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [scanningGapFor, setScanningGapFor] = useState(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [toggleScraperLoading, setToggleScraperLoading] = useState(false);

  // 1. Auth
  useEffect(() => {
    setUserId('default-user');
    setLoading(false);
  }, []);

  // 2. Fetch Scans
  useEffect(() => {
    setScans([]);
  }, [userId]);

  // 3. Fetch Jobs
  useEffect(() => {
    if (!userId) return;
    const fetchJobs = async () => {
      const { data } = await supabase.from('global_job_queue').select('*').order('created_at', { ascending: false }).limit(50);
      if (data) setJobs(data);
    };
    fetchJobs();
    const channel = supabase.channel('jobs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'global_job_queue' }, fetchJobs).subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // 4. Fetch Global Businesses & Stats
  useEffect(() => {
    if (!userId) return;
    const collName = selectedSource === 'gmaps' ? 'global_businesses' : 'amarillas_businesses';
    const fetchCounts = async () => {
      try {
        const { count: globalCount } = await supabase.from(collName).select('*', { count: 'exact', head: true });
        setTotalGlobalBusinesses(globalCount || 0);
        const { count: pendingCount } = await supabase.from(collName).select('*', { count: 'exact', head: true }).eq('status', 'pending');
        setTotalPending(pendingCount || 0);
      } catch (e) {}
    };
    fetchCounts();
    const fetchBusinesses = async () => {
      const orderCol = selectedSource === 'gmaps' ? 'needscore' : 'created_at';
      const { data } = await supabase.from(collName).select('*').eq('status', 'pending').order(orderCol, { ascending: false }).limit(30);
      if (data) {
        setGlobalBusinesses(data);
        setLastVisible(30);
      }
    };
    fetchBusinesses();
    const channel = supabase.channel('biz_changes').on('postgres_changes', { event: '*', schema: 'public', table: collName }, () => {
      fetchBusinesses(); fetchCounts();
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, selectedSource]);

  const handleToggleScrapers = async (action) => {
    setToggleScraperLoading(true);
    try {
      const res = await fetch('/api/scraper-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target: 'all' })
      });
      const data = await res.json();
      if (!data.success) {
        alert("Error al " + (action === 'start' ? "arrancar" : "detener") + " los scrapers: " + data.error);
      } else {
        // success - ui will be updated naturally or wait for polling.
      }
    } catch (e) {
      alert("Error de red: " + e.message);
    } finally {
      setToggleScraperLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!lastVisible) return;
    setLoadingMore(true);
    const collName = selectedSource === 'gmaps' ? 'global_businesses' : 'amarillas_businesses';
    const orderCol = selectedSource === 'gmaps' ? 'needscore' : 'created_at';
    try {
      const { data } = await supabase.from(collName).select('*').eq('status', 'pending').order(orderCol, { ascending: false }).range(lastVisible, lastVisible + 29);
      if (data && data.length > 0) {
        setGlobalBusinesses(prev => [...prev, ...data]);
        setLastVisible(prev => prev + 30);
      } else {
        setLastVisible(null);
      }
    } catch (e) {
      console.error('Error cargando más:', e);
    } finally {
      setLoadingMore(false);
    }
  };



  // Derivar Listado de Categorias y Ciudades
  const filterOptions = useMemo(() => {
    const map = new Map();
    scans.forEach(s => { 
      if (s.category && s.location) {
        const c = s.category.trim();
        const l = s.location.trim();
        const normalizedKey = `${c.toLowerCase()}|${l.toLowerCase()}`;
        if (!map.has(normalizedKey)) {
          map.set(normalizedKey, { category: c, location: l, key: `${c}|${l}` });
        }
      } 
    });
    return Array.from(map.values());
  }, [scans]);

  // Permitir vista global por defecto (sin filtro de ciudad/rubro)
  // useEffect(() => {
  //   if (filterOptions.length > 0 && (!filterCategory || !filterLocation)) {
  //     setFilterCategory(filterOptions[0].category);
  //     setFilterLocation(filterOptions[0].location);
  //   }
  // }, [filterOptions, filterCategory, filterLocation]);

  // Scans filtrados globalmente (para Tracking y Mapa y Oportunidades)
  const filteredScans = useMemo(() => {
    if (!filterCategory || !filterLocation) return [];
    const fc = filterCategory.trim().toLowerCase();
    const fl = filterLocation.trim().toLowerCase();
    return scans.filter(s => 
      s.category && s.location && 
      s.category.trim().toLowerCase() === fc && 
      s.location.trim().toLowerCase() === fl
    );
  }, [scans, filterCategory, filterLocation]);

  const latestScan = filteredScans[0];
  
  // Triage: Los prospectos ya vienen filtrados por 'pending' y ordenados por 'needScore' desde Firestore
  const opportunities = globalBusinesses;

  // Tracking Histórico Segmentado
  const businessRankHistory = useMemo(() => {
    const map = {};
    const sortedScans = [...filteredScans].sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedScans.forEach(scan => {
      scan.places?.forEach(place => {
        if (!map[place.name]) map[place.name] = [];
        map[place.name].push({
          scanId: scan.id,
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

  const handleDeletePlace = async (scanId, placeName) => {};

  const handleDeleteScan = async (scanId, e) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este escaneo entero? Se perderá permanentemente del tracking.")) return;
    await supabase.from('scans').delete().eq('id', scanId);
  };

  const handleForceScan = async (jobId) => {
    await supabase.from('global_job_queue').update({ status: 'pending', message: 'Forzado manual...' }).eq('id', jobId);
  };

  const handleSubmitJob = async (e) => {
    e.preventDefault();
    if (!userId || !formConfig.ciudad.trim() || !formConfig.rubro.trim()) return;
    setSubmitting(true); setSubmitSuccess(false);

    // Generar un ID único determinista: evitar "Doble Tracking"
    const rubroLimpio = formConfig.rubro.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const ciudadLimpia = formConfig.ciudad.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const jobId = `job_${rubroLimpio}_${ciudadLimpia}`;

    try {
      const { error } = await supabase.from('global_job_queue').upsert({
        id: jobId,
        status: "pending",
        config: formConfig,
        message: "Enviado a cola del Playwright Spider..."
      }, { onConflict: 'id' });
      if (error) throw error;
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) { setError("Error al enviar trabajo."); }
    finally { setSubmitting(false); }
  };

  // 4. Fetch CRM Leads (Migrated to Supabase in lines 155-165)



  const handleToggleJobStatus = async (jobId, currentStatus) => {
    try {
      const newStatus = (currentStatus === 'pending' || currentStatus === 'scheduled') ? 'paused' : 'pending';
      await supabase.from('global_job_queue').update({ status: newStatus }).eq('id', jobId);
    } catch (e) {
      console.error("Error al pausar/reanudar el trabajo:", e);
      alert("Error al cambiar el estado del trabajo.");
    }
  };


  // 5. Fetch User Config (Categories & Locations)
  useEffect(() => {
    if (!userId) return;
    // Configura fetched eliminated for now
  }, [userId]);

  const handleAddCategory = async () => {
    const newCat = prompt("Ingresa un nuevo Rubro (ej. 'Clínica Dental'):");
    if(!newCat || !newCat.trim()) return;
    const clean = newCat.trim();
    if(userConfig.categories.includes(clean)) return;
    const updated = [...userConfig.categories, clean];
    setUserConfig({...userConfig, categories: updated});
    setFormConfig(p => ({...p, rubro: clean})); // autoselect
  };

  const handleAddLocation = async () => {
    const newLoc = prompt("Ingresa una nueva Ciudad o Zona (ej. 'Cerro Alegre'):");
    if(!newLoc || !newLoc.trim()) return;
    const clean = newLoc.trim();
    if(userConfig.locations.includes(clean)) return;
    const updated = [...userConfig.locations, clean];
    setUserConfig({...userConfig, locations: updated});
    setFormConfig(p => ({...p, ciudad: clean})); // autoselect
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', color: 'emerald' },
    { id: 'opportunities', label: 'Locales', color: 'indigo' },
    { id: 'config', label: 'Configuración', color: 'slate' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
      <Loader2 className="animate-spin text-indigo-500" size={48} />
      <p className="animate-pulse">Cargando MarketSpider V3...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-rose-500/10 border border-rose-500/30 p-8 rounded-2xl max-w-lg">
        <AlertCircle className="text-rose-400 mx-auto mb-4" size={48} />
        <h2 className="text-2xl font-bold text-white mb-2">Conexión Fallida</h2>
        <p className="text-rose-300 font-mono text-sm mb-4">{error}</p>
        <p className="text-slate-400 text-sm">Abre la Consola (F12) para obtener más detalles técnicos del bloqueo.</p>
      </div>
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
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <p className="text-slate-400 text-sm flex items-center gap-2">Google Maps Directory & Ranking suite</p>
            <Link href="/directorio" className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold px-3 py-1.5 rounded-full border border-emerald-500/30 transition-colors shadow-sm shadow-emerald-500/10 flex items-center gap-2">🗃️ Ver Directorio Consolidado</Link>
            <Link href="/global" className="text-xs bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-400 font-bold px-3 py-1.5 rounded-full border border-fuchsia-500/30 transition-colors shadow-sm shadow-fuchsia-500/10 flex items-center gap-2">🌐 Rastreador GLOBAL 24/7</Link>
          </div>
        </div>
        <nav className="mt-4 md:mt-0 flex flex-wrap gap-2 items-center">
          {/* Selector de Origen de Datos Global */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 mr-4 shadow-inner">
            <button
              type="button"
              onClick={() => { setSelectedSource('gmaps'); setSelectedBusiness(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedSource === 'gmaps' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              📍 GMaps
            </button>
            <button
              type="button"
              onClick={() => { setSelectedSource('amarillas'); setSelectedBusiness(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedSource === 'amarillas' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              💛 Amarillas
            </button>
          </div>

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
      {(activeTab === 'opportunities' || activeTab === 'tracking') && (
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

        {/* ======================== TAB: DASHBOARD ======================== */}
        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in duration-500 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Activity className="text-emerald-400" size={28} />
                <h2 className="text-2xl font-bold text-white">Resumen Global</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleToggleScrapers('start')}
                  disabled={toggleScraperLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <Play size={16} /> Arrancar
                </button>
                <button 
                  onClick={() => handleToggleScrapers('stop')}
                  disabled={toggleScraperLoading}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <Square size={16} /> Detener
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500 group-hover:scale-110 transition-transform"><Globe size={64}/></div>
                <p className="text-slate-400 font-semibold mb-1 relative z-10 text-sm uppercase tracking-wider">Total Extraídos</p>
                <h3 className="text-4xl font-black text-white relative z-10">{totalGlobalBusinesses}</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-indigo-500 group-hover:scale-110 transition-transform"><Star size={64}/></div>
                <p className="text-slate-400 font-semibold mb-1 relative z-10 text-sm uppercase tracking-wider">Pendientes Revisión</p>
                <h3 className="text-4xl font-black text-indigo-400 relative z-10">
                  {totalPending}
                </h3>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Sparkles className="text-indigo-400"/> Sugerencia de Prospección</h3>
              <p className="text-slate-400 text-sm">
                Tienes <strong className="text-indigo-400">{globalBusinesses.filter(b => b.status !== 'crm' && b.status !== 'discarded').length} locales</strong> esperando triage. 
                Ve a la pestaña <strong>Locales</strong> para evaluar los leads ordenados automáticamente por nivel de necesidad (Need Score).
              </p>
              <button 
                onClick={() => setActiveTab('opportunities')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                Comenzar Triage
              </button>
            </div>
            
          </div>
        )}

        {/* ======================== TAB: OPORTUNIDADES ======================== */}
        {activeTab === 'opportunities' && (() => {
          const visiblePlaces = localSearch
            ? opportunities.filter(p => p.name?.toLowerCase().includes(localSearch.toLowerCase()))
            : opportunities;

          return (
          <div className="animate-in fade-in duration-500">
            {/* Header + Contadores */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Star className="text-amber-400" /> Triage de Locales
              </h2>
              {/* Buscador por nombre */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar local..."
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white pl-8 pr-3 py-1.5 rounded-full text-xs focus:border-amber-500 focus:outline-none transition-colors w-40"
                />
              </div>
              <div className="ml-auto text-sm text-slate-400 font-medium bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                Mostrando <strong className="text-indigo-400">{visiblePlaces.length}</strong> prospectos ordenados por <span className="text-amber-400">Nivel de Necesidad (Score)</span>
              </div>
            </div>

            {visiblePlaces.length === 0 ? (
              <div className="py-24 text-center text-slate-500 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
                <p className="text-lg">No hay locales en esta categoría.</p>
                <p className="text-sm mt-1 text-slate-600">Cambia el filtro de vista o realiza un nuevo rastreo.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePlaces.map((place, idx) => {
                const score = place.needScore || 0;
                let scoreColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
                if (score >= 20) scoreColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
                if (score >= 40) scoreColor = 'text-rose-400 border-rose-500/30 bg-rose-500/10';
                
                return (
                <div key={idx} className={`group relative bg-slate-900 border border-slate-700 rounded-2xl p-6 transition-all flex flex-col justify-between`}>

                  {/* Badge de Need Score top-left */}
                  <span className={`absolute top-4 left-4 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${scoreColor}`}>
                    Need Score: {score}
                  </span>

                  {/* Boton Borrar */}
                  <button onClick={() => handleSetStatus(place, 'discarded')}
                    className="absolute top-4 right-4 bg-slate-950/50 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 p-1.5 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                    title="Descartar local"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div className="mt-7">
                    <h3 className="font-bold text-lg text-white mb-2 pr-2">{place.name}</h3>
                    <div className="flex items-center text-xs text-slate-400 gap-3 mb-4 flex-wrap">
                      {selectedSource === 'gmaps' ? (
                        <>
                          <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" /> {place.rating} ({place.reviews})</span>
                          <span className="flex items-center gap-1 font-bold text-indigo-400">Rank #{place.rank}</span>
                          {place.hasVideo === false && <span className="flex items-center gap-1 text-rose-300"><Video size={12}/> Sin Video</span>}
                          {place.claimed === false && <span className="flex items-center gap-1 text-orange-300"><AlertCircle size={12}/> Ficha Abandonada</span>}
                        </>
                      ) : (
                        <>
                          <span className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-amber-500/20">{place.rubro}</span>
                          <span className="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-indigo-500/20">{place.country?.toUpperCase()}</span>
                          {(!place.whatsapp || place.whatsapp.length === 0) && <span className="flex items-center gap-1 text-rose-300">💬 Sin WhatsApp</span>}
                        </>
                      )}
                    </div>

                    <div className="space-y-3 mb-5 bg-slate-950 p-4 rounded-xl border border-white/5 text-sm">
                      <div className="flex items-center gap-3">
                        <Phone size={14} className="text-slate-500 shrink-0" />
                        {selectedSource === 'gmaps' ? (
                          place.phone ? <a href={`tel:${place.phone.replace(/\s/g, '')}`} className="text-indigo-400 hover:underline truncate">{place.phone}</a> : <span className="text-slate-600">No listado</span>
                        ) : (
                          place.phones && place.phones.length > 0 ? <a href={`tel:${place.phones[0].replace(/\s/g, '')}`} className="text-indigo-400 hover:underline truncate">{place.phones[0]}</a> : <span className="text-slate-600">No listado</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Globe size={14} className="text-slate-500 shrink-0" />
                        {selectedSource === 'gmaps' ? (
                          (place.website || place.url) ? <a href={place.website || place.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">Visitar Web</a> : <span className="text-slate-600">No listada</span>
                        ) : (
                          place.websites && place.websites.length > 0 ? <a href={place.websites[0]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">{place.websites[0].replace(/^https?:\/\/(www\.)?/, '')}</a> : <span className="text-slate-600">No listada</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <MapIcon size={14} className="text-slate-500 shrink-0" />
                        {selectedSource === 'gmaps' ? (
                          <a href={place.gmapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.location || ''))}`}
                            target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">
                            Ver en Google Maps
                          </a>
                        ) : (
                          <a href={place.ficha_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">
                            Ver Ficha Original
                          </a>
                        )}
                      </div>
                    </div>
                  </div>


                </div>);
              })}
            </div>
            )}

            {/* Pagination Button */}
            {lastVisible && !localSearch && (
              <div className="mt-8 flex justify-center">
                <button 
                  onClick={handleLoadMore} 
                  disabled={loadingMore}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-full font-bold transition-all border border-slate-700 flex items-center gap-2"
                >
                  {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {loadingMore ? 'Cargando...' : 'Cargar Más Prospectos'}
                </button>
              </div>
            )}
          </div>);
        })()}



        {/* ======================== TAB: CONFIGURACION ======================== */}
        {activeTab === 'config' && (
          <div className="animate-in fade-in duration-500">
            {/* Sub-Navegación de Configuración */}
            <div className="flex flex-wrap gap-4 border-b border-slate-800 pb-4 mb-6">
              <button onClick={() => setConfigTab('jobs')} className={`pb-2 border-b-2 font-bold transition-all ${configTab === 'jobs' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Trabajos de Araña</button>
              <button onClick={() => setConfigTab('new-scan')} className={`pb-2 border-b-2 font-bold transition-all ${configTab === 'new-scan' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Nuevo Rastreo</button>
              <button onClick={() => setConfigTab('tracking')} className={`pb-2 border-b-2 font-bold transition-all ${configTab === 'tracking' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Tracking Global</button>
              <button onClick={() => setConfigTab('history')} className={`pb-2 border-b-2 font-bold transition-all ${configTab === 'history' ? 'border-slate-400 text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>Historial</button>
            </div>

            {/* SECCION: TRACKING */}
            {configTab === 'tracking' && (
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
                              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0 text-sm group">
                                <div className="flex items-center gap-4">
                                  <span className="text-slate-400 w-32">{snap.date}</span>
                                  <span className="font-bold text-white flex-1">Ranking #{snap.rank}</span>
                                </div>
                                <button
                                  onClick={() => handleDeletePlace(snap.scanId, selectedBusiness)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                  title="Quitar este punto del historial (Snapshot con error)"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

            {/* SECCION: NUEVO RASTREO */}
            {configTab === 'new-scan' && (
              <div className="animate-in fade-in max-w-2xl mx-auto">
                <form onSubmit={handleSubmitJob} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-white"><PlusCircle className="text-violet-400" /> Nuevo Spider Job</h2>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rubro (Agrupación Estricta)</label>
                <div className="flex gap-2">
                  <select required value={formConfig.rubro} onChange={e => setFormConfig(p => ({ ...p, rubro: e.target.value }))} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:border-violet-500 outline-none">
                    <option value="">Selecciona o añade un rubro...</option>
                    {userConfig.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <button type="button" onClick={handleAddCategory} className="bg-slate-800 border border-slate-700 text-slate-300 hover:text-white px-4 rounded-lg flex items-center justify-center transition-colors shadow" title="Añadir Rubro Personalizado">
                    <PlusCircle size={20} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ciudad / Zona Estricta</label>
                <div className="flex gap-2">
                  <select required value={formConfig.ciudad} onChange={e => setFormConfig(p => ({ ...p, ciudad: e.target.value }))} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:border-violet-500 outline-none">
                    <option value="">Selecciona o añade una ciudad/zona...</option>
                    {userConfig.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                  <button type="button" onClick={handleAddLocation} className="bg-slate-800 border border-slate-700 text-slate-300 hover:text-white px-4 rounded-lg flex items-center justify-center transition-colors shadow" title="Añadir Ciudad Personalizada">
                    <PlusCircle size={20} />
                  </button>
                </div>
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
            </div>
            )}

            {/* SECCION: TRABAJOS Y ARAÑA */}
            {configTab === 'jobs' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 animate-in fade-in">
                <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-white"><Activity className="text-violet-400" /> Cola de Servidor y Control de Arañas</h2>
                <p className="text-sm text-slate-400 mb-6">Aquí puedes monitorear los trabajos que procesa el motor de Python. Usa el cerrojo para detener o reanudar tareas individuales.</p>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {jobs.length === 0 && <p className="text-slate-500 text-center py-8">No hay trabajos en cola.</p>}
                  {jobs.map((job) => {
                    const cfg = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.pending;
                    const Icon = cfg.icon;
                    const isPausable = job.status === 'pending' || job.status === 'scheduled';
                    const isResumable = job.status === 'paused';
                    return (
                      <div key={job.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 flex items-center gap-1 text-[10px] uppercase font-bold rounded border ${cfg.className}`}>
                              <Icon size={12} className={job.status === 'running' ? 'animate-spin' : ''} /> {cfg.label}
                            </span>
                            <span className="font-bold text-white text-sm">{job.config?.rubro || 'Trabajo del Sistema'}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {job.status === 'scheduled' && (
                              <button onClick={() => handleForceScan(job.id)} className="flex items-center gap-1 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30 transition-colors">
                                <Play size={10} fill="currentColor" /> Forzar Ahora
                              </button>
                            )}
                            {isPausable && (
                              <button onClick={() => handleToggleJobStatus(job.id, job.status)} className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded hover:bg-amber-500/30 transition-colors border border-amber-500/50" title="Pausar Araña (Cerrojo)">
                                ⏸️ Pausar
                              </button>
                            )}
                            {isResumable && (
                              <button onClick={() => handleToggleJobStatus(job.id, job.status)} className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-500/30 transition-colors border border-emerald-500/50" title="Reanudar Araña (Quitar Cerrojo)">
                                ▶️ Reanudar
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400">{job.message}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

        {/* ======================== TAB: HISTORIAL ======================== */}
        {configTab === 'history' && (
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

        </div>
        )}

      </main>


    </div>
  );
}
