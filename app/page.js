'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Video, TrendingDown, Copy, Star, MapPin, Activity, Calendar, Search, Loader2, AlertCircle, Play, Clock, CheckCircle, XCircle, PlusCircle, RefreshCw, Trash2, Phone, Globe, Map as MapIcon, FileText, Target, DollarSign, CheckSquare, XSquare, Sparkles } from 'lucide-react';
import { db, auth, signInAnonymously } from './firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, limit, startAfter, getDocs, getCountFromServer, where } from "firebase/firestore";
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

const CRM_STATUSES = [
  { id: 'Prospecto', icon: Target, color: 'slate' },
  { id: 'Primer Contacto', icon: FileText, color: 'indigo' },
  { id: 'Negociación', icon: DollarSign, color: 'amber' },
  { id: 'Ganado', icon: CheckSquare, color: 'emerald' },
  { id: 'Perdido', icon: XSquare, color: 'rose' }
];

const OPPORTUNITY_GAPS = [
  { id: 'no_reclamada',   emoji: '🔓', label: 'Ficha no reclamada',    color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { id: 'sin_web',        emoji: '🌐', label: 'Sin sitio web',        color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  { id: 'sin_video',      emoji: '🎥', label: 'Sin video',            color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  { id: 'sin_menu',       emoji: '🍽️', label: 'Sin carta/menú',      color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  { id: 'sin_respuesta',  emoji: '💬', label: 'No responde reviews',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { id: 'fotos_viejas',   emoji: '📷', label: 'Fotos desactualizadas', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { id: 'solo_social',    emoji: '📱', label: 'Solo redes sociales',  color: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  { id: 'rating_bajo',    emoji: '⭐', label: 'Rating bajo',          color: 'bg-amber-600/20 text-amber-200 border-amber-600/40' },
];

export default function MarketSpiderDashboard() {
  const [scans, setScans] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [crmLeads, setCrmLeads] = useState([]);
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
  const [generatingProposalFor, setGeneratingProposalFor] = useState(null);

  const [formConfig, setFormConfig] = useState({ rubro: '', ciudad: '', maxResults: 15, autoRepeatHours: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [scanningGapFor, setScanningGapFor] = useState(null);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [crmSearch, setCrmSearch] = useState('');
  const [localSearch, setLocalSearch] = useState('');

  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({ name: '', phone: '', website: '' });

  // 1. Auth
  useEffect(() => {
    signInAnonymously(auth).then((result) => {
      console.log("✅ Authenticated as NEW Anonymous:", result.user.uid);
      setUserId(result.user.uid);
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

  // 4. Fetch Global Businesses & Stats
  useEffect(() => {
    if (!userId) return;

    // A. Contadores estáticos (muy baratos en lecturas)
    const fetchCounts = async () => {
      try {
        const collRef = collection(db, `artifacts/${APP_ID}/global_businesses`);
        const snapshotGlobal = await getCountFromServer(collRef);
        setTotalGlobalBusinesses(snapshotGlobal.data().count);
        
        const qPending = query(collRef, where("status", "==", "pending"));
        const snapshotPending = await getCountFromServer(qPending);
        setTotalPending(snapshotPending.data().count);
      } catch (e) {
        console.error("Error fetching counts", e);
      }
    };
    fetchCounts();

    // B. Obtener los primeros 30 locales pendientes para Triage (Paginado)
    const q = query(
      collection(db, `artifacts/${APP_ID}/global_businesses`),
      where("status", "==", "pending"),
      orderBy("needScore", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setGlobalBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    }, (err) => {
      console.error("🔥 ERROR FIRESTORE GLOBAL BUSINESSES:", err);
    });
    return () => unsub();
  }, [userId]);

  const handleLoadMore = async () => {
    if (!lastVisible) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, `artifacts/${APP_ID}/global_businesses`),
        where("status", "==", "pending"),
        orderBy("needScore", "desc"),
        startAfter(lastVisible),
        limit(30)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setGlobalBusinesses(prev => [...prev, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))]);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setLastVisible(null); // no hay mas
      }
    } catch (e) {
      console.error("Error cargando más:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  // 5. Fetch CRM Leads
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `artifacts/${APP_ID}/users/${userId}/crm_leads`));
    const unsub = onSnapshot(q, (snapshot) => {
      setCrmLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("🔥 ERROR FIRESTORE CRM LEADS:", err);
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

  const handleDeletePlace = async (scanId, placeName) => {
    if (!confirm(`¿Eliminar permanentemente a ${placeName} de la base de datos?`)) return;
    const scan = scans.find(s => s.id === scanId);
    if (!scan) return;
    const newPlaces = scan.places.filter(p => p.name !== placeName);
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scans/`, scanId), { places: newPlaces });
  };

  const handleSetStatus = async (place, newStatus) => {
    if (!userId) return;
    
    // Actualizar el estado en globalBusinesses
    if (place.id) {
       await updateDoc(doc(db, `artifacts/${APP_ID}/global_businesses`, place.id), { status: newStatus });
    }

    // Si lo manda al CRM, también lo agrega como lead
    if (newStatus === 'crm') {
      const exists = crmLeads.find(lead => lead.name === place.name);
      if (!exists) {
        await addDoc(collection(db, `artifacts/${APP_ID}/users/${userId}/crm_leads`), {
          name: place.name, 
          phone: place.phone || '', 
          website: place.url || place.website || '',
          rank: place.rank || 0, 
          status: 'Prospecto', 
          notes: '', 
          updatedAt: serverTimestamp(),
          global_id: place.id || null
        });
      }
    }
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

  const handleAddManualLead = async (e) => {
    e.preventDefault();
    if (!userId || !newLeadData.name.trim()) return;
    const exists = crmLeads.find(lead => lead.name.toLowerCase() === newLeadData.name.trim().toLowerCase());
    if (exists) { alert("Ya existe un prospecto con ese nombre en tu CRM."); return; }
    try {
      await addDoc(collection(db, `artifacts/${APP_ID}/users/${userId}/crm_leads`), {
        name: newLeadData.name.trim(),
        phone: newLeadData.phone.trim() || '',
        website: newLeadData.website.trim() || '',
        rank: 0,
        status: 'Prospecto',
        notes: 'Agregado manualmente.',
        updatedAt: serverTimestamp(),
      });
      setShowAddLeadModal(false);
      setNewLeadData({ name: '', phone: '', website: '' });
      alert(`¡${newLeadData.name.trim()} agregado al CRM!`);
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

  const handleUpdateCRMField = async (leadId, field, value) => {
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId), { [field]: value, updatedAt: serverTimestamp() });
  };

  const handleToggleGap = async (leadId, gapId, currentGaps) => {
    const gaps = currentGaps || [];
    const newGaps = gaps.includes(gapId) ? gaps.filter(g => g !== gapId) : [...gaps, gapId];
    await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId), { gaps: newGaps, updatedAt: serverTimestamp() });
  };

  const handleDeepScan = async (lead) => {
    if (!lead.website || !lead.website.startsWith('http')) {
      alert("El prospecto no tiene un sitio web válido configurado (debe empezar con http:// o https://).");
      return;
    }
    setScanningGapFor(lead.id);
    try {
      await addDoc(collection(db, `artifacts/${APP_ID}/deep_scan_queue`), {
        leadId: lead.id,
        userId: userId,
        url: lead.website,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      alert("Enviado al Deep Spider 🕸️. Los datos aparecerán pronto en esta ficha.");
    } catch (err) {
      console.error('Error enviando a cola deep scan:', err);
    } finally {
      setTimeout(() => setScanningGapFor(null), 2000); // mostrar spinner 2 seg
    }
  };

  const handleDeleteCRMLead = async (leadId) => {
    if (!confirm("¿Eliminar este prospecto del CRM permanentemente?")) return;
    await deleteDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/crm_leads/`, leadId));
  };

  const handleToggleJobStatus = async (jobId, currentStatus) => {
    try {
      const newStatus = (currentStatus === 'pending' || currentStatus === 'scheduled') ? 'paused' : 'pending';
      await updateDoc(doc(db, `artifacts/${APP_ID}/users/${userId}/scan_jobs/`, jobId), { status: newStatus });
    } catch (e) {
      console.error("Error al pausar/reanudar el trabajo:", e);
      alert("Error al cambiar el estado del trabajo.");
    }
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
    { id: 'dashboard', label: 'Dashboard', color: 'emerald' },
    { id: 'opportunities', label: 'Locales', color: 'indigo' },
    { id: 'crm', label: 'Seguimiento', color: 'amber' },
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
            <Link href="/cotizador" className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold px-3 py-1.5 rounded-full border border-indigo-500/30 transition-colors shadow-sm shadow-indigo-500/10 flex items-center gap-2"><FileText size={14}/> CotizaPro Generator</Link>
          </div>
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
            <div className="flex items-center gap-3 mb-4">
              <Activity className="text-emerald-400" size={28} />
              <h2 className="text-2xl font-bold text-white">Resumen Global</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500 group-hover:scale-110 transition-transform"><Target size={64}/></div>
                <p className="text-slate-400 font-semibold mb-1 relative z-10 text-sm uppercase tracking-wider">En Embudo CRM</p>
                <h3 className="text-4xl font-black text-amber-400 relative z-10">{crmLeads.length}</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500 group-hover:scale-110 transition-transform"><CheckSquare size={64}/></div>
                <p className="text-slate-400 font-semibold mb-1 relative z-10 text-sm uppercase tracking-wider">Ventas Ganadas</p>
                <h3 className="text-4xl font-black text-emerald-400 relative z-10">
                  {crmLeads.filter(l => l.status === 'Ganado').length}
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
                      <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" /> {place.rating} ({place.reviews})</span>
                      <span className="flex items-center gap-1 font-bold text-indigo-400">Rank #{place.rank}</span>
                      {place.hasVideo === false && <span className="flex items-center gap-1 text-rose-300"><Video size={12}/> Sin Video</span>}
                      {place.claimed === false && <span className="flex items-center gap-1 text-orange-300"><AlertCircle size={12}/> Ficha Abandonada</span>}
                    </div>

                    <div className="space-y-3 mb-5 bg-slate-950 p-4 rounded-xl border border-white/5 text-sm">
                      <div className="flex items-center gap-3">
                        <Phone size={14} className="text-slate-500 shrink-0" />
                        {place.phone ? <a href={`tel:${place.phone.replace(/\s/g, '')}`} className="text-indigo-400 hover:underline truncate">{place.phone}</a> : <span className="text-slate-600">No listado</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Globe size={14} className="text-slate-500 shrink-0" />
                        {(place.website || place.url) ? <a href={place.website || place.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">Visitar Web</a> : <span className="text-slate-600">No listada</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <MapIcon size={14} className="text-slate-500 shrink-0" />
                        <a href={place.gmapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.location || ''))}`}
                          target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">
                          Ver en Google Maps
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Botonera de Triaje Rápido */}
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleSetStatus(place, 'discarded')}
                        className={`text-xs py-2 px-2 rounded-lg border transition-all font-bold bg-slate-800 text-slate-400 border-slate-700 hover:border-rose-500/40 hover:text-rose-400 hover:bg-rose-500/10`}>
                        ❌ Descartar
                      </button>
                      <button onClick={() => handleSetStatus(place, 'crm')}
                        className={`text-xs py-2 px-2 rounded-lg border transition-all font-bold bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500 hover:text-white`}>
                        ✅ Pasar al CRM
                      </button>
                    </div>
                    <button onClick={() => handleCopyPitch(place)} className="w-full flex items-center justify-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-slate-300 py-1.5 px-3 rounded-lg transition-colors border border-white/10">
                      <Copy size={13} /> Copiar Pitch de Venta
                    </button>
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

        {/* ======================== TAB: CRM ======================== */}
        {activeTab === 'crm' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Target className="text-amber-400" /> CRM / Seguimiento
                <span className="ml-2 bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs border border-slate-700">
                  {crmLeads.length} Prospectos
                </span>
              </h2>
              <div className="ml-auto flex flex-wrap items-center gap-4">
                <button
                  onClick={() => setShowAddLeadModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
                >
                  <PlusCircle size={14} /> Añadir Manual
                </button>
                {crmSearch && (
                  <span className="text-xs text-indigo-400 font-bold animate-pulse">
                    {crmLeads.filter(l => l.name?.toLowerCase().includes(crmSearch.toLowerCase())).length} resultados
                  </span>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                  <input
                    type="text"
                    placeholder="Buscar prospecto..."
                    value={crmSearch}
                    onChange={e => setCrmSearch(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white pl-9 pr-4 py-2 rounded-xl text-sm focus:border-indigo-500 focus:outline-none transition-colors w-56 shadow-inner shadow-black/20"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-6 overflow-x-auto pb-8 snap-x">
              {CRM_STATUSES.map(col => {
                const colLeads = crmLeads.filter(l => {
                  const matchesCol = l.status === col.id;
                  const matchesSearch = !crmSearch || l.name?.toLowerCase().includes(crmSearch.toLowerCase());
                  return matchesCol && matchesSearch;
                });
                const ColIcon = col.icon;
                return (
                  <div key={col.id} className="min-w-[300px] w-[300px] flex-shrink-0 snap-start">
                    <div className={`bg-${col.color}-500/10 border border-${col.color}-500/30 rounded-t-xl p-3 flex justify-between items-center ${col.id === 'Ganado' ? 'ring-2 ring-emerald-500/50 relative overflow-hidden' : ''}`}>
                      {col.id === 'Ganado' && <div className="absolute top-0 right-0 p-1 bg-emerald-500 text-[8px] font-extrabold text-white rotate-45 transform translate-x-3 -translate-y-3 px-4 uppercase tracking-tighter">Éxito</div>}
                      <h3 className={`font-bold text-${col.color}-400 flex items-center gap-2`}><ColIcon size={16}/> {col.id}</h3>
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-xs text-slate-300">{colLeads.length}</span>
                    </div>
                    <div className={`bg-slate-900 border border-slate-800 border-t-0 rounded-b-xl min-h-[500px] p-3 space-y-3 ${col.id === 'Ganado' ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}>
                      {colLeads.length === 0 && (
                        <div className="h-40 flex flex-col items-center justify-center text-slate-700 border border-dashed border-slate-800 rounded-lg">
                           <ColIcon size={24} className="opacity-20 mb-2" />
                           <p className="text-[10px] uppercase font-bold tracking-widest">Vacío</p>
                        </div>
                      )}
                      {colLeads.map(lead => (
                        <div key={lead.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg flex flex-col gap-3">
                          <div>
                            <div className="flex justify-between items-start mb-1">
                              <Link href={`/crm/${lead.id}`} className="font-bold text-white text-sm leading-tight pr-4 hover:text-indigo-400 transition-colors flex-1">
                                {lead.name}
                              </Link>
                              <button onClick={() => handleDeleteCRMLead(lead.id)} className="text-slate-600 hover:text-rose-400 transition-colors" title="Borrar Prospecto"><Trash2 size={14}/></button>
                            </div>
                            <div className="flex items-center text-[10px] text-slate-400 gap-2 mb-2">
                              <span>Rank #{lead.rank}</span>
                              {lead.updatedAt && (
                                <span className="opacity-60 flex items-center gap-1">
                                  · <Calendar size={8} /> {new Date(lead.updatedAt?.seconds * 1000).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 text-xs text-slate-300">
                            {lead.phone && <a href={`tel:${lead.phone.replace(/\s/g,'')}`} className="flex items-center gap-2 hover:text-indigo-400"><Phone size={12}/> {lead.phone}</a>}
                            {lead.website && <a href={lead.website} target="_blank" className="flex items-center gap-2 hover:text-indigo-400"><Globe size={12}/> Sitio Web</a>}
                            <a href={lead.gmapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name)}`}
                              target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-blue-400 text-blue-500">
                              <MapPin size={12}/> Ver en Google Maps
                            </a>
                          </div>

                          {/* --- GAPS DE OPORTUNIDAD --- */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Datos / Brechas
                              </p>
                              <button
                                onClick={() => handleDeepScan(lead)}
                                disabled={scanningGapFor === lead.id}
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border bg-indigo-900/50 border-indigo-700 text-indigo-300 hover:border-indigo-500 hover:bg-indigo-600/20 hover:text-indigo-200 transition-all disabled:opacity-50 shadow-sm"
                                title="Extraer Emails y RRSS automáticamente del sitio web"
                              >
                                {scanningGapFor === lead.id
                                  ? <><Loader2 size={10} className="animate-spin" /> Escaneando...</>
                                  : <><RefreshCw size={10} /> Deep Spider (Web)</>
                                }
                              </button>
                            </div>
                            
                            {/* Deep Spider Results */}
                            {lead.deepScrape && (
                              <div className="bg-slate-950 p-2 rounded-lg border border-indigo-500/30 text-xs mb-2 space-y-1 text-slate-300">
                                <p className="text-[10px] font-bold text-indigo-400 mb-1">Resultados Deep Spider:</p>
                                {lead.deepScrape.emails?.length > 0 && (
                                  <p className="truncate"><strong className="text-white">✉️ Emails:</strong> {lead.deepScrape.emails.join(', ')}</p>
                                )}
                                {lead.deepScrape.socials?.length > 0 && (
                                  <p className="truncate"><strong className="text-white">📱 RRSS:</strong> {lead.deepScrape.socials.join(', ')}</p>
                                )}
                                {lead.deepScrape.video_count !== undefined && (
                                  <p><strong className="text-white">🎥 Videos en web:</strong> {lead.deepScrape.video_count}</p>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                              {OPPORTUNITY_GAPS.map(gap => {
                                const active = (lead.gaps || []).includes(gap.id);
                                return (
                                  <button
                                    key={gap.id}
                                    onClick={() => handleToggleGap(lead.id, gap.id, lead.gaps)}
                                    title={gap.label}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${
                                      active
                                        ? gap.color + ' shadow-sm'
                                        : 'bg-slate-900 text-slate-600 border-slate-700 hover:border-slate-500 hover:text-slate-400'
                                    }`}
                                  >
                                    <span>{gap.emoji}</span>
                                    {active && <span className="max-w-[80px] truncate">{gap.label}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* --- DATOS DEL CAMPO (manuales) --- */}
                          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-3 space-y-2">
                            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Datos del Campo
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-pink-400 shrink-0 text-sm">@</span>
                                <input
                                  type="text"
                                  placeholder="Instagram (@handle)"
                                  defaultValue={lead.instagram || ''}
                                  onBlur={(e) => handleUpdateCRMField(lead.id, 'instagram', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:border-pink-500/50 focus:outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sky-400 shrink-0 text-xs">✉</span>
                                <input
                                  type="email"
                                  placeholder="Email de contacto"
                                  defaultValue={lead.email || ''}
                                  onBlur={(e) => handleUpdateCRMField(lead.id, 'email', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:border-sky-500/50 focus:outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 shrink-0 text-xs">👤</span>
                                <input
                                  type="text"
                                  placeholder="Nombre del encargado"
                                  defaultValue={lead.contact_name || ''}
                                  onBlur={(e) => handleUpdateCRMField(lead.id, 'contact_name', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:border-slate-500/50 focus:outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-violet-400 shrink-0 text-xs">🔵</span>
                                <input
                                  type="text"
                                  placeholder="Facebook / otra red"
                                  defaultValue={lead.facebook || ''}
                                  onBlur={(e) => handleUpdateCRMField(lead.id, 'facebook', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:border-violet-500/50 focus:outline-none transition-colors"
                                />
                              </div>
                            </div>
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

      {/* MODAL: Agregar Lead Manual */}
      {showAddLeadModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <button
              onClick={() => setShowAddLeadModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <XCircle size={24} />
            </button>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <PlusCircle className="text-emerald-400" /> Nuevo Prospecto Manual
            </h3>
            <form onSubmit={handleAddManualLead} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre del Negocio *</label>
                <input
                  type="text"
                  required
                  value={newLeadData.name}
                  onChange={e => setNewLeadData({ ...newLeadData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 outline-none"
                  placeholder="Ej. Pizzería Roma"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={newLeadData.phone}
                  onChange={e => setNewLeadData({ ...newLeadData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 outline-none"
                  placeholder="Ej. +56912345678"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sitio Web / Link</label>
                <input
                  type="url"
                  value={newLeadData.website}
                  onChange={e => setNewLeadData({ ...newLeadData, website: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 outline-none"
                  placeholder="Ej. https://mi-web.com"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-emerald-600/20"
                >
                  Guardar en CRM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
