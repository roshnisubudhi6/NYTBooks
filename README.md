# The Shelf: a retro magazine built on the NYT Books API

## Files
- `index.html`: the magazine. Double-click to open it on your own computer; it asks for your NYT key (kept only in that browser).
- `worker.js`: the same page plus a tiny server, ready for Cloudflare Workers. **Deploy this one to share the site with everyone.**
- `worker.template.js` + `build.py`: the source of `worker.js`. After editing `index.html`, run `python3 build.py` to rebuild `worker.js`.
- `wrangler.toml`: config if you deploy from the terminal.

## Why a server?
A web page can't hide anything: if your key were inside index.html, any visitor could "View source", copy it,
and burn your 500-requests-a-day quota (or get it revoked). The Worker keeps the key as a secret, calls NYT
for visitors, and caches the answers. Each month's issue is a single NYT call, which then serves everyone.

## Deploy (dashboard, no terminal) — about 10 minutes
1. Sign up free at https://dash.cloudflare.com.
2. Workers & Pages → Create → Create Worker → name it `the-shelf` → Deploy.
3. Edit code → select all → paste the whole contents of `worker.js` → Deploy.
4. Back on the Worker: Settings → Variables and Secrets → Add → type **Secret**, name `NYT_KEY`, value = your NYT key → Deploy.
5. (Recommended) Storage & Databases → KV → Create namespace `SHELF_CACHE`. Then on the Worker: Settings → Bindings → Add → KV namespace,
   variable name `SHELF_CACHE`, pick the namespace → Deploy. This makes the cache shared by all visitors.
6. Open `https://the-shelf.<your-subdomain>.workers.dev`. Share that link.

## Deploy (terminal)
    npm i -g wrangler
    wrangler login
    wrangler secret put NYT_KEY      # paste your key when asked
    wrangler deploy

## What the server allows
Only `/lists/full-overview.json`, `/lists/overview.json` (fallback), `/lists/best-sellers/history.json` and `/reviews.json`, with a fixed set of parameters,
so nobody can use your Worker as a general NYT relay.
Cache times: current month 6 hours, past months 30 days, author lookups 1 day.
