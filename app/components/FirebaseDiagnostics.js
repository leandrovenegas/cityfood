"use client";
import { useEffect, useState } from "react";
import { getApps } from "firebase/app";

export default function FirebaseFullShield() {
  const [envStatus, setEnvStatus] = useState({});
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    // Lista de variables a verificar
    const keys = [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
    ];

    const report = {};
    keys.forEach(key => {
      const value = process.env[key];
      // Verificamos si existe y si no es un string vacío
      report[key] = value && value.length > 0 ? "✅ OK" : "❌ FALTANTE";
    });

    setEnvStatus(report);

    // Log detallado en la consola (F12)
    console.group("🚀 Diagnóstico de Variables Firebase");
    console.table(report);
    console.log("Apps Inicializadas:", getApps().length);
    console.groupEnd();
  }, []);

  if (!isClient) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '20px', zIndex: 10000,
      backgroundColor: '#000', color: '#fff', padding: '15px',
      borderRadius: '10px', fontSize: '11px', border: '2px solid #333',
      fontFamily: 'monospace', boxShadow: '0 0 20px rgba(0,255,0,0.2)',
      maxWidth: '350px'
    }}>
      <b style={{ color: '#00ff00', fontSize: '12px' }}>🛰️ ESTADO DE VARIABLES (VERCEL)</b>
      <hr style={{ borderColor: '#222', margin: '8px 0' }} />

      {Object.entries(envStatus).map(([key, status]) => (
        <div key={key} style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#aaa' }}>{key.replace('NEXT_PUBLIC_FIREBASE_', '')}:</span>
          <span style={{ color: status.includes('✅') ? '#00ff00' : '#ff4444' }}>{status}</span>
        </div>
      ))}

      <div style={{ marginTop: '10px', fontSize: '9px', color: '#888', fontStyle: 'italic' }}>
        * Si ves ❌, agrégala en Vercel Settings y haz Redeploy (Cache OFF).
      </div>
    </div>
  );
}