# Eterna AI — Self-Hosted Stack

This folder ships the production deployment bundle for the Eterna AI back-of-
house services. The Lovable app itself runs on Cloudflare Workers; this stack
provides the open-source search + headless browser layer that the app calls
over HTTPS.

## What's inside

| Service       | Purpose                                                       |
| ------------- | ------------------------------------------------------------- |
| `searxng`     | Self-hosted meta-search — replaces SerpAPI / Firecrawl        |
| `caddy`       | Automatic HTTPS (Let's Encrypt) reverse proxy                 |
| `browserless` | Pooled headless Chrome (AI Browser Agent, takedown autofill)  |
| `playwright`  | Long-running Playwright worker for evidence capture           |
| `postgres`    | Local case / evidence cache                                   |
| `redis`       | BullMQ queues + SearXNG rate-limit store                      |

## Deploy

1. Provision a VPS (4 vCPU / 8 GB RAM minimum recommended for
   creator-scale monitoring). Install Docker Engine + Docker Compose v2.
2. Point an `A` record for `search.yourdomain.com` to the VPS IP.
3. Copy this `services/` folder + the root `docker-compose.yml` to the VPS.
4. Create `.env` next to `docker-compose.yml`:

   ```env
   DOMAIN=search.yourdomain.com
   ACME_EMAIL=ops@yourdomain.com
   SEARXNG_SECRET=<openssl rand -hex 32>
   SEARXNG_BEARER=<openssl rand -hex 32>
   POSTGRES_PASSWORD=<strong password>
   BROWSERLESS_TOKEN=<openssl rand -hex 32>
   ```

5. Bring it up:

   ```bash
   docker compose up -d
   docker compose logs -f searxng caddy
   ```

6. Verify:

   ```bash
   curl -s "https://search.yourdomain.com/search?q=test&format=json" \
        -H "Authorization: Bearer $SEARXNG_BEARER" | jq '.results[0]'
   ```

7. In the Eterna app, set these secrets so the monitoring engine targets
   your instance:

   - `SEARXNG_BASE_URL` → `https://search.yourdomain.com`
   - `SEARXNG_BEARER`   → same bearer token as above (optional but
     recommended; leave blank if Caddy is left public)

That's it. The Monitoring dashboard will start showing
`Source: SearXNG` on every result.
