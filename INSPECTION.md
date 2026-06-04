# Documento de Inspección - CityFood / MarketSpider V3

## 1. Estructura de Carpetas (2 niveles de profundidad)

```
cityfood/
├── app/
│   ├── api/
│   │   ├── agent/
│   │   ├── audit/
│   │   └── scan-gaps/
│   ├── components/
│   │   ├── FirebaseDiagnostics.js
│   │   └── MapComponent.js
│   ├── cotizador/
│   │   └── page.js
│   ├── crm/
│   │   └── [leadId]/
│   │       └── page.js
│   ├── directorio/
│   │   └── page.js
│   ├── global/
│   │   └── page.js
│   ├── firebase.js
│   └── layout.js
└── public/
    ├── file.svg
    ├── globe.svg
    ├── next.svg
    ├── vercel.svg
    └── window.svg
```

## 2. Schema de Tablas (Firestore)

El proyecto utiliza Firebase Firestore (NO Supabase). Las colecciones inferidas del código son:

### artifacts/{appId}/users/{userId}/scans
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | string (auto) | ID automático del documento |
| date | timestamp | Fecha del escaneo |
| category | string | Rubro de negocio (ej. Restaurante) |
| location | string | Ciudad/Ubicación |
| places | array | Lista de locales con: name, rank, rating, reviews, phone, website, lat, lng, visualScore, hasVideo, claimed, etc. |

### artifacts/{appId}/users/{userId}/scan_jobs
| Columna | Tipo | Descripción |
|---------|------|-------------|
| status | string | pending, running, paused, completed, error, scheduled |
| config | object | rubro, ciudad, maxResults, autoRepeatHours |
| message | string | Mensaje de estado |
| createdAt | timestamp | Fecha de creación |
| updatedAt | timestamp | Última actualización |

### artifacts/{appId}/users/{userId}/crm_leads
| Columna | Tipo | Descripción |
|---------|------|-------------|
| name | string | Nombre del prospecto |
| phone | string | Teléfono de contacto |
| website | string | Sitio web |
| rank | number | Ranking en Google Maps |
| status | string | Prospecto, Primer Contacto, Negociación, Ganado, Perdido |
| notes | string | Notas del lead |
| instagram | string | Handle de Instagram |
| email | string | Email de contacto |
| gaps | array | Brechas detectadas (no_reclamada, sin_web, sin_video, etc.) |
| deepScrape | object | Resultados del scraping profundo: emails[], socials[], video_count |
| ai_proposal_draft | object | Borrador de propuesta generada por IA |
| updatedAt | timestamp | Última actualización |
| gmapsLink | string | Link a Google Maps |
| global_id | string | Referencia al negocio global |

### artifacts/{appId}/users/{userId}/config/preferences
| Columna | Tipo | Descripción |
|---------|------|-------------|
| categories | array | Lista de categorías personalizadas |
| locations | array | Lista de ubicaciones personalizadas |

### artifacts/{appId}/global_businesses
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | string | Place ID de Google Maps |
| name | string | Nombre del negocio |
| name_lower | string | Nombre en minúsculas (para búsqueda) |
| url | string | Link a Google Maps |
| hex_lat | number | Latitud de la celda H3 |
| hex_lng | number | Longitud de la celda H3 |
| rating | number | Rating promedio |
| reviews | number | Cantidad de reseñas |
| category | string | Categoría del negocio |
| status | string | pending, crm, discarded |
| needScore | number | Puntaje de necesidad (0-100) |
| last_seen | timestamp | Última vez visto |
| created_at | timestamp | Fecha de creación |
| history | subcollection | Snapshots históricos de rating/reviews |

### artifacts/{appId}/deep_scan_queue
| Columna | Tipo | Descripción |
|---------|------|-------------|
| leadId | string | ID del lead relacionado |
| userId | string | ID del usuario |
| url | string | URL a escanear |
| status | string | pending, processing, completed, error |
| createdAt | timestamp | Fecha de envío |

### artifacts/{appId}/meta/categories
| Columna | Tipo | Descripción |
|---------|------|-------------|
| list | array | Lista de categorías disponibles |

### artifacts/{appId}/global_job_queue
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | string | ID de celda H3 |
| status | string | pending, processing, completed, failed |
| lat | number | Latitud del centro de celda |
| lng | number | Longitud del centro de celda |
| attempts | number | Cantidad de intentos |
| created_at | timestamp | Fecha de creación |
| last_run | timestamp | Última ejecución |

### artifacts/cotizapro/users/{userId}/services
| Columna | Tipo | Descripción |
|---------|------|-------------|
| category | string | Categoría del servicio |
| name | string | Nombre del servicio |
| description | string | Descripción del servicio |
| price | number | Precio en CLP |
| type | string | Tipo de cobro (pago único, por mes, etc.) |

### artifacts/cotizapro/users/{userId}/quotes
| Columna | Tipo | Descripción |
|---------|------|-------------|
| clientInfo | object | {name, company, email, phone, date} |
| providerInfo | object | {brand, contact, web, email, phone} |
| proposalIntro | string | Texto introductorio |
| cart | array | Servicios incluidos en la cotización |
| subtotal | number | Subtotal sin IVA |
| iva | number | IVA calculado (19%) |
| total | number | Total con IVA |
| createdAt | timestamp | Fecha de creación |

**Nota sobre RLS:** Firestore no tiene RLS como tal, pero utiliza reglas de seguridad que controlan el acceso por usuario. Las reglas en este proyecto apuntan a que los datos están bajo la estructura `artifacts/{appId}/users/{userId}/` asegurando aislamiento por usuario.

## 3. Lista de Páginas/Rutas

| Ruta | Archivo |
|------|---------|
| `/` | app/page.js |
| `/cotizador` | app/cotizador/page.js |
| `/directorio` | app/directorio/page.js |
| `/global` | app/global/page.js |
| `/crm/[leadId]` | app/crm/[leadId]/page.js |
| `/api/audit` | app/api/audit/route.js |
| `/api/scan-gaps` | app/api/scan-gaps/route.js |
| `/api/agent/generate-proposal` | app/api/agent/generate-proposal/route.js |

## 4. Descripción de Páginas

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard principal con resumen de negocios, tracking de ranking, gestión de trabajos y CRM integrado |
| `/cotizador` | Generador de cotizaciones y propuestas comerciales con servicios configurables, historial y exportación PDF |
| `/directorio` | Vista tipo hoja de cálculo con todos los negocios escaneados, auditoría web y movimiento al CRM |
| `/global` | Directorio maestro global con paginación, filtros por categoría y selección múltiple para extracción masiva |
| `/crm/[leadId]` | Detalle del prospecto con pipeline visual, contactos, tareas, documentos y brechas detectadas |
| `/api/audit` | Auditoría técnica de sitios web (SSL, responsive, SEO, videos) |
| `/api/scan-gaps` | Detección automática de brechas de oportunidad (sin web, sin video, rating bajo, etc.) |
| `/api/agent/generate-proposal` | Generación de propuestas comerciales personalizadas mediante IA (Google Gemini) |

## 5. Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| NEXT_PUBLIC_FIREBASE_API_KEY | Clave API de Firebase |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | Dominio de autenticación Firebase |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | ID del proyecto Firebase |
| NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET | Bucket de storage Firebase |
| NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID | ID del sender de mensajería |
| NEXT_PUBLIC_FIREBASE_APP_ID | ID de la aplicación Firebase |
| NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID | ID de medición de Analytics |
| GOOGLE_GENERATIVE_AI_API_KEY | Clave API de Google Gemini IA |

## 6. Dependencias Principales (package.json)

### Dependencias
| Paquete | Versión | Uso |
|---------|---------|-----|
| next | 16.2.2 | Framework React SSR/SSG |
| react | 19.2.4 | Biblioteca UI |
| react-dom | 19.2.4 | Renderizado DOM |
| firebase | ^12.11.0 | SDK de Firebase/Firestore |
| tailwindcss | ^4 | Framework CSS utility-first |
| framer-motion | ^12.38.0 | Animaciones |
| recharts | ^3.8.1 | Gráficos y visualización |
| leaflet | ^1.9.4 | Mapas interactivos |
| react-leaflet | ^5.0.0 | Componentes Leaflet para React |
| zod | ^4.3.6 | Validación de esquemas |
| jspdf | ^4.2.1 | Generación de PDFs |
| html2canvas | ^1.4.1 | Captura DOM a imagen |
| ai | ^6.0.146 | SDK de IA (Vercel) |
| @ai-sdk/google | ^3.0.58 | Proveedor Google Gemini |
| cheerio | ^1.2.0 | Parsing HTML |
| lucide-react | ^1.7.0 | Iconos |

### DevDependencies
| Paquete | Versión | Uso |
|---------|---------|-----|
| eslint | ^9 | Linting de código |
| eslint-config-next | 16.2.2 | Configuración ESLint para Next.js |
| @tailwindcss/postcss | ^4 | Integración PostCSS para Tailwind |