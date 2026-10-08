/* מקום·AI — Service Worker
   לקחים שמוטמעים כאן (מסמך הדרישות, חלקים י״ב/י״ח):
   1. Cloudflare מפנה /index.html → / (308). תשובת ניווט "מופנית" ששמורה במטמון
      גורמת ל-ERR_FAILED ברענון רגיל → מנקים כל תשובת ניווט לעותק נקי.
   2. ניווט תמיד network-first עם זמן קצוב, ואז מטמון, ואז דף אופליין. אף פעם לא שגיאה.
   3. שומרים קובץ-קובץ (allSettled), לא addAll אטומי.
   4. בקשות לנתונים ממקורות אחרים (data.gov.il, iplan, OSM) לא נוגעים בהן כאן.
   5. מעלים VERSION בכל עדכון. */
const VERSION = 'makom-1.2.1';
const SHELL = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'privacy_policy.html'];

// --- תיקון קבוע: ניקוי תשובות "מופנות" (Cloudflare 308) ---
function clean(resp) {
  if (!resp || !resp.redirected) return Promise.resolve(resp);
  return resp.blob().then(b => new Response(b, { status: resp.status, statusText: resp.statusText, headers: resp.headers }));
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u =>
    fetch(u, { cache: 'no-cache' }).then(clean).then(r => r && r.ok && c.put(u, r))
  ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('makom-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const OFFLINE = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>מקום·AI · אין חיבור</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0D;color:#F2EFE6;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:28px">אין חיבור לאינטרנט</h1><p style="color:#A7A39A">מקום·AI צריך חיבור כדי לבדוק כתובות במאגרי המדינה.</p>
<button onclick="location.reload()" style="margin-top:16px;min-height:48px;padding:0 22px;border-radius:12px;border:1.5px solid #D4AF37;background:#D4AF37;color:#0B0B0D;font-weight:800;font-size:16px">נסה שוב</button></div></body></html>`;

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // נתונים חיצוניים — לא בטיפול ה-SW

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await withTimeout(fetch(req, { cache: 'no-cache' }), 4000).then(clean);
        if (net && net.ok) { const c = await caches.open(VERSION); c.put('./', net.clone()); }
        return net;
      } catch (err) {
        const cached = await caches.match('./');
        if (cached) return clean(cached);
        return new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // קבצי מעטפת: רשת קודם (עם בדיקת ETag), מטמון כגיבוי
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(clean).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(clean)));
});
