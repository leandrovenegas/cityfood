'use client';
import React, { useState, useEffect, useMemo } from 'react';
import nextDynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Video, TrendingDown, Copy, Star, MapPin, Activity, Calendar, Search, Loader2, AlertCircle, Play, Clock, CheckCircle, XCircle, PlusCircle, RefreshCw, Trash2, Phone, Globe, Map as MapIcon, FileText, Target, DollarSign, CheckSquare, XSquare, Sparkles } from 'lucide-react';
import { db, auth, signInAnonymously } from './firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
export const dynamic = 'force-dynamic';
const MapComponent = nextDynamic(() => import('./components/MapComponent'), { ssr: false });

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

const CRM_STATUSES = [
  { id: 'Prospecto', icon: Target, color: 'slate' },
  { id: 'Primer Contacto', icon: FileText, color: 'indigo' },
  { id: 'Negociación', icon: DollarSign, color: 'amber' },
  { id: 'Ganado', icon: CheckSquare, color: 'emerald' },
  { id: 'Perdido', icon: XSquare, color: 'rose' }
];

export default function MarketSpiderDashboard() {
  const [scans, setScans] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [crmLeads, setCrmLeads] = useState([]);
  const [userConfig, setUserConfig] = useState({ 
    categories: ['Cafetería', 'Restaurante', 'Bar / Pub', 'Peluquería / Barbería', 'Gimnasio', 'Bienes Raíces', 'Hostal Residencial', 'Hotel'], 
    locations: ['Valparaíso', 'Viña del Mar', 'Santiago'] 
  });
  const [activeTab, setActiveTab] = useState('opportunities');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);
  const [generatingProposalFor, setGeneratingProposalFor] = useState(null);

  const [formConfig, setFormConfig] = useState({ rubro: '', ciudad: '', maxResults: 15, autoRepeatHours: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // 1. Auth
  useEffect(() => {
    signInAnonymously(auth).then((result) => {
      console.log("✅ Authenticated as NEW Anonymous:", result.user.uid);
      // 🔥 LA MAGIA ANTIGRAVEDAD: 
      // Ignoramos el nuevo UID de Vercel y forzamos el UID donde el Spider de Python guarda los datos.
      setUserId("Hp1YGeni2DgiWrtrIKUgmgki7UL2");
    }).catch((err) => {
      console.error("🔥 ERROR AUTH FIREBASE:", err);
      setError(`Error de Auth: ${err.message}`);
      setLoading(false);
    });
  }, []);

  // 2. Fetch Scans
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/scans`), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setScans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("🔥 ERROR FIRESTORE SCANS:", err);
      setError(`Error DB (Scans): ${err.message}`);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  // 3. Fetch Jobs
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), (err) => {
      console.error("🔥 ERROR FIRESTORE JOBS:", err);
      setError(`Error DB (Jobs): ${err.message}`);
    });
    return () => unsub();
  }, [userId]);

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

  useEffect(() => {
    if (filterOptions.length > 0 && (!filterCategory || !filterLocation)) {
      setFilterCategory(filterOptions[0].category);
      setFilterLocation(filterOptions[0].location);
    }
  }, [filterOptions, filterCategory, filterLocation]);

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
  const opportunities = latestScan?.places?.filter(p => true) || []; // Mostrar todos en oportunidades o filtrar

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
    if (!userId || !formConfig.ciudad.trim() || !formConfig.rubro.trim()) return;
    setSubmitting(true); setSubmitSuccess(false);

    // Generar un ID único determinista: evitar "Doble Tracking"
    const rubroLimpio = formConfig.rubro.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const ciudadLimpia = formConfig.ciudad.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const jobId = `job_${rubroLimpio}_${ciudadLimpia}`;

    try {
      await setDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs`, jobId), {
        status: "pending",
        config: formConfig,
        message: "Enviado a cola del Playwright Spider...",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) { setError("Error al enviar trabajo."); }
    finally { setSubmitting(false); }
  };

  // 4. Fetch CRM Leads
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/crm_leads`), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => setCrmLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), (err) => {
      console.error("🔥 ERROR FIRESTORE CRM:", err);
    });
    return () => unsub();
  }, [userId]);

  const handleAddCRM = async (place) => {
    if(!userId) return;
    const exists = crmLeads.find(lead => lead.name === place.name);
    if(exists) { alert("Este prospecto ya está en tu CRM."); return; }
    try {
      await addDoc(collection(db, `artifacts/${APP_ID}/users/${userId}/crm_leads`), {
        name: place.name,
        phone: place.phone || '',
        website: place.website || '',
        rank: place.rank || 0,
        status: 'Prospecto',
        notes: '',
        updatedAt: serverTimestamp(),
      });
      alert(`¡${place.name} movido a Seguimiento!`);
    } catch(err) {
      console.error("Error to CRM", err);
      alert("Error al agregar al CRM.");
    }
  };

  const handleUpdateCRMStatus = async (leadId, newStatus) => {
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId), { status: newStatus, updatedAt: serverTimestamp() });
  };

  const handleUpdateCRMNotes = async (leadId, newNotes) => {
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId), { notes: newNotes, updatedAt: serverTimestamp() });
  };

  const handleDeleteCRMLead = async (leadId) => {
    if (!confirm("¿Eliminar este prospecto del CRM permanentemente?")) return;
    await deleteDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId));
  };

  const handleGenerateProposal = async (lead) => {
    if (!userId) return;
    setGeneratingProposalFor(lead.id);
    try {
      const res = await fetch('/api/agent/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: lead.website || '', name: lead.name, status: lead.status })
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || "Error al conectar con la IA.");
        return;
      }
      
      await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, lead.id), {
        ai_proposal_draft: data.proposal,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert("Error crítico generando la propuesta.");
    } finally {
      setGeneratingProposalFor(null);
    }
  };

  // 5. Fetch User Config (Categories & Locations)
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, `artifacts/${APP_ID}/users/${userId}/config`, "preferences"), (docSnap) => {
      if (docSnap.exists()) {
        const defaults = ['Cafetería', 'Restaurante', 'Bar / Pub', 'Peluquería / Barbería', 'Gimnasio', 'Bienes Raíces', 'Hostal Residencial', 'Hotel'];
        const data = docSnap.data();
        setUserConfig({
           categories: data.categories ? Array.from(new Set([...defaults, ...data.categories])) : defaults,
           locations: data.locations || ['Valparaíso', 'Viña del Mar', 'Santiago']
        });
      } else {
        const defaults = ['Cafetería', 'Restaurante', 'Bar / Pub', 'Peluquería / Barbería', 'Gimnasio', 'Bienes Raíces', 'Hostal Residencial', 'Hotel'];
        setDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/config`, "preferences"), {
           categories: defaults,
           locations: ['Valparaíso', 'Viña del Mar', 'Santiago']
        }, { merge: true }).catch(console.error);
      }
    });
    return () => unsub();
  }, [userId]);

  const handleAddCategory = async () => {
    const newCat = prompt("Ingresa un nuevo Rubro (ej. 'Clínica Dental'):");
    if(!newCat || !newCat.trim()) return;
    const clean = newCat.trim();
    if(userConfig.categories.includes(clean)) return;
    const updated = [...userConfig.categories, clean];
    setUserConfig({...userConfig, categories: updated});
    await setDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/config`, "preferences"), { categories: updated }, { merge: true });
    setFormConfig(p => ({...p, rubro: clean})); // autoselect
  };

  const handleAddLocation = async () => {
    const newLoc = prompt("Ingresa una nueva Ciudad o Zona (ej. 'Cerro Alegre'):");
    if(!newLoc || !newLoc.trim()) return;
    const clean = newLoc.trim();
    if(userConfig.locations.includes(clean)) return;
    const updated = [...userConfig.locations, clean];
    setUserConfig({...userConfig, locations: updated});
    await setDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/config`, "preferences"), { locations: updated }, { merge: true });
    setFormConfig(p => ({...p, ciudad: clean})); // autoselect
  };

  const tabs = [
    { id: 'opportunities', label: 'Locales', color: 'indigo' },
    { id: 'crm', label: 'Seguimiento', color: 'amber' },
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
                    <div className="flex gap-2">
                      <button onClick={() => handleAddCRM(place)} className="flex items-center gap-1 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-3 py-2 rounded-lg transition-colors border border-amber-500/20">
                        <PlusCircle size={16} /> CRM
                      </button>
                      <button onClick={() => handleCopyPitch(place)} className="flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg transition-colors border border-white/10">
                        <Copy size={16} /> Pitch
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================== TAB: CRM ======================== */}
        {activeTab === 'crm' && (
          <div className="animate-in fade-in duration-500">
             <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
              <Target className="text-amber-400" /> CRM / Seguimiento
              <span className="ml-auto bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs border border-slate-700">
                {crmLeads.length} Prospectos
              </span>
            </h2>
            
            <div className="flex gap-6 overflow-x-auto pb-8 snap-x">
              {CRM_STATUSES.map(col => {
                const colLeads = crmLeads.filter(l => l.status === col.id);
                const ColIcon = col.icon;
                return (
                  <div key={col.id} className="min-w-[300px] w-[300px] flex-shrink-0 snap-start">
                    <div className={`bg-${col.color}-500/10 border border-${col.color}-500/30 rounded-t-xl p-3 flex justify-between items-center`}>
                      <h3 className={`font-bold text-${col.color}-400 flex items-center gap-2`}><ColIcon size={16}/> {col.id}</h3>
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-xs text-slate-300">{colLeads.length}</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 border-t-0 rounded-b-xl min-h-[500px] p-3 space-y-3">
                      {colLeads.map(lead => (
                        <div key={lead.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg flex flex-col gap-3">
                          <div>
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="font-bold text-white text-sm leading-tight pr-4">{lead.name}</h4>
                              <button onClick={() => handleDeleteCRMLead(lead.id)} className="text-slate-600 hover:text-rose-400 transition-colors" title="Borrar Prospecto"><Trash2 size={14}/></button>
                            </div>
                            <div className="flex items-center text-[10px] text-slate-400 gap-2 mb-2">
                              <span>Rank #{lead.rank}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 text-xs text-slate-300 mb-2">
                            {lead.phone && <a href={`tel:${lead.phone.replace(/\s/g,'')}`} className="flex items-center gap-2 hover:text-indigo-400"><Phone size={12}/> {lead.phone}</a>}
                            {lead.website && <a href={lead.website} target="_blank" className="flex items-center gap-2 hover:text-indigo-400"><Globe size={12}/> Sitio Web</a>}
                          </div>

                          <textarea 
                            className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 w-full h-20 resize-none focus:border-indigo-500 transition-colors"
                            placeholder="Notas de la llamada o correos..."
                            defaultValue={lead.notes}
                            onBlur={(e) => handleUpdateCRMNotes(lead.id, e.target.value)}
                          />

                          <div className="pt-3 border-t border-slate-700/50 flex flex-col gap-3">
                            <select 
                              className="bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-2 py-2 text-xs w-full focus:border-amber-500 outline-none"
                              value={lead.status}
                              onChange={(e) => handleUpdateCRMStatus(lead.id, e.target.value)}
                            >
                              {CRM_STATUSES.map(s => <option key={s.id} value={s.id}>Mover a: {s.id}</option>)}
                            </select>

                            {!lead.ai_proposal_draft ? (
                              <button 
                                onClick={() => handleGenerateProposal(lead)}
                                disabled={generatingProposalFor === lead.id}
                                className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg px-3 py-2 text-xs font-bold transition-all flex items-center justify-center gap-2"
                              >
                                {generatingProposalFor === lead.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {generatingProposalFor === lead.id ? "Analizando Funnel..." : "Generar Propuesta IA"}
                              </button>
                            ) : (
                               <div className="flex flex-col gap-2 mt-2">
                                <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1"><Sparkles size={12}/> Propuesta Generada</span>
                                <textarea
                                  className="w-full bg-slate-950 border border-indigo-500/30 rounded-lg p-3 text-xs text-slate-300 min-h-[150px] resize-y focus:border-indigo-500 transition-colors"
                                  defaultValue={`Hola Equipo de ${lead.name},\n\n${lead.ai_proposal_draft.gancho_inicial}\n\n${lead.ai_proposal_draft.analisis_competencia_maps}\n\n${lead.ai_proposal_draft.propuesta_audiovisual}\n\n${lead.ai_proposal_draft.cta_personalizado}`}
                                />
                                <button onClick={() => {
                                   navigator.clipboard.writeText(`Hola Equipo de ${lead.name},\n\n${lead.ai_proposal_draft.gancho_inicial}\n\n${lead.ai_proposal_draft.analisis_competencia_maps}\n\n${lead.ai_proposal_draft.propuesta_audiovisual}\n\n${lead.ai_proposal_draft.cta_personalizado}`);
                                   alert("¡Propuesta copiada!");
                                }} className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg px-3 py-1.5 text-xs transition-colors flex items-center justify-center gap-2">
                                  <Copy size={12}/> Copiar al Portapapeles
                                </button>
                               </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
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
              <MapIcon className="text-emerald-400" /> Mapa de Oportunidades
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
