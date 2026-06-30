# Eterna AI — Playwright Browser Agent

External worker service that the Eterna AI app calls to investigate **public**
pages (YouTube, Instagram, TikTok, Facebook, X, websites), capture evidence
screenshots, and discover publicly listed contact details.

> Lovable / Cloudflare Workers cannot run Playwright. This service is meant to
> run on **your own VPS** behind HTTPS, and the Eterna app talks to it over
> the network using a Bearer token.

## Compliance (hard-coded)

The agents are explicitly designed to:

- Only visit **public** pages — no login, no cookies imported.
- Never bypass login walls or CAPTCHA.
- Never scrape private/non-public content.
- Never auto-submit takedown forms or warning emails.
- Only return publicly visible information.

Human approval in the Eterna app is still required before any warning email
or platform takedown is sent.

## API

All endpoints require `Authorization: Bearer $BROWSER_AGENT_TOKEN` (except `/health`).

| Method | Path                     | Purpose                                            |
| ------ | ------------------------ | -------------------------------------------------- |
| GET    | `/health`                | Liveness probe                                     |
| POST   | `/investigate/youtube`   | Video + channel-About investigation                |
| POST   | `/investigate/instagram` | Public profile / post meta + external links       |
| POST   | `/discover-contact`      | Public emails / websites / contact forms / socials |
| POST   | `/capture-evidence`      | Single screenshot + page title for a case          |

Screenshots are served from `GET /evidence/<caseId>/<file>.png`.

### Request / response shapes

`POST /investigate/youtube`
```json
// in
{ "videoUrl": "https://www.youtube.com/watch?v=...", "channelUrl": "", "caseId": "uuid" }
// out
{
  "status": "success",
  "title": "...",
  "channelName": "...",
  "channelUrl": "...",
  "description": "...",
  "thumbnailUrl": "...",
  "screenshots": ["https://.../evidence/uuid/yt-video-xxxx.png"],
  "publicContacts": ["press@example.com"]
}
```

`POST /investigate/instagram`
```json
{ "profileUrl": "https://www.instagram.com/<handle>/", "postUrl": "", "caseId": "uuid" }
```

`POST /discover-contact`
```json
{ "name": "Creator", "channelUrl": "", "websiteUrl": "https://example.com", "socialLinks": [] }
```

`POST /capture-evidence`
```json
{ "url": "https://example.com/violating-post", "caseId": "uuid", "type": "website" }
```

## Local run

```bash
cd services/browser-agent
npm install        # installs Playwright + Chromium
npm start
```

## Production (Docker)

```bash
cd services/browser-agent
echo "BROWSER_AGENT_TOKEN=$(openssl rand -hex 32)" > .env
echo "PUBLIC_BASE_URL=https://browser-agent.yourdomain.com" >> .env
docker compose up -d --build
```

Put a reverse proxy with TLS (Caddy/Nginx/Cloudflare Tunnel) in front of port
`8090`.

## Wire it into the Eterna app

Add these two secrets to the Eterna Lovable project:

```
BROWSER_AGENT_URL=https://browser-agent.yourdomain.com
BROWSER_AGENT_TOKEN=<same token as above>
```

The Monitoring Engine (`src/lib/browser-agent-client.functions.ts`) calls
this service and falls back gracefully if it's offline — the dashboard
shows a banner instead of crashing.
