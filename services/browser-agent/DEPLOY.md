# Eterna AI — Browser Agent · Production Deploy

This is the **real** Playwright worker. Eterna (running on Cloudflare) calls
`POST /tasks` here over HTTPS with a bearer token. The worker runs Playwright,
captures screenshots into a persistent volume, holds approval gates, and
streams status back. No simulated mode.

Architecture:

```
Eterna app  ──HTTPS──▶  Caddy (TLS, :443)  ──▶  browser-agent (Express, :8090)
                                                  │
                                                  ├─ Playwright (headless Chromium)
                                                  ├─ SQLite task store     (/app/data/tasks.db)
                                                  └─ Evidence vault        (/app/evidence/*.png)
```

---

## 1. Provision a VPS

| Spec        | Minimum                                    | Recommended            |
| ----------- | ------------------------------------------ | ---------------------- |
| OS          | Ubuntu 22.04 / 24.04 LTS                   | same                   |
| vCPU / RAM  | 2 vCPU / 4 GB                              | 4 vCPU / 8 GB          |
| Disk        | 20 GB SSD                                  | 50 GB SSD              |
| Network     | Public IPv4, ports **80**, **443** open    | + IPv6                 |
| DNS         | `A` record `browser-agent.yourdomain.com` → VPS IP | same         |

Hetzner CPX21, DigitalOcean Basic 4GB, Hostinger VPS 2, Vultr 2C/4G — all fine.

## 2. Install Docker + clone the service

SSH in as a sudo user, then:

```bash
# Docker engine + compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Pull only the agent service (sparse checkout is optional; full clone is fine)
git clone https://github.com/<your-org>/<your-repo>.git eterna
cd eterna/services/browser-agent
```

## 3. Generate the bearer token

The **same** token must live in two places: the worker's `.env` and Eterna's
secrets. Generate one strong value:

```bash
openssl rand -hex 32
# → e.g.  a93f...e2c1   (64 hex chars)
```

## 4. Create `.env` next to `docker-compose.yml`

```bash
cat > .env <<EOF
BROWSER_AGENT_TOKEN=<paste the value from step 3>
PUBLIC_BASE_URL=https://browser-agent.yourdomain.com
EOF
chmod 600 .env
```

`PUBLIC_BASE_URL` is what the worker prefixes onto evidence screenshot URLs
so Eterna can render them.

## 5. Add HTTPS with Caddy (one-file reverse proxy)

```bash
cp Caddyfile.example Caddyfile
# edit Caddyfile and replace browser-agent.yourdomain.com with your hostname
```

`Caddyfile.example` (already in this folder) handles automatic Let's Encrypt
certs. Compose mounts it into a sidecar container.

## 6. Launch

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f browser-agent   # watch first boot — Playwright pulls Chromium
```

First boot is ~60 s while Playwright initialises. Subsequent restarts are fast.

## 7. Verify `/health`

The `/health` endpoint is **unauthenticated** so liveness probes work, but
every other endpoint requires `Authorization: Bearer <token>`.

```bash
# From the VPS
curl -fsS http://localhost:8090/health
# → {"ok":true,"service":"eterna-browser-agent"}

# From your laptop, through Caddy/TLS
curl -fsS https://browser-agent.yourdomain.com/health

# Authenticated probe (mirrors what Eterna sends)
curl -fsS -H "Authorization: Bearer $BROWSER_AGENT_TOKEN" \
  https://browser-agent.yourdomain.com/tasks
# → {"tasks":[...]}
```

Expected failure modes:

| What you see                      | What it means                                            |
| --------------------------------- | -------------------------------------------------------- |
| `curl: (7) Failed to connect`     | Container not running, firewall blocking 443, or DNS not propagated |
| `HTTP/2 401 unauthorized`         | Token mismatch — the `.env` value differs from the curl/Eterna value |
| `HTTP/2 502 Bad Gateway`          | Caddy is up but the worker container is down — `docker compose logs browser-agent` |
| `Browser launch failed` in logs   | Playwright deps missing — rebuild with `--no-cache`      |

## 8. Wire Eterna to the worker

Inside Eterna (this Lovable app), set two secrets:

| Secret name              | Value                                                |
| ------------------------ | ---------------------------------------------------- |
| `BROWSER_AGENT_URL`      | `https://browser-agent.yourdomain.com` (no trailing /) |
| `BROWSER_AGENT_TOKEN`    | exact same value as the worker's `.env`              |

Then open **Agent Console** → the banner flips to **"Browser Agent online · bearer
auth verified"**. Click **Test connection** to re-probe on demand.

## 9. Evidence storage

| Path inside container       | Host volume               | Contents                          |
| --------------------------- | ------------------------- | --------------------------------- |
| `/app/evidence/`            | `evidence_data` (named)   | PNG screenshots, evidence PDFs    |
| `/app/data/tasks.db`        | `agent_data` (named)      | SQLite task history + steps log   |

URLs returned to Eterna look like:
`https://browser-agent.yourdomain.com/evidence/<task-id>/<step>.png` —
served by the worker itself via `express.static`, cached 1h.

**Backup:** `docker run --rm -v eterna-browser-agent_evidence_data:/v -v $PWD:/b alpine tar czf /b/evidence-$(date +%F).tgz -C /v .`

## 10. Task lifecycle

Every task moves through this state machine (visible in Agent Console):

```
queued
   │  (worker picks it up — concurrency 2 by default)
   ▼
running ──▶ navigating ──▶ extracting ──▶ analyzing ──▶ capturing_evidence
   │                                                         │
   │  (compliance guard fires)                               ▼
   ├──▶ blocked          (login wall / robots / geo-block)   │
   ├──▶ captcha          (Cloudflare/hCaptcha detected)      │
   │                                                         │
   │  (composite tasks: contact discovery)                   ▼
   ├──▶ finding_contacts ──▶ contact_found                   │
   │                                                         │
   │  (drafting outputs)                                     ▼
   ├──▶ email_drafted   ──┐                                  │
   ├──▶ form_prepared   ──┤                                  │
   ├──▶ generating_report┘                                   │
   ▼                                                         ▼
waiting_approval  ─human approves─▶  completed
   │                                     ▲
   └──human cancels──▶ cancelled         │
                                         │
   any phase ─unrecoverable error─▶ failed
```

Approval gates are mandatory for: sending email, submitting takedown forms,
and any action that mutates state on a third-party platform. The worker
**never** auto-submits — it parks at `waiting_approval` until a Manager hits
**Approve** in Agent Console.

## 11. Updating the worker

```bash
cd ~/eterna && git pull
cd services/browser-agent
docker compose up -d --build
docker compose logs -f browser-agent | head -50
```

Rolling restart preserves the `evidence_data` and `agent_data` volumes.

## 12. Operating notes

- **Logs:** `docker compose logs --tail=200 -f browser-agent`
- **Reset queue:** `docker compose down && docker volume rm eterna-browser-agent_agent_data && docker compose up -d`
  (this wipes task history but keeps evidence)
- **Rotate token:** generate new value → update `.env` → `docker compose up -d` → update Eterna secret → click **Test connection**
- **Scale:** raise `PW_CONCURRENCY` env var (default 2). 4 GB RAM ≈ 2 concurrent browsers safely.
- **CAPTCHA / login walls:** detected by the compliance guard and surfaced as `blocked` / `captcha` task states. The worker stops, does not retry, and waits for human guidance — by design.
