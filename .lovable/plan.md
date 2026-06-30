## Goal

Upgrade the AI Browser Agent from a one-shot crawler into a task-based operator that runs end-to-end workflows on the external Playwright service, with a visible queue, live session view, and human-in-the-loop approval gates.

## What changes

### 1. External Playwright worker — task engine

Extend `services/browser-agent/` so it runs *tasks*, not just one-shot endpoints.

- New endpoints:
  - `POST /tasks` — enqueue a task `{ type, input, caseId, callbackUrl? }`
  - `GET  /tasks/:id` — full task record (status, steps[], screenshots[], extracted, nextAction)
  - `GET  /tasks/:id/events` — Server-Sent Events stream for live updates
  - `POST /tasks/:id/approve` / `/cancel` — release/cancel waiting tasks
- Task types: `youtube.investigate`, `instagram.investigate`, `contact.discover`, `email.prepare`, `takedown.prepare`.
- Each task drives a Playwright session through scripted steps (search → open video → open channel → open About → extract links → capture screenshots → find email). Every step writes a `Step` event with `{ts, phase, url, screenshot, note}`.
- Status machine (persisted in the worker's SQLite file `/data/tasks.db`):
  `queued → browser_opened → navigating → extracting → evidence_captured → contact_found → email_drafted → form_prepared → waiting_approval → completed` (plus `failed`, `cancelled`).
- In-process queue (p-queue, concurrency 2) — no external broker needed.
- Compliance guards (refuse to proceed if a login wall, CAPTCHA, or private-content marker is detected; never auto-submit on takedown forms — always stop at `waiting_approval`).
- All screenshots stored at `/data/evidence/<taskId>/step-N.png` and served read-only via `/evidence/...`.

### 2. App-side client + persistence

- Extend `src/lib/browser-agent-client.functions.ts` with `enqueueAgentTask`, `getAgentTask`, `approveAgentTask`, `cancelAgentTask`, and a server-sent `streamAgentTask` helper that polls when SSE isn't reachable.
- New `agent_tasks` table (Lovable Cloud) mirroring worker state for history + RLS: `id, user_id, case_id, type, status, input jsonb, steps jsonb, extracted jsonb, screenshots text[], next_action text, created_at, updated_at`. RLS scoped to `auth.uid()`, with the standard GRANTs.
- A small TanStack server function syncs the latest worker state into `agent_tasks` whenever the UI fetches a task, so the app keeps a durable record even if the worker is reset.

### 3. Live Session View (UI)

Rebuild `src/routes/browser-agent.tsx` around a 3-pane operator console:

```text
┌──────────────┬──────────────────────────────┬───────────────┐
│ Task queue   │ Live session                 │ Extracted     │
│  (status     │  - current URL               │  - links      │
│   chips,     │  - current step + spinner    │  - emails     │
│   filters)   │  - latest screenshot         │  - contacts   │
│              │  - timeline of steps         │  - draft email│
│              │  - "Approve" / "Cancel"      │  - takedown   │
│              │                              │    form fields│
└──────────────┴──────────────────────────────┴───────────────┘
```

- "New Task" dialog with task-type picker and per-type form (creator name, channel URL, profile URL, contact target, evidence ids).
- Live updates via the SSE helper with a 2s polling fallback.
- Approval gate: tasks halt at `waiting_approval` (warning email + takedown prep). Manager clicks Approve to mark complete; tasks never auto-submit.

### 4. Integration with existing workflows

- Monitoring dashboard "Gather Evidence" now enqueues `youtube.investigate` / `instagram.investigate` instead of the one-shot call, and deep-links into the new console.
- Takedown module's "Prepare takedown" enqueues `takedown.prepare`, which produces the pre-filled form snapshot + screenshots and stops at `waiting_approval`.
- Warning emails enqueued as `email.prepare`; the draft + evidence link land on the case, ready for the manager.

## Constraints honoured

- External worker only — no Playwright in the Lovable runtime.
- Public information only; login walls / CAPTCHA / private pages cause the task to halt with a clear reason.
- No auto-submit on legal complaints.
- RLS + GRANTs on `agent_tasks`; user actions go through `requireSupabaseAuth` server functions.

## Out of scope (ask first if needed)

- Auto-rotating proxies / residential IPs.
- Per-user OAuth into YouTube/Instagram (different module).
- Distributed multi-worker scaling (current design is single-worker, queue depth ~hundreds/day).

## Technical notes

- Worker stack: Express + Playwright/Chromium + `p-queue` + `better-sqlite3`, all already permitted by the existing Dockerfile.
- SSE endpoint uses chunked `text/event-stream`; the client helper falls back to 2s polling of `GET /tasks/:id` if EventSource isn't available (Cloudflare Worker fetch on the app side).
- Screenshots: PNG, viewport 1280x800, full-page off (smaller payloads, faster).
- Auth between app ↔ worker: existing `BROWSER_AGENT_TOKEN` bearer.
- New deps in the worker only: `p-queue`, `better-sqlite3`. App side gets no new runtime deps.
