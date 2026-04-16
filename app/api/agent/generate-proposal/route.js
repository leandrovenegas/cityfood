import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import * as cheerio from 'cheerio';
import { z } from 'zod';

export async function POST(req) {
  try {
    const body = await req.json();
    const { url, name, status } = body;

    // Validación de llave API del lado de Vercel/Node
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "Falta configurar GOOGLE_GENERATIVE_AI_API_KEY en tu entorno (.env.local)." },
        { status: 500 }
      );
    }

    if (!name) {
      return Response.json({ error: "Faltan datos del prospecto (name)." }, { status: 400 });
    }

    // 1. Simulación de Scraping simple para recuperar contexto base
    let websiteText = "No se pudo extraer información del sitio web (URL inválida, vacía o protegida).";
    if (url && url.startsWith('http')) {
      try {
        // Hacemos el request con un timeout de 4 segundos
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          // Limpiamos scripts y extraemos todo el body
          $('script, style, noscript, svg, img').remove();
          websiteText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000); // 5000 chars máx a la IA
        }
      } catch (err) {
        console.warn(`[Agent] Fetch a ${url} devolvió Timeout/Error, procediendo con info genérica.`);
      }
    }

    // 2. Tono y Estrategia del Embudo según el Estado Firestore
    let funnelContext = "";
    if (status === 'Prospecto') {
      funnelContext = "El prospecto es Frío (ToFu). Tu tono debe ser de descubrimiento exploratorio, buscando educar primero y demostrar autoridad sobre por qué Google Maps domina su nicho.";
    } else if (status === 'Primer Contacto') {
      funnelContext = "El prospecto es Templado (MoFu). Ya te conocen. Tu tono debe enfocarse en resolver dolores y la solución audiovisual para retener la atención de sus clientes actuales.";
    } else if (status === 'Negociación') {
      funnelContext = "El prospecto es Caliente (BoFu). Están negociando. Tu tono debe ser urgente e invitar a un Cierre o Call To Action fuerte y agresivo, apelando al Retorno de Inversión inmediato.";
    } else {
      funnelContext = "Adapta el tono a un cliente interesado en potenciar su negocio local en Google Maps.";
    }

    // 3. Generación Inteligente mediante SDK
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: z.object({
        gancho_inicial: z.string().describe("Párrafo de apertura súper enganchador saludando al negocio por su nombre."),
        analisis_competencia_maps: z.string().describe("Argumento sobre cómo 3 competidores locales les podrían robar clics por falta de SEO local o fotos borrosas en Maps."),
        propuesta_audiovisual: z.string().describe("Descripción hipnótica de los de un Reel o Shooting fotográfico que podrías hacer en su local, inspirado en su sitio web."),
        cta_personalizado: z.string().describe("Un Call-To-Action (Llamado a la acción) adaptado estrictamente a su fase actual en el Funnel.")
      }),
      prompt: `
        Eres el mejor Analista de Ventas de Servicios de Marketing para Negocios Locales en Hispanoamérica.
        Tu misión: Analizar al negocio objetivo "${name}" y escupir argumentos en JSON.
        
        ESTRATEGIAS SEGÚN EL EMBUDO (ESTADO CRM DEL CLIENTE):
        ${funnelContext}

        EVIDENCIA (Texto extraído por scraping de la web oficial de su negocio):
        """
        ${websiteText}
        """

        Instrucción cruda: Procesa el contexto web y rellena de inmediato el esquema JSON con la propuesta persuasiva. Responde en el tono exacto exigido y totalmente en español de acento neutral/latino.
      `,
    });

    return Response.json({ success: true, proposal: object });

  } catch (error) {
    console.error("🤖 Generative AI Error:", error);
    return Response.json(
      { error: "Error en la IA al generar la propuesta.", details: error.message },
      { status: 500 }
    );
  }
}
