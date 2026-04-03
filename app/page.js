'use client';

import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Video, TrendingDown, Copy, Star, MapPin, Activity, Calendar, Search } from 'lucide-react';

const DUMMY_SCANS = [
  {
    id: 'scan-1',
    date: new Date().toISOString(),
    location: 'Centro de la Ciudad',
    category: 'Restaurantes',
    places: [
      {
        rank: 1,
        name: 'Pizzería Luigi',
        rating: 4.8,
        reviews: 320,
        visualScore: 85,
        hasVideo: true,
        lastPhoto: 'Hace 7 días',
        opportunityType: 'Mantenimiento Visual'
      },
      {
        rank: 2,
        name: 'El Rincón del Asado',
        rating: 4.5,
        reviews: 210,
        visualScore: 45,
        hasVideo: false,
        lastPhoto: 'Hace 2 meses',
        opportunityType: 'Video + Refresh de Fotos'
      },
      {
        rank: 3,
        name: 'Sushi Go',
        rating: 4.2,
        reviews: 150,
        visualScore: 30,
        hasVideo: false,
        lastPhoto: 'Hace 6 meses',
        opportunityType: 'Video Promocional'
      }
    ]
  },
  {
    id: 'scan-2',
    date: new Date(Date.now() - 86400000 * 7).toISOString(), // Hace 1 semana
    location: 'Centro de la Ciudad',
    category: 'Restaurantes',
    places: [
      { rank: 2, name: 'Pizzería Luigi' },
      { rank: 3, name: 'El Rincón del Asado' },
      { rank: 4, name: 'Sushi Go' }
    ]
  },
  {
    id: 'scan-3',
    date: new Date(Date.now() - 86400000 * 14).toISOString(), // Hace 2 semanas
    location: 'Centro de la Ciudad',
    category: 'Restaurantes',
    places: [
      { rank: 4, name: 'Pizzería Luigi' },
      { rank: 5, name: 'El Rincón del Asado' },
      { rank: 5, name: 'Sushi Go' }
    ]
  }
];

export default function MarketSpiderDashboard() {
  const [scans, setScans] = useState(DUMMY_SCANS);
  const [activeTab, setActiveTab] = useState('opportunities');

  // Funciones Derivadas
  const latestScan = scans[0];
  
  // Oportunidades: Locales con visualScore < 60
  const opportunities = latestScan?.places.filter(place => place.visualScore !== undefined && place.visualScore < 60) || [];

  const rankHistoryData = scans.map(scan => {
    if(!scan.places || scan.places.length === 0) return null;
    const samplePlace = scan.places.find(p => p.name === 'Pizzería Luigi') || scan.places[0];
    return {
      date: new Date(scan.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      rank: samplePlace.rank,
      name: samplePlace.name
    };
  }).filter(Boolean).reverse();

  const handleCopyPitch = (place) => {
    const pitch = `Hola equipo de ${place.name}, he notado que tienen potencial para mejorar su posición (actual #${place.rank}) en Google Maps. Su factor visual es bajo (${place.visualScore}/100) debido a la falta de ${place.hasVideo ? '' : 'video'} ${place.hasVideo && place.lastPhoto ? 'y' : 'o'} actualización de fotos. Me gustaría mostrarles cómo podemos implementar su ${place.opportunityType}.`;
    navigator.clipboard.writeText(pitch);
    alert(`Pitch copiado para ${place.name}!`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-8 selection:bg-indigo-500/30">
      <header className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent mb-2 items-center flex gap-3">
            <Activity className="text-indigo-400" size={36} />
            MarketSpider V3
          </h1>
          <p className="text-slate-400 text-sm md:text-base ml-1">Agency Suite | Local SEO & Visual Reconnaissance</p>
        </div>
        <div className="mt-4 md:mt-0 flex gap-4">
          <button 
            onClick={() => setActiveTab('opportunities')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'opportunities' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            Oportunidades
          </button>
          <button 
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'tracking' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            Tracking
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            Historial
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {activeTab === 'opportunities' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <TrendingDown className="text-rose-400" />
                Negocios en Riesgo (Último Escaneo)
              </h2>
              <span className="bg-rose-500/10 text-rose-400 px-3 py-1 rounded-full text-xs font-semibold border border-rose-500/20">
                {opportunities.length} encontrados
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {opportunities.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-sm">
                  No hay oportunidades detectadas. Inicia un escaneo con el Spider.
                </div>
              ) : (
                opportunities.map((place, idx) => (
                  <div key={idx} className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.2)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-lg text-white mb-1 leading-tight group-hover:text-indigo-400 transition-colors">
                            {place.name}
                          </h3>
                          <div className="flex items-center text-xs text-slate-400 gap-3">
                            <span className="flex items-center gap-1"><Star size={12} className="text-amber-400" /> {place.rating} ({place.reviews})</span>
                            <span className="flex items-center gap-1"><MapPin size={12} /> Rank #{place.rank}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-xl font-black ${place.visualScore < 40 ? 'text-rose-500' : 'text-amber-500'}`}>
                            {place.visualScore}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Vis Score</span>
                        </div>
                      </div>

                      <div className="space-y-3 mb-6 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 flex items-center gap-2"><Video size={14} /> Presencia Video</span>
                          <span className={place.hasVideo ? 'text-emerald-400' : 'text-rose-400'}>{place.hasVideo ? 'Sí' : 'No'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 flex items-center gap-2"><Camera size={14} /> Fotos / Última</span>
                          <span className="text-slate-300">{place.lastPhoto}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-between items-center mt-auto">
                      <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2 py-1 rounded border border-indigo-500/20">
                        {place.opportunityType}
                      </span>
                      <button 
                        onClick={() => handleCopyPitch(place)}
                        className="flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg transition-colors border border-white/10"
                      >
                        <Copy size={16} /> Pitch
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'tracking' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
              <Activity className="text-cyan-400" />
              Evolución de Ranking Histórico ('Pizzería Luigi')
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[400px]">
              {rankHistoryData.length < 2 ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Formato de data insuficiente. Realiza al menos 2 escaneos.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rankHistoryData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" tick={{fill: '#64748b', fontSize: 12}} />
                    <YAxis reversed stroke="#64748b" tick={{fill: '#64748b', fontSize: 12}} domain={[1, 'dataMax + 2']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#38bdf8' }}
                      formatter={(value, name, props) => [`Rank #${value}`, props.payload.name]}
                    />
                    <Line type="monotone" dataKey="rank" stroke="#06b6d4" strokeWidth={3} dot={{ fill: '#06b6d4', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
              <Calendar className="text-slate-300" />
              Historial de Escaneos
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {scans.length === 0 ? (
                <div className="p-12 text-center text-slate-500">No hay escaneos todavía.</div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {scans.map((scan) => (
                    <div key={scan.id} className="p-4 md:p-6 hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 mt-1 md:mt-0">
                          <Search size={20} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{scan.location}</p>
                          <p className="text-sm text-slate-400 capitalize">{scan.category}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center w-full md:w-auto mt-2 md:mt-0">
                        <div className="text-sm text-slate-300">
                          {new Date(scan.date).toLocaleString('es-ES', { 
                            dateStyle: 'medium', 
                            timeStyle: 'short' 
                          })}
                        </div>
                        <div className="bg-slate-800 px-3 py-1 rounded-full text-xs font-medium text-slate-300 border border-slate-700 flex items-center gap-2">
                          <MapPin size={10} className="text-rose-400"/>
                          {scan.places?.length || 0} Locales evaluados
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
