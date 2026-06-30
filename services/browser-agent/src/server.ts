// Eterna AI Browser Agent — Express + Playwright
// Compliance: public pages only; never bypasses login walls or CAPTCHA;
// never auto-submits forms. Human approval is enforced by the Eterna app.
import express from "express";
import cors from "cors";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { investigateYouTube } from "./agents/youtube.agent.js";
import { investigateInstagram } from "./agents/instagram.agent.js";
import { discoverContacts } from "./agents/contact.agent.js";
import { getInstagramStatus } from "./agents/instagram-session.js";
import { captureEvidence } from "./agents/evidence.agent.js";
import { enqueue, approve as approveTask, cancel as cancelTask } from "./tasks/queue.js";
import { getTask, listTasks, subscribe } from "./tasks/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(process.env.AGENT_DATA_DIR ?? path.resolve(__dirname, ".."), "evidence");
const PORT = Number(process.env.PORT ?? 8090);
const TOKEN = process.env.BROWSER_AGENT_TOKEN ?? "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

await fs.mkdir(EVIDENCE_DIR, { recursive: true });

// Single shared browser pool — created lazily, recycled on crash.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.PW_HEADLESS !== "false",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    browserPromise.then((b) => {
      b.on("disconnected", () => { browserPromise = null; });
    }).catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export interface AgentCtx {
  browser: Browser;
  evidenceDir: string;
  publicBaseUrl: string;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/evidence", express.static(EVIDENCE_DIR, { maxAge: "1h" }));

// ---- Auth middleware (Bearer token) ----
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!TOKEN) return next(); // dev mode, no token configured
  const h = req.header("authorization") ?? "";
  if (h !== `Bearer ${TOKEN}`) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "eterna-browser-agent" }));

// Instagram monitor account status (no credentials returned).
app.get("/integrations/instagram/status", async (_req, res) => {
  try {
    const s = await getInstagramStatus();
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const YTSchema = z.object({
  videoUrl: z.string().url().optional().or(z.literal("")),
  channelUrl: z.string().url().optional().or(z.literal("")),
  caseId: z.string().optional().default(""),
}).refine((d) => d.videoUrl || d.channelUrl, { message: "videoUrl or channelUrl required" });

app.post("/investigate/youtube", async (req, res) => {
  const p = YTSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  try {
    const ctx: AgentCtx = { browser: await getBrowser(), evidenceDir: EVIDENCE_DIR, publicBaseUrl: PUBLIC_BASE_URL };
    const out = await investigateYouTube(ctx, p.data);
    res.json({ status: "success", ...out });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

const IGSchema = z.object({
  profileUrl: z.string().url().optional().or(z.literal("")),
  postUrl: z.string().url().optional().or(z.literal("")),
  caseId: z.string().optional().default(""),
}).refine((d) => d.profileUrl || d.postUrl, { message: "profileUrl or postUrl required" });

app.post("/investigate/instagram", async (req, res) => {
  const p = IGSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  try {
    const ctx: AgentCtx = { browser: await getBrowser(), evidenceDir: EVIDENCE_DIR, publicBaseUrl: PUBLIC_BASE_URL };
    const out = await investigateInstagram(ctx, p.data);
    res.json({ status: "success", ...out });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

const ContactSchema = z.object({
  name: z.string().optional().default(""),
  channelUrl: z.string().optional().default(""),
  websiteUrl: z.string().optional().default(""),
  socialLinks: z.array(z.string()).optional().default([]),
});

app.post("/discover-contact", async (req, res) => {
  const p = ContactSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  try {
    const ctx: AgentCtx = { browser: await getBrowser(), evidenceDir: EVIDENCE_DIR, publicBaseUrl: PUBLIC_BASE_URL };
    const out = await discoverContacts(ctx, p.data);
    res.json({ status: "success", ...out });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

const EvidenceSchema = z.object({
  url: z.string().url(),
  caseId: z.string().optional().default(""),
  type: z.enum(["youtube", "instagram", "website"]).default("website"),
});

app.post("/capture-evidence", async (req, res) => {
  const p = EvidenceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  try {
    const ctx: AgentCtx = { browser: await getBrowser(), evidenceDir: EVIDENCE_DIR, publicBaseUrl: PUBLIC_BASE_URL };
    const out = await captureEvidence(ctx, p.data);
    res.json({ status: "success", ...out });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

// ====================================================================
// Task-based operator API
// ====================================================================

const TaskSchema = z.object({
  type: z.enum([
    "youtube.investigate",
    "instagram.investigate",
    "contact.discover",
    "email.prepare",
    "takedown.prepare",
  ]),
  input: z.record(z.any()).default({}),
  caseId: z.string().optional(),
});

app.post("/tasks", (req, res) => {
  const p = TaskSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  const task = enqueue({
    type: p.data.type,
    input: p.data.input,
    caseId: p.data.caseId,
    getBrowser,
    evidenceDir: EVIDENCE_DIR,
    publicBaseUrl: PUBLIC_BASE_URL,
  });
  res.json({ status: "queued", task });
});

app.get("/tasks", (_req, res) => res.json({ tasks: listTasks(200) }));

app.get("/tasks/:id", (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json({ task: t });
});

app.post("/tasks/:id/approve", (req, res) => {
  const t = approveTask(req.params.id);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json({ task: t });
});

app.post("/tasks/:id/cancel", (req, res) => {
  const t = cancelTask(req.params.id);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json({ task: t });
});

// Server-Sent Events live stream
app.get("/tasks/:id/events", (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).end();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify(t)}\n\n`);
  const unsub = subscribe(req.params.id, (next) => {
    res.write(`data: ${JSON.stringify(next)}\n\n`);
  });
  const ping = setInterval(() => res.write(`: ping\n\n`), 15000);
  req.on("close", () => { clearInterval(ping); unsub(); });
});

// Live frame endpoint — Agent Console polls this every 1 second.
// Returns { label, ts, image (base64 PNG) } so the UI can render the
// latest Playwright screenshot without a separate cross-origin image fetch.
app.get("/tasks/:id/live", async (req, res) => {
  const id = req.params.id;
  const t = getTask(id);
  if (!t) return res.status(404).json({ error: "not_found" });
  const dir = path.join(EVIDENCE_DIR, id);
  try {
    const [png, meta] = await Promise.all([
      fs.readFile(path.join(dir, "latest-live.png")).catch(() => null),
      fs.readFile(path.join(dir, "latest-live.json"), "utf8").then(JSON.parse).catch(() => null),
    ]);
    if (!png) {
      return res.json({
        ready: false,
        label: meta?.label ?? null,
        status: t.status,
        nextAction: t.nextAction,
      });
    }
    res.json({
      ready: true,
      label: meta?.label ?? "Browser session",
      ts: meta?.ts ?? Date.now(),
      pageUrl: meta?.url ?? null,
      status: t.status,
      image: png.toString("base64"),
      mime: "image/png",
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`[eterna-browser-agent] listening on :${PORT} (public=${PUBLIC_BASE_URL})`);
});
