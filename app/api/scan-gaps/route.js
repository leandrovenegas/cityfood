export async function POST(req) {
  try {
    const body = await req.json();
    const { website, rating, phone } = body;

    const detectedGaps = [];

    // ── 1. SIN SITIO WEB ─────────────────────────────────────────
    const socialDomains = ['instagram.com', 'facebook.com', 'tiktok.com', 'twitter.com', 'x.com', 'linktr.ee'];
    if (!website) {
      detectedGaps.push('sin_web');
    } else {
      // ── 2. SOLO REDES SOCIALES (URL de web apunta a una red) ───
      try {
        const host = new URL(website).hostname.toLowerCase();
        if (socialDomains.some(d => host.includes(d))) {
          detectedGaps.push('solo_social');
          detectedGaps.push('sin_web'); // prácticamente sin web real
        }
      } catch (_) {}
    }

    // ── 3. RATING BAJO (< 4.0) ───────────────────────────────────
    const r = parseFloat(rating);
    if (!isNaN(r) && r > 0 && r < 4.0) {
      detectedGaps.push('rating_bajo');
    }

    // ── 4. SIN VIDEO (auditoría web si tiene sitio real) ─────────
    if (website && !detectedGaps.includes('solo_social')) {
      try {
        const baseUrl = req.url.replace('/api/scan-gaps', '');
        const auditRes = await fetch(`${baseUrl}/api/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: website }),
          signal: AbortSignal.timeout(12000),
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          const audit = auditData.audit;
          if (audit && audit.video_count === 0) {
            detectedGaps.push('sin_video');
          }
        }
      } catch (_) {
        // Timeout o error al auditar → marcar como sin video por seguridad
        detectedGaps.push('sin_video');
      }
    } else if (!website) {
      // Sin web → tampoco tiene video
      detectedGaps.push('sin_video');
    }

    return Response.json({
      success: true,
      detected_gaps: [...new Set(detectedGaps)], // deduplicar
      note: 'Los gaps 🔓🍽️💬📷 requieren inspección manual en Google Maps.',
    });

  } catch (error) {
    console.error('scan-gaps error:', error);
    return Response.json(
      { error: 'Error al analizar brechas.', details: error.message },
      { status: 500 }
    );
  }
}
