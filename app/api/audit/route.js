import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    const audit = { score: 0, secure: false, responsive: false, has_seo: false, good_content_length: false, online: false, video_count: 0 };
    
    audit.secure = url.startsWith("https://");
    if (audit.secure) audit.score += 20;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout max for API Route
    
    // Attempt to fetch the website
    const response = await fetch(url, { 
      signal: controller.signal, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (response && response.ok) {
        audit.online = true;
        audit.score += 30;
        
        try {
            // Read a chunk of HTML to evaluate heuristcs (up to ~100kb usually enough for heads)
            const htmlBuffer = await response.arrayBuffer();
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const html_content = decoder.decode(htmlBuffer.slice(0, 100000)).toLowerCase();

            if (html_content.includes('<meta name="viewport"')) {
                audit.responsive = true;
                audit.score += 20;
            }
            if (html_content.includes('property="og:') || html_content.includes('name="twitter:')) {
                audit.has_seo = true;
                audit.score += 15;
            }
            if (html_content.length > 2000) {
                audit.good_content_length = true;
                audit.score += 15;
            }
            
            // Extraer videos y iframes audiovisuales
            const videoTags = (html_content.match(/<video/g) || []).length;
            const embedFrames = (html_content.match(/<iframe[^>]*src="[^"]*(youtube\.com|youtu\.be|vimeo\.com)/gi) || []).length;
            audit.video_count = videoTags + embedFrames;
            if (audit.video_count > 0) {
                audit.score = Math.min(100, audit.score + 10); // Bono si tienen multimedia
            }
        } catch(e) {}
    }
    
    return NextResponse.json({ audit });

  } catch (error) {
    console.error("Audit error:", error);
    return NextResponse.json({ error: "Audit failed" }, { status: 500 });
  }
}
