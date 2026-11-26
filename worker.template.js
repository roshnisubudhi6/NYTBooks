// The Shelf — Cloudflare Worker
// Serves the magazine page at "/" and proxies four NYT Books API endpoints at "/api/...".
// Your NYT key lives in the Worker as a secret named NYT_KEY, so visitors never see it.
// Optional: bind a KV namespace as SHELF_CACHE so answers are shared across all visitors
// (without it, answers are still cached in memory, but only per server instance).

const PAGE = __PAGE__;

// endpoint -> seconds to keep an answer
const ROUTES = {
  '/lists/full-overview.json': 21600,         // this month's issue: refresh every 6 hours
  '/lists/overview.json': 21600,              // fallback (top 5s)
  '/lists/best-sellers/history.json': 86400,  // author history: daily
  '/reviews.json': 86400,                     // reviews: daily
};
const PARAMS = ['published_date', 'author', 'title', 'isbn', 'offset'];
const memory = new Map();
// Sites allowed to call this API from the browser (the page on workers.dev needs no entry).
const ALLOWED_ORIGINS = ['https://nytbook.roshnisubudhi.com', 'https://roshnisubudhi6.github.io'];
let cors = {};

const json = (body, status, ttl) => new Response(body, {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': ttl ? `public, max-age=${Math.min(ttl, 3600)}` : 'no-store',
    ...cors,
  },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    cors = ALLOWED_ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });

    if (!url.pathname.startsWith('/api/')) {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (request.method !== 'GET') return json('{"error":"method"}', 405);

    const path = url.pathname.slice(4);
    let ttl = ROUTES[path];
    if (!ttl) return json('{"error":"not found"}', 404);
    if (!env.NYT_KEY) return json('{"error":"NYT_KEY secret is not set"}', 500);

    const params = new URLSearchParams();
    for (const p of PARAMS) {
      const v = (url.searchParams.get(p) || '').trim().slice(0, 120);
      if (v) params.set(p, v);
    }
    // a past month's issue never changes, so keep it for 30 days
    if (path.includes('overview') && params.get('published_date')) ttl = 30 * 86400;
    const cacheKey = path + '?' + params.toString();

    const hit = memory.get(cacheKey);
    if (hit && hit.exp > Date.now()) return json(hit.body, 200, ttl);
    if (env.SHELF_CACHE) {
      const kv = await env.SHELF_CACHE.get(cacheKey);
      if (kv) { memory.set(cacheKey, { body: kv, exp: Date.now() + 300e3 }); return json(kv, 200, ttl); }
    }

    params.set('api-key', env.NYT_KEY);
    const upstream = await fetch('https://api.nytimes.com/svc/books/v3' + path + '?' + params.toString(), {
      headers: { accept: 'application/json' },
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      // 401 = bad key, 429 = NYT rate limit; pass the status through, never the key
      return json(JSON.stringify({ error: 'upstream', status: upstream.status }), [400, 401, 404, 429].includes(upstream.status) ? upstream.status : 502);
    }
    memory.set(cacheKey, { body, exp: Date.now() + ttl * 1000 });
    if (env.SHELF_CACHE) ctx.waitUntil(env.SHELF_CACHE.put(cacheKey, body, { expirationTtl: Math.max(60, ttl) }));
    return json(body, 200, ttl);
  },
};
