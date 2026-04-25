'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, auth, signInAnonymously } from '../firebase';
import { collection, getDocs, addDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, Download, Eye, FileText, User, Building2, 
  AlignLeft, Settings, Search, Check, ChevronDown, Loader2, ArrowLeft, History, Edit2, X
} from 'lucide-react';

const DEFAULT_SERVICES = [
  { category: "Presencia Digital", name: "Google My Business — Setup completo", description: "Creación, optimización, fotos, descripción SEO, categorías", price: 120000, type: "pago único" },
  { category: "Presencia Digital", name: "GMB — Gestión mensual", description: "Posts semanales, respuesta de reseñas, actualización de fotos", price: 50000, type: "por mes" },
  { category: "Presencia Digital", name: "GMB — Auditoría y diagnóstico", description: "Informe de presencia local, competencia y recomendaciones", price: 40000, type: "pago único" },
  { category: "Fotografía", name: "Sesión foto corporativa / equipo", description: "Hasta 3 horas, 20 fotos editadas, locación a convenir", price: 200000, type: "por sesión" },
  { category: "Fotografía", name: "Fotografía de producto", description: "Hasta 10 productos, fondo estudio, retoque incluido", price: 180000, type: "por sesión" },
  { category: "Fotografía", name: "Cobertura fotográfica de evento", description: "Hasta 4 horas, entrega 50+ fotos editadas", price: 300000, type: "por evento" },
  { category: "Fotografía", name: "Pack foto mensual para RRSS", description: "8 fotos editadas para feed/stories, sesión mensual incluida", price: 150000, type: "por mes" },
  { category: "Video", name: "Reel / Short para RRSS", description: "Hasta 30 seg, grabación + edición + captions", price: 150000, type: "por pieza" },
  { category: "Video", name: "Video testimonial de cliente", description: "Hasta 2 min, grabación + edición + música", price: 280000, type: "por video" },
  { category: "Video", name: "Video producto / servicio", description: "Hasta 30 seg, grabación + edición + color + música", price: 350000, type: "por video" },
  { category: "Video", name: "Video institucional / corporativo", description: "Hasta 90 seg, guión + grabación + edición + motion", price: 700000, type: "por video" },
  { category: "Video", name: "Cobertura video de evento", description: "Hasta 4 horas, edición highlight 3–5 min incluida", price: 400000, type: "por evento" },
  { category: "Video", name: "Video documental / mini-doc", description: "Hasta 5 min, producción completa + postproducción", price: 1200000, type: "por pieza" },
  { category: "Animación y motion", name: "Animación logo / intro", description: "Motion design, hasta 5 seg, entrega en .mp4 + .gif", price: 150000, type: "pago único" },
  { category: "Animación y motion", name: "Motion graphics para video", description: "Textos animados, gráficos, infografías, hasta 30 seg", price: 280000, type: "por pieza" },
  { category: "Animación y motion", name: "Video animado explicativo 2D", description: "Hasta 60 seg, guión + ilustración + animación", price: 900000, type: "por video" },
  { category: "Sitios web", name: "Landing page", description: "1 página de conversión, diseño + desarrollo + SEO básico", price: 500000, type: "pago único" },
  { category: "Sitios web", name: "Sitio web corporativo", description: "5 páginas, diseño + desarrollo + SEO + dominio + hosting 1 año", price: 950000, type: "pago único" },
  { category: "Sitios web", name: "Sitio web con blog / noticias", description: "5 páginas + módulo blog, CMS editable, SEO on-page", price: 1200000, type: "pago único" },
  { category: "Sitios web", name: "E-commerce básico", description: "Hasta 50 productos, carrito, pago online (Webpay / Flow)", price: 1600000, type: "pago único" },
  { category: "Sitios web", name: "Mantención web mensual", description: "Actualizaciones, backups, cambios menores, soporte", price: 60000, type: "por mes" },
  { category: "Contenido web", name: "Copywriting por página", description: "Textos optimizados para SEO y conversión, tono de marca", price: 80000, type: "por página" },
  { category: "Contenido web", name: "SEO on-page por página", description: "Title, meta, H1, estructura, alt texts, velocidad", price: 60000, type: "por página" },
  { category: "Contenido web", name: "Pack contenido web completo", description: "Texto + SEO para 5 páginas, incluye revisión y entrega lista", price: 350000, type: "pago único" },
  { category: "Contenido web", name: "Blog posts SEO mensual", description: "4 artículos optimizados, 600–900 palabras c/u, imágenes incluidas", price: 200000, type: "por mes" }
];

export default function Cotizador() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [services, setServices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([]);
  
  const [clientInfo, setClientInfo] = useState({ name: '', company: '', email: '', phone: '', date: new Date().toISOString().split('T')[0] });
  const [providerInfo, setProviderInfo] = useState({ brand: 'Agencia Digital', contact: 'Tu Nombre', web: 'www.tuagencia.com', email: 'hola@tuagencia.com', phone: '+56 9 0000 0000' });
  const [proposalIntro, setProposalIntro] = useState("Gracias por la oportunidad de presentar esta propuesta. Hemos analizado detalladamente los requerimientos de su marca y diseñado el siguiente plan de servicios a medida, estructurado para maximizar su presencia digital y potenciar los resultados de su negocio.");
  
  const [activeTab, setActiveTab] = useState('client'); // client, provider, intro, services, history
  const [isExporting, setIsExporting] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [quotesHistory, setQuotesHistory] = useState([]);
  
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState({ category: '', name: '', description: '', price: 0, type: 'pago único' });

  const pdfRef = useRef(null);

  // Authentication & Initial Data Load
  useEffect(() => {
    signInAnonymously(auth).then((result) => {
      setUserId(result.user.uid);
      loadInitialData(result.user.uid);
    }).catch(err => {
      console.error("Auth error:", err);
      setLoading(false);
    });
  }, []);

  const loadInitialData = async (uid) => {
    try {
      const servicesRef = collection(db, `artifacts/cotizapro/users/${uid}/services`);
      const snapshot = await getDocs(servicesRef);
      if (snapshot.empty) {
        // Seed default services
        const seeded = [];
        for (const s of DEFAULT_SERVICES) {
          const docRef = await addDoc(servicesRef, s);
          seeded.push({ id: docRef.id, ...s });
        }
        setServices(seeded);
      } else {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setServices(loaded);
      }

      const quotesRef = collection(db, `artifacts/cotizapro/users/${uid}/quotes`);
      const quotesSnap = await getDocs(quotesRef);
      setQuotesHistory(quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (error) {
      console.error("Error loading initial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCLP = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  const addToCart = (service) => {
    const existing = cart.find(item => item.id === service.id);
    if (existing) {
      setCart(cart.map(item => item.id === service.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...service, qty: 1 }]);
    }
  };

  const updateCartQty = (id, newQty) => {
    if (newQty < 1) return;
    setCart(cart.map(item => item.id === id ? { ...item, qty: newQty } : item));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    if (!userId) return;
    try {
      if (editingService.id) {
        // Update
        const ref = doc(db, `artifacts/cotizapro/users/${userId}/services`, editingService.id);
        await updateDoc(ref, {
          category: editingService.category,
          name: editingService.name,
          description: editingService.description,
          price: Number(editingService.price),
          type: editingService.type
        });
        setServices(services.map(s => s.id === editingService.id ? { ...editingService, price: Number(editingService.price) } : s));
      } else {
        // Create
        const newService = {
          category: editingService.category || 'General',
          name: editingService.name,
          description: editingService.description,
          price: Number(editingService.price),
          type: editingService.type || 'pago único'
        };
        const ref = await addDoc(collection(db, `artifacts/cotizapro/users/${userId}/services`), newService);
        setServices([...services, { id: ref.id, ...newService }]);
      }
      setIsServiceModalOpen(false);
    } catch (err) {
      console.error("Error saving service:", err);
      alert("Error al guardar el servicio.");
    }
  };

  const handleDeleteService = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar este servicio permanentemente?")) return;
    try {
      await deleteDoc(doc(db, `artifacts/cotizapro/users/${userId}/services`, id));
      setServices(services.filter(s => s.id !== id));
      removeFromCart(id);
    } catch (err) {
      console.error("Error deleting service:", err);
    }
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const iva = subtotal * 0.19;
  const total = subtotal + iva;

  const categories = ["Todos", ...new Set(services.map(s => s.category))];
  const filteredServices = services.filter(s => {
    const matchesCat = activeCategory === "Todos" || s.category === activeCategory;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const generatePDF = async () => {
    if (!pdfRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Cotizacion_${clientInfo.company || 'Cliente'}.pdf`);
      
      // Save to history
      if(userId) {
        const newQuote = {
          clientInfo, providerInfo, proposalIntro, cart, subtotal, iva, total,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, `artifacts/cotizapro/users/${userId}/quotes`), newQuote);
        setQuotesHistory([{ id: docRef.id, ...newQuote, createdAt: { seconds: Math.floor(Date.now() / 1000) } }, ...quotesHistory]);
      }
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 text-slate-500">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p>Cargando CotizaPro...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden font-sans text-slate-800">
      
      {/* LEFT PANEL: EDITOR */}
      <div className="w-full md:w-5/12 lg:w-1/3 bg-white border-r border-slate-200 shadow-xl z-10 flex flex-col h-screen">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="text-indigo-600" /> CotizaPro
            </h1>
            <Link href="/" className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors font-bold">
              <ArrowLeft size={14} /> Menú Principal
            </Link>
          </div>
          <p className="text-sm text-slate-500">Generador de propuestas comerciales</p>
        </div>

        {/* TABS */}
        <div className="flex border-b border-slate-200 overflow-x-auto shrink-0">
          {[
            { id: 'client', icon: User, label: 'Cliente' },
            { id: 'provider', icon: Building2, label: 'Agencia' },
            { id: 'intro', icon: AlignLeft, label: 'Texto' },
            { id: 'services', icon: Settings, label: 'Servicios' },
            { id: 'history', icon: History, label: 'Historial' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-2 text-xs font-semibold flex flex-col items-center gap-1 transition-colors border-b-2 ${
                activeTab === tab.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="p-6 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'client' && (
              <motion.div key="client" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <h3 className="font-bold text-slate-800 mb-4">Datos del Cliente</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Nombre del Contacto</label>
                    <input type="text" value={clientInfo.name} onChange={e => setClientInfo({...clientInfo, name: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Ej. Juan Pérez" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Empresa / Proyecto</label>
                    <input type="text" value={clientInfo.company} onChange={e => setClientInfo({...clientInfo, company: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Ej. Restaurante Roma" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Email</label>
                    <input type="email" value={clientInfo.email} onChange={e => setClientInfo({...clientInfo, email: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Teléfono</label>
                    <input type="text" value={clientInfo.phone} onChange={e => setClientInfo({...clientInfo, phone: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Fecha</label>
                    <input type="date" value={clientInfo.date} onChange={e => setClientInfo({...clientInfo, date: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'provider' && (
              <motion.div key="provider" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <h3 className="font-bold text-slate-800 mb-4">Datos de tu Agencia</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Nombre de Agencia / Marca</label>
                    <input type="text" value={providerInfo.brand} onChange={e => setProviderInfo({...providerInfo, brand: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Representante</label>
                    <input type="text" value={providerInfo.contact} onChange={e => setProviderInfo({...providerInfo, contact: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Sitio Web</label>
                    <input type="text" value={providerInfo.web} onChange={e => setProviderInfo({...providerInfo, web: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Email Comercial</label>
                    <input type="email" value={providerInfo.email} onChange={e => setProviderInfo({...providerInfo, email: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Teléfono</label>
                    <input type="text" value={providerInfo.phone} onChange={e => setProviderInfo({...providerInfo, phone: e.target.value})} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'intro' && (
              <motion.div key="intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <h3 className="font-bold text-slate-800 mb-4">Texto de Introducción</h3>
                <textarea 
                  value={proposalIntro} 
                  onChange={e => setProposalIntro(e.target.value)} 
                  className="w-full h-64 p-4 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none leading-relaxed"
                  placeholder="Escribe el mensaje introductorio de tu propuesta..."
                />
              </motion.div>
            )}

            {activeTab === 'services' && (
              <motion.div key="services" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4 h-full flex flex-col">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" placeholder="Buscar servicio..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <button 
                    onClick={() => { setEditingService({ category: '', name: '', description: '', price: 0, type: 'pago único' }); setIsServiceModalOpen(true); }} 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors"
                    title="Crear nuevo servicio"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                
                <div className="flex overflow-x-auto gap-2 pb-2 shrink-0 hide-scrollbar">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)} className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pb-24">
                  {filteredServices.map(service => (
                    <div key={service.id} className="p-4 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider mb-1">{service.category}</p>
                          <h4 className="font-bold text-slate-800 text-sm leading-tight">{service.name}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{service.description}</p>
                        </div>
                        <button onClick={() => addToCart(service)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-2 rounded-lg transition-colors shrink-0">
                          <Plus size={18} />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded w-fit">
                          {formatCLP(service.price)} <span className="text-[10px] font-normal text-slate-400">/ {service.type}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingService(service); setIsServiceModalOpen(true); }} className="text-slate-400 hover:text-indigo-500 p-1 rounded"><Edit2 size={14}/></button>
                           <button onClick={() => handleDeleteService(service.id)} className="text-slate-400 hover:text-rose-500 p-1 rounded"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <h3 className="font-bold text-slate-800 mb-4">Historial de Cotizaciones</h3>
                {quotesHistory.length === 0 ? (
                  <div className="text-center text-slate-500 py-10 border border-dashed border-slate-200 rounded-xl">
                    <History className="mx-auto mb-2 opacity-50" size={24}/>
                    <p className="text-sm">Aún no has generado ninguna cotización.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quotesHistory.map(quote => (
                      <div key={quote.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-slate-800 text-sm">{quote.clientInfo?.company || 'Sin Empresa'}</h4>
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded">{formatCLP(quote.total || 0)}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{quote.clientInfo?.name} • {quote.createdAt?.seconds ? new Date(quote.createdAt.seconds * 1000).toLocaleDateString() : 'Reciente'}</p>
                        <button onClick={() => {
                          setClientInfo(quote.clientInfo);
                          setProviderInfo(quote.providerInfo);
                          setProposalIntro(quote.proposalIntro);
                          setCart(quote.cart || []);
                          setActiveTab('client');
                        }} className="w-full bg-white border border-slate-300 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 text-xs font-bold py-2 rounded-lg transition-colors">
                          Cargar Datos
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT PANEL: PREVIEW */}
      <div className="flex-1 bg-slate-200/80 h-screen overflow-y-auto flex flex-col">
        {/* TOP BAR ACTION */}
        <div className="bg-white px-6 py-4 shadow-sm flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
             <span className="font-bold text-slate-800">Total Cotización:</span>
             <span className="text-xl font-black text-indigo-600">{formatCLP(total)}</span>
          </div>
          <button 
            onClick={generatePDF} 
            disabled={isExporting}
            className="bg-slate-900 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-lg disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            {isExporting ? "Generando..." : "Exportar PDF"}
          </button>
        </div>

        {/* CART BUILDER SECTION (Floating or Inline) */}
        {cart.length > 0 && (
          <div className="mx-8 mt-8 mb-4 bg-white rounded-xl shadow-md p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Check size={18} className="text-emerald-500"/> Servicios Seleccionados</h3>
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-3 border border-slate-100 rounded-lg bg-slate-50/50 hover:bg-white transition-colors">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatCLP(item.price)} / {item.type}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <button onClick={() => updateCartQty(item.id, item.qty - 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100 font-bold">-</button>
                      <span className="px-2 text-sm font-semibold w-8 text-center">{item.qty}</span>
                      <button onClick={() => updateCartQty(item.id, item.qty + 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100 font-bold">+</button>
                    </div>
                    <span className="font-bold text-sm w-24 text-right">{formatCLP(item.price * item.qty)}</span>
                    <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-rose-500 p-1"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PDF PREVIEW CONTAINER */}
        <div className="flex-1 p-8 flex justify-center pb-24">
          <div 
            ref={pdfRef}
            id="pdf-preview" 
            className="bg-white shadow-2xl shrink-0 text-slate-800 relative"
            style={{ width: '794px', minHeight: '1123px', padding: '60px 80px' }} // A4 dimensions roughly at 96dpi
          >
            {/* BRAND HEADER */}
            <header className="border-b-2 border-indigo-600 pb-6 mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">{providerInfo.brand || 'Tu Agencia'}</h1>
                <p className="text-sm text-slate-500 mt-2">{providerInfo.web}</p>
              </div>
              <div className="text-right text-sm text-slate-600 space-y-1">
                <p>Propuesta de Servicios</p>
                <p className="font-semibold text-indigo-600">Fecha: {new Date(clientInfo.date).toLocaleDateString('es-ES')}</p>
              </div>
            </header>

            {/* CLIENT DETAILS */}
            <section className="mb-10 grid grid-cols-2 gap-8 bg-slate-50 p-6 rounded-lg border border-slate-100">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Preparado para</p>
                <h2 className="text-xl font-bold text-slate-800">{clientInfo.company || 'Empresa Cliente'}</h2>
                <p className="text-sm text-slate-600 mt-1">{clientInfo.name || 'Nombre del Contacto'}</p>
                {clientInfo.email && <p className="text-sm text-slate-600">{clientInfo.email}</p>}
                {clientInfo.phone && <p className="text-sm text-slate-600">{clientInfo.phone}</p>}
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Preparado por</p>
                <h2 className="text-lg font-bold text-slate-800">{providerInfo.contact || 'Representante'}</h2>
                <p className="text-sm text-slate-600 mt-1">{providerInfo.email}</p>
                <p className="text-sm text-slate-600">{providerInfo.phone}</p>
              </div>
            </section>

            {/* INTRO */}
            <section className="mb-12">
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{proposalIntro}</p>
            </section>

            {/* SERVICES TABLE */}
            <section className="mb-12">
              <h3 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-200 pb-2">Detalle de Inversión</h3>
              {cart.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                  <p>Aún no has agregado servicios a la cotización.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-left text-slate-500">
                      <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider">Descripción del Servicio</th>
                      <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider text-center">Cant.</th>
                      <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider text-right">Precio Unit.</th>
                      <th className="pb-3 font-semibold uppercase text-[10px] tracking-wider text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="py-4 pr-4">
                          <p className="font-bold text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                          <p className="text-[10px] text-indigo-500 font-medium mt-1 uppercase">{item.type}</p>
                        </td>
                        <td className="py-4 text-center align-top pt-5 text-slate-700">{item.qty}</td>
                        <td className="py-4 text-right align-top pt-5 text-slate-700">{formatCLP(item.price)}</td>
                        <td className="py-4 text-right align-top pt-5 font-bold text-slate-800">{formatCLP(item.price * item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* TOTALS */}
            {cart.length > 0 && (
              <section className="flex justify-end mt-8">
                <div className="w-72 space-y-3">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCLP(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 pb-3 border-b border-slate-200">
                    <span>IVA (19%)</span>
                    <span className="font-medium">{formatCLP(iva)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-sm">Total a Pagar</span>
                    <span className="font-black text-2xl text-indigo-600">{formatCLP(total)}</span>
                  </div>
                </div>
              </section>
            )}

            {/* FOOTER */}
            <footer className="absolute bottom-12 left-20 right-20 text-center border-t border-slate-200 pt-6">
              <p className="text-xs text-slate-400">
                Esta cotización tiene una validez de 15 días desde su fecha de emisión.<br/>
                Para aprobar esta propuesta, por favor contactar a {providerInfo.email}.
              </p>
            </footer>
          </div>
        </div>
      </div>

      {/* SERVICE MODAL */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <button onClick={() => setIsServiceModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Settings className="text-indigo-500" /> {editingService.id ? "Editar Servicio" : "Nuevo Servicio"}
            </h3>
            <form onSubmit={handleSaveService} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Categoría</label>
                <input required type="text" value={editingService.category} onChange={e => setEditingService({...editingService, category: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej. Desarrollo Web" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre del Servicio</label>
                <input required type="text" value={editingService.name} onChange={e => setEditingService({...editingService, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej. Landing Page" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Descripción</label>
                <textarea required value={editingService.description} onChange={e => setEditingService({...editingService, description: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20" placeholder="Detalles del servicio..." />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Precio (CLP)</label>
                  <input required type="number" min="0" value={editingService.price} onChange={e => setEditingService({...editingService, price: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de cobro</label>
                  <select value={editingService.type} onChange={e => setEditingService({...editingService, type: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="pago único">Pago único</option>
                    <option value="por mes">Por mes</option>
                    <option value="por sesión">Por sesión</option>
                    <option value="por evento">Por evento</option>
                    <option value="por pieza">Por pieza</option>
                    <option value="por hora">Por hora</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsServiceModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl transition-colors font-semibold">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl transition-colors">
                  {editingService.id ? "Guardar Cambios" : "Crear Servicio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
