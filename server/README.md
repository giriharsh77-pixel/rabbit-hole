# Rabbit Hole backend

A tiny API proxy so **secret keys never ship inside the Chrome extension**. The extension sends *queries only*; this service holds the Brave Search and Anthropic keys, calls the upstream APIs, validates what comes back and returns minimal JSON.

It is **optional** — without it the extension works with public data, or with keys users paste into Settings. Use the backend when you distribute the extension and want to keep keys private.

```
GET  /health               → { ok, version, features: { search, ai } }
POST /v1/search/substack   { queries: string[≤4], limit?: 5–30 }   → { candidates: [...] }
POST /v1/ai/analyze        { title, platform?, description?, … }    → { analysis: { topics, entities, concepts, queries } }
POST /v1/ai/refine         { source, candidates: [≤15] }            → { judgements: [{ id, relevance, why }] }
```

The core is one function — `createHandler(config) → (Request) => Promise<Response>` in [`src/handler.ts`](src/handler.ts) — built only on Web-standard APIs, so it runs on Cloudflare Workers, Node ≥ 20, Deno, Bun or any edge runtime. Two thin adapters are included: `src/worker.ts` (Workers) and `src/node.ts` (Node).

## Option A — Cloudflare Workers (recommended)

Free tier is plenty for a personal or small-team extension.

```bash
cd server
npx wrangler login
npx wrangler secret put BRAVE_API_KEY            # from https://brave.com/search/api/
npx wrangler secret put ANTHROPIC_API_KEY        # optional — enables the AI endpoints
npx wrangler deploy
# → https://rabbit-hole-api.<your-subdomain>.workers.dev
```

Lock it to your extension (find the ID at `chrome://extensions`) — edit `wrangler.toml` or set it as a variable:

```toml
[vars]
ALLOWED_ORIGINS = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
ANTHROPIC_MODEL = "claude-haiku-4-5"     # optional: cheaper/faster than the default claude-opus-5-5
RATE_LIMIT_PER_MINUTE = "30"
```

Check it:

```bash
curl https://rabbit-hole-api.<you>.workers.dev/health
# {"ok":true,"version":"1.0.0","features":{"search":true,"ai":true}}
```

## Option B — Node / Docker / VPS

```bash
# from the repository root
cp .env.example .env           # or create server/.env
# add:  BRAVE_API_KEY=...   ANTHROPIC_API_KEY=...   ALLOWED_ORIGINS=chrome-extension://<id>
npm run server:dev             # http://127.0.0.1:8787
```

Variables: `BRAVE_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE`, `PORT` (8787), `HOST` (127.0.0.1). For a public deployment put it behind HTTPS (Caddy, nginx, a platform router). A minimal container:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/src/node.ts"]
```

## Connect the extension

Set the URL and rebuild — its origin is added to the manifest's `host_permissions` at build time:

```bash
echo 'VITE_BACKEND_URL=https://rabbit-hole-api.<you>.workers.dev' >> .env
npm run build
```

For local development: `VITE_BACKEND_URL=http://localhost:8787` with `npm run server:dev`.

## Security model (and its honest limits)

- **Keys** exist only in the server's environment. Upstream errors are mapped to generic codes — upstream bodies, headers and keys are never echoed (tested).
- **Origin allow-list** (`ALLOWED_ORIGINS`; default: any `chrome-extension://`). Browsers can't forge `Origin`, so this stops other *websites* from using your quota. A non-browser client can set any header, so it is not authentication.
- **Rate limiting** per client IP (default 30/min), in memory per instance. For real protection add your platform's rate-limit rules (e.g. Cloudflare → Security → WAF → Rate limiting) and a spending cap on the upstream accounts.
- **Input limits**: 40 KB bodies, ≤4 queries × 120 chars, ≤15 candidates, text sanitised and truncated before it reaches a model.
- **Output validation**: search results must be real Substack article URLs; AI output is schema-constrained and re-validated; the extension validates everything again on receipt.
- **No logging of request content** is performed by this code. Your hosting platform may log requests; configure it accordingly.
- No cookies, no sessions, no database — `cache-control: no-store`.
