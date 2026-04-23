'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth, signInAnonymously } from '../../firebase';
import {
  ArrowLeft, Phone, Globe, MapPin, Star, Loader2, Plus, Trash2,
  CheckCircle, Circle, ExternalLink, FileText, MessageSquare, TrendingUp,
  Calendar, User, Link2, RefreshCw, Trophy, Handshake, Target, Edit3, Save, X
} from 'lucide-react';

const APP_ID = 'marketspider-v3';
const USER_ID = 'Hp1YGeni2DgiWrtrIKUgmgki7UL2';

const PIPELINE = [
  { id: 'Prospecto',       label: 'Prospecto',       emoji: '🎯', color: 'slate' },
  { id: 'Primer Contacto', label: 'Primer Contacto', emoji: '📞', color: 'indigo' },
  { id: 'Negociación',     label: 'Negociación',     emoji: '💼', color: 'amber' },
  { id: 'Reunión',         label: 'Reunión',         emoji: '🤝', color: 'violet' },
  { id: 'Ganado',          label: 'Ganado',          emoji: '🏆', color: 'emerald' },
];

const STAGE_ORDER = PIPELINE.map(s => s.id);

const OPPORTUNITY_GAPS = [
  { id: 'no_reclamada',  emoji: '🔓', label: 'Ficha no reclamada'  },
  { id: 'sin_web',       emoji: '🌐', label: 'Sin sitio web'       },
  { id: 'sin_video',     emoji: '🎥', label: 'Sin video'           },
  { id: 'sin_menu',      emoji: '🍽️', label: 'Sin carta/menú'     },
  { id: 'sin_respuesta', emoji: '💬', label: 'No responde reviews' },
  { id: 'fotos_viejas',  emoji: '📷', label: 'Fotos desactualizadas'},
  { id: 'solo_social',   emoji: '📱', label: 'Solo redes sociales' },
  { id: 'rating_bajo',   emoji: '⭐', label: 'Rating bajo'         },
];

// ─── Subcomponent: Contact Entry ─────────────────────────────────────────────
function ContactEntry({ entry, leadId, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);

  const handleSave = async () => {
    const ref = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/crm_leads`, leadId);
    const lead = await new Promise(res => onSnapshot(ref, snap => res(snap.data()), { once: true }));
    // We update via arrayRemove/arrayUnion on contacts
    await updateDoc(ref, {
      contacts: (lead?.contacts || []).map(c => c.id === entry.id ? { ...c, text } : c)
    });
    setEditing(false);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 group relative">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-indigo-400" />
          <span className="text-[10px] text-slate-500 font-mono">{entry.date || 'Sin fecha'}</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setEditing(!editing)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-indigo-400 transition-all"><Edit3 size={13}/></button>
          <button onClick={() => onDelete(entry.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all"><Trash2 size={13}/></button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full bg-slate-950 border border-indigo-500/30 rounded-lg p-3 text-xs text-slate-200 min-h-[80px] resize-none focus:outline-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1 text-[11px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/30 transition-colors"><Save size={12}/> Guardar</button>
            <button onClick={() => { setEditing(false); setText(entry.text); }} className="flex items-center gap-1 text-[11px] bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-600 transition-colors"><X size={12}/> Cancelar</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.text}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeadDetailPage({ params }) {
  const { leadId } = use(params);
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);

  // New contact form
  const [newContactText, setNewContactText] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // New document form
  const [newDocName, setNewDocName] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).then(() => {
      const ref = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/crm_leads`, leadId);
      const unsub = onSnapshot(ref, snap => {
        if (snap.exists()) setLead({ id: snap.id, ...snap.data() });
        setLoading(false);
      });
      return () => unsub();
    });
  }, [leadId]);

  const ref = () => doc(db, `artifacts/${APP_ID}/users/${USER_ID}/crm_leads`, leadId);

  // ── Pipeline advancement ──────────────────────────────────────────────────
  const handleSetStage = async (stageId) => {
    const currentIdx = STAGE_ORDER.indexOf(lead.status);
    const targetIdx = STAGE_ORDER.indexOf(stageId);
    // Allow clicking current to deactivate (go back one step), or advance
    if (stageId === lead.status && currentIdx > 0) {
      await updateDoc(ref(), { status: STAGE_ORDER[currentIdx - 1], updatedAt: serverTimestamp() });
    } else {
      await updateDoc(ref(), { status: stageId, updatedAt: serverTimestamp() });
    }
  };

  // ── Contacts ─────────────────────────────────────────────────────────────
  const handleAddContact = async () => {
    if (!newContactText.trim()) return;
    setSavingContact(true);
    const entry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      text: newContactText.trim(),
    };
    await updateDoc(ref(), { contacts: arrayUnion(entry), updatedAt: serverTimestamp() });
    setNewContactText('');
    setAddingContact(false);
    setSavingContact(false);
  };

  const handleDeleteContact = async (entryId) => {
    if (!confirm('¿Eliminar este registro de contacto?')) return;
    const updatedContacts = (lead.contacts || []).filter(c => c.id !== entryId);
    await updateDoc(ref(), { contacts: updatedContacts, updatedAt: serverTimestamp() });
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  const handleAddDocument = async () => {
    if (!newDocName.trim() || !newDocUrl.trim()) return;
    const entry = {
      id: Date.now().toString(),
      name: newDocName.trim(),
      url: newDocUrl.trim(),
      date: new Date().toLocaleDateString('es-CL'),
    };
    await updateDoc(ref(), { documents: arrayUnion(entry), updatedAt: serverTimestamp() });
    setNewDocName(''); setNewDocUrl(''); setAddingDoc(false);
  };

  const handleDeleteDocument = async (docId) => {
    const updatedDocs = (lead.documents || []).filter(d => d.id !== docId);
    await updateDoc(ref(), { documents: updatedDocs, updatedAt: serverTimestamp() });
  };

  // ── Field edit ────────────────────────────────────────────────────────────
  const handleFieldBlur = async (field, value) => {
    await updateDoc(ref(), { [field]: value, updatedAt: serverTimestamp() });
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-500" size={40} />
    </div>
  );

  if (!lead) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
      <p>Prospecto no encontrado.</p>
      <Link href="/" className="text-indigo-400 hover:underline">Volver al Dashboard</Link>
    </div>
  );

  const currentStageIdx = STAGE_ORDER.indexOf(lead.status);
  const mapsUrl = lead.gmapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/?tab=crm" className="text-slate-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-extrabold text-white leading-tight">{lead.name}</h1>
              <p className="text-xs text-slate-500">Rank #{lead.rank} · {lead.category || 'Sin categoría'} · {lead.location || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={`tel:${(lead.phone || '').replace(/\s/g, '')}`}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
              <Phone size={14} /> {lead.phone || 'Sin teléfono'}
            </a>
            <a href={mapsUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
              <MapPin size={14} /> Google Maps
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Pipeline Visual ── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-400" /> Pipeline de Venta
          </h2>
          <div className="flex items-center gap-0">
            {PIPELINE.map((stage, idx) => {
              const passed = idx <= currentStageIdx;
              const active = idx === currentStageIdx;
              const isLast = idx === PIPELINE.length - 1;
              return (
                <React.Fragment key={stage.id}>
                  <button
                    onClick={() => handleSetStage(stage.id)}
                    className={`flex flex-col items-center gap-2 flex-1 group transition-all`}
                  >
                    <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg transition-all ${
                      active ? `bg-${stage.color}-500/30 border-${stage.color}-400 shadow-lg shadow-${stage.color}-500/20` :
                      passed ? `bg-${stage.color}-500/20 border-${stage.color}-500/50` :
                      'bg-slate-800 border-slate-700 opacity-40'
                    }`}>
                      {passed ? <span>{stage.emoji}</span> : <Circle size={16} className="text-slate-600" />}
                    </div>
                    <span className={`text-[10px] font-bold text-center leading-tight ${
                      active ? 'text-white' : passed ? 'text-slate-400' : 'text-slate-600'
                    }`}>{stage.label}</span>
                  </button>
                  {!isLast && (
                    <div className={`h-0.5 flex-1 mx-1 rounded-full transition-all ${passed && idx < currentStageIdx ? 'bg-indigo-500' : 'bg-slate-800'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-4">Haz clic en un paso para avanzar o retroceder en el pipeline</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── LEFT COL: Datos del Local ── */}
          <div className="space-y-6">

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User size={14} className="text-emerald-400" /> Datos del Local
              </h2>

              <div className="space-y-3 text-sm">
                {[
                  { label: 'Teléfono', field: 'phone', icon: <Phone size={13}/>, type: 'tel' },
                  { label: 'Sitio Web', field: 'website', icon: <Globe size={13}/>, type: 'url' },
                  { label: 'Instagram', field: 'instagram', icon: <span className="text-pink-400 font-bold text-sm">@</span>, type: 'text' },
                  { label: 'Email', field: 'email', icon: <span className="text-sky-400 text-xs">✉</span>, type: 'email' },
                  { label: 'Encargado', field: 'contact_name', icon: <User size={13}/>, type: 'text' },
                  { label: 'Facebook', field: 'facebook', icon: <span className="text-violet-400 text-xs">🔵</span>, type: 'text' },
                ].map(({ label, field, icon, type }) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-slate-500 shrink-0 w-4 flex justify-center">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-slate-600 uppercase font-bold">{label}</p>
                      <input
                        type={type}
                        defaultValue={lead[field] || ''}
                        placeholder={`Sin ${label.toLowerCase()}`}
                        onBlur={(e) => handleFieldBlur(field, e.target.value)}
                        className="w-full bg-transparent text-slate-300 text-xs placeholder-slate-700 border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition-colors py-0.5"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-800 flex gap-2">
                <div className="flex items-center gap-1">
                  <Star size={12} className="text-amber-400 fill-current" />
                  <span className="text-sm font-bold text-amber-400">{lead.rating || 'S/D'}</span>
                  <span className="text-xs text-slate-500">({lead.reviews || 0} reseñas)</span>
                </div>
              </div>
            </section>

            {/* Brechas */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Target size={14} className="text-rose-400" /> Brechas Detectadas
              </h2>
              <div className="flex flex-wrap gap-2">
                {OPPORTUNITY_GAPS.map(gap => {
                  const active = (lead.gaps || []).includes(gap.id);
                  return (
                    <button key={gap.id}
                      onClick={async () => {
                        const gaps = lead.gaps || [];
                        const newGaps = gaps.includes(gap.id) ? gaps.filter(g => g !== gap.id) : [...gaps, gap.id];
                        await updateDoc(ref(), { gaps: newGaps, updatedAt: serverTimestamp() });
                      }}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all font-medium ${
                        active ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-800 text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {gap.emoji} {active && gap.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ── CENTER + RIGHT: Timeline + Docs ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Timeline de Contactos */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare size={14} className="text-indigo-400" /> Registro de Contactos
                  <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px]">
                    {(lead.contacts || []).length}
                  </span>
                </h2>
                <button onClick={() => setAddingContact(!addingContact)}
                  className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <Plus size={14} /> Nuevo Contacto
                </button>
              </div>

              {addingContact && (
                <div className="mb-4 p-4 bg-slate-800 rounded-xl border border-indigo-500/20 space-y-3">
                  <label className="text-[10px] text-indigo-400 font-bold uppercase">¿Qué se habló?</label>
                  <textarea
                    value={newContactText}
                    onChange={e => setNewContactText(e.target.value)}
                    placeholder="Describí el contacto: quién respondió, qué interés mostraron, próximos pasos..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 min-h-[100px] resize-none focus:border-indigo-500 focus:outline-none transition-colors"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddContact} disabled={savingContact}
                      className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
                      {savingContact ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                    </button>
                    <button onClick={() => { setAddingContact(false); setNewContactText(''); }}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {(lead.contacts || []).length === 0 ? (
                  <div className="py-10 text-center text-slate-600 border border-dashed border-slate-800 rounded-xl">
                    <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aún no hay registros de contacto.</p>
                    <p className="text-xs mt-1">Haz clic en "+ Nuevo Contacto" para empezar.</p>
                  </div>
                ) : (
                  [...(lead.contacts || [])].reverse().map(entry => (
                    <ContactEntry key={entry.id} entry={entry} leadId={leadId} onDelete={handleDeleteContact} />
                  ))
                )}
              </div>
            </section>

            {/* Documentos */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={14} className="text-amber-400" /> Documentos
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px]">
                    {(lead.documents || []).length}
                  </span>
                </h2>
                <button onClick={() => setAddingDoc(!addingDoc)}
                  className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <Plus size={14} /> Agregar
                </button>
              </div>

              {addingDoc && (
                <div className="mb-4 p-4 bg-slate-800 rounded-xl border border-amber-500/20 space-y-3">
                  <label className="text-[10px] text-amber-400 font-bold uppercase">Nuevo Documento</label>
                  <input
                    type="text"
                    value={newDocName}
                    onChange={e => setNewDocName(e.target.value)}
                    placeholder="Nombre (ej: Presupuesto Junio 2026)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none transition-colors"
                  />
                  <input
                    type="url"
                    value={newDocUrl}
                    onChange={e => setNewDocUrl(e.target.value)}
                    placeholder="URL (Google Drive, Dropbox, PDF...)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none transition-colors"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddDocument}
                      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-lg text-xs transition-colors">
                      <Save size={12} /> Guardar
                    </button>
                    <button onClick={() => { setAddingDoc(false); setNewDocName(''); setNewDocUrl(''); }}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(lead.documents || []).length === 0 ? (
                  <div className="py-8 text-center text-slate-600 border border-dashed border-slate-800 rounded-xl">
                    <FileText size={22} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Sin documentos adjuntos.</p>
                    <p className="text-xs mt-1">Pega el link de tu presupuesto en PDF o Google Drive.</p>
                  </div>
                ) : (
                  (lead.documents || []).map(docItem => (
                    <div key={docItem.id} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={16} className="text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{docItem.name}</p>
                          <p className="text-[10px] text-slate-500">{docItem.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={docItem.url} target="_blank" rel="noreferrer"
                          className="text-slate-400 hover:text-amber-400 transition-colors p-1">
                          <ExternalLink size={14} />
                        </a>
                        <button onClick={() => handleDeleteDocument(docItem.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
