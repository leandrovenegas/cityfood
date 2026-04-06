'use client';

import React, { useEffect, useState } from 'react';

export default function FirebaseDiagnostics() {
  const [status, setStatus] = useState({
    apiKey: false,
    projectId: false,
    appId: false,
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const diagnostics = {
      API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Inyectada' : '❌ Undefined',
      PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Inyectada' : '❌ Undefined',
      APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✅ Inyectada' : '❌ Undefined',
    };

    setStatus({
      apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });

    console.group('🚀 [Diagnóstico Antigravedad] - Firebase Env Vars');
    console.table(diagnostics);
    console.info(
      "💡 TIPS DE LECTURA:\n" +
      "1. ¿Todo dice '❌ Undefined'? -> Vercel no está inyectando las variables. Verifica el prefijo NEXT_PUBLIC_ y haz un Redeploy sin caché.\n" +
      "2. ¿Todo está en '✅ Inyectada' pero Firebase da error? -> Puede que tu dominio (vercel.app) no esté autorizado en la consola de Firebase Authentication o Firestore Security Rules."
    );
    console.groupEnd();
  }, []);

  if (!isMounted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs text-white min-w-[200px]">
      <h3 className="font-bold text-sm mb-3 border-b border-slate-700 pb-2 text-indigo-400">
        🔍 Firebase Diagnostics
      </h3>
      <ul className="space-y-2 mb-3 font-mono">
        <li className="flex justify-between items-center gap-4">
          <span className="text-slate-400">API_KEY:</span> 
          <span className={`px-2 py-1 rounded ${status.apiKey ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400 font-bold"}`}>
            {status.apiKey ? "Detectada" : "Undefined"}
          </span>
        </li>
        <li className="flex justify-between items-center gap-4">
          <span className="text-slate-400">PROJECT_ID:</span> 
          <span className={`px-2 py-1 rounded ${status.projectId ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400 font-bold"}`}>
            {status.projectId ? "Detectada" : "Undefined"}
          </span>
        </li>
        <li className="flex justify-between items-center gap-4">
          <span className="text-slate-400">APP_ID:</span> 
          <span className={`px-2 py-1 rounded ${status.appId ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400 font-bold"}`}>
            {status.appId ? "Detectada" : "Undefined"}
          </span>
        </li>
      </ul>
      <div className="text-[11px] text-slate-500 border-t border-slate-700 mt-3 pt-2">
        <p>Abre la consola (F12) para ver la tabla y la guía de diagnóstico completa.</p>
      </div>
    </div>
  );
}
