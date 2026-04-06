'use client';

import React, { useEffect, useState } from 'react';

export default function FirebaseDiagnostics() {
  const [status, setStatus] = useState({
    apiKey: false,
    authDomain: false,
    projectId: false,
    storageBucket: false,
    messagingSenderId: false,
    appId: false,
    measurementId: false,
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const diagnostics = {
      API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Inyectada' : '❌ Undefined',
      AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ Inyectada' : '❌ Undefined',
      PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Inyectada' : '❌ Undefined',
      STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✅ Inyectada' : '❌ Undefined',
      SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✅ Inyectada' : '❌ Undefined',
      APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✅ Inyectada' : '❌ Undefined',
      MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? '✅ Inyectada' : '❌ Undefined',
    };

    setStatus({
      apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: !!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
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

  const renderStatusItem = (label, isDetected) => (
    <li className="flex justify-between items-center gap-4 text-[10px] md:text-xs">
      <span className="text-slate-400">{label}:</span>
      <span className={`px-2 py-0.5 rounded ${isDetected ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400 font-bold"}`}>
        {isDetected ? "OK" : "Missing"}
      </span>
    </li>
  );

  return (
    <div className="fixed bottom-4 right-4 z-[9999] p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs text-white min-w-[240px]">
      <h3 className="font-bold text-sm mb-3 border-b border-slate-700 pb-2 text-indigo-400 flex items-center justify-between">
        <span>🔍 Escáner Firebase</span>
        <span className="text-[10px] bg-slate-800 px-2 py-1 rounded-full border border-slate-700 text-slate-300">
          7 Keys
        </span>
      </h3>
      <ul className="space-y-1.5 mb-3 font-mono">
        {renderStatusItem("API_KEY", status.apiKey)}
        {renderStatusItem("AUTH_DOMAIN", status.authDomain)}
        {renderStatusItem("PROJECT_ID", status.projectId)}
        {renderStatusItem("BUCKET", status.storageBucket)}
        {renderStatusItem("SENDER_ID", status.messagingSenderId)}
        {renderStatusItem("APP_ID", status.appId)}
        {renderStatusItem("MEASUREMENT_ID", status.measurementId)}
      </ul>
      <div className="text-[10px] text-slate-500 border-t border-slate-700 mt-3 pt-2">
        <p>Revisa la consola (F12) para el log detallado. Si ves un 'Missing', copia la llave desde .env.local a Vercel.</p>
      </div>
    </div>
  );
}
