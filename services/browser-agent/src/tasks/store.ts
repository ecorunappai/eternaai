// Tiny SQLite-backed task store + in-memory SSE pub/sub.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import type { AgentTask, TaskStatus, TaskStep } from "./types.js";

const DATA_DIR = process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "tasks.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    case_id TEXT,
    status TEXT NOT NULL,
    input TEXT NOT NULL,
    steps TEXT NOT NULL,
    extracted TEXT NOT NULL,
    screenshots TEXT NOT NULL,
    next_action TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status, created_at DESC);
`);

const bus = new EventEmitter();
bus.setMaxListeners(0);

function row2task(r: any): AgentTask {
  return {
    id: r.id,
    type: r.type,
    caseId: r.case_id ?? undefined,
    status: r.status,
    input: JSON.parse(r.input),
    steps: JSON.parse(r.steps),
    extracted: JSON.parse(r.extracted),
    screenshots: JSON.parse(r.screenshots),
    nextAction: r.next_action,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createTask(t: Omit<AgentTask, "steps" | "extracted" | "screenshots" | "nextAction" | "error" | "createdAt" | "updatedAt">): AgentTask {
  const now = new Date().toISOString();
  const task: AgentTask = {
    ...t,
    steps: [],
    extracted: {},
    screenshots: [],
    nextAction: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO tasks (id,type,case_id,status,input,steps,extracted,screenshots,next_action,error,created_at,updated_at)
     VALUES (@id,@type,@caseId,@status,@input,@steps,@extracted,@screenshots,@nextAction,@error,@createdAt,@updatedAt)`,
  ).run({
    ...task,
    caseId: task.caseId ?? null,
    input: JSON.stringify(task.input),
    steps: JSON.stringify(task.steps),
    extracted: JSON.stringify(task.extracted),
    screenshots: JSON.stringify(task.screenshots),
  });
  return task;
}

export function getTask(id: string): AgentTask | null {
  const r = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return r ? row2task(r) : null;
}

export function listTasks(limit = 100): AgentTask[] {
  return db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?").all(limit).map(row2task);
}

export function patchTask(id: string, patch: Partial<AgentTask>) {
  const cur = getTask(id);
  if (!cur) return;
  const merged: AgentTask = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE tasks SET type=@type, case_id=@caseId, status=@status, input=@input, steps=@steps,
       extracted=@extracted, screenshots=@screenshots, next_action=@nextAction, error=@error, updated_at=@updatedAt
     WHERE id=@id`,
  ).run({
    ...merged,
    caseId: merged.caseId ?? null,
    input: JSON.stringify(merged.input),
    steps: JSON.stringify(merged.steps),
    extracted: JSON.stringify(merged.extracted),
    screenshots: JSON.stringify(merged.screenshots),
  });
  bus.emit("task:" + id, merged);
  bus.emit("any", merged);
}

export function appendStep(id: string, step: Omit<TaskStep, "ts">, statusOverride?: TaskStatus) {
  const cur = getTask(id);
  if (!cur) return;
  const newStep: TaskStep = { ts: new Date().toISOString(), ...step };
  const status = statusOverride ?? (newStep.phase as TaskStatus) ?? cur.status;
  const screenshots = step.screenshot ? [...cur.screenshots, step.screenshot] : cur.screenshots;
  patchTask(id, { steps: [...cur.steps, newStep], status, screenshots });
}

export function setExtracted(id: string, patch: Record<string, unknown>) {
  const cur = getTask(id);
  if (!cur) return;
  patchTask(id, { extracted: { ...cur.extracted, ...patch } });
}

export function subscribe(id: string, handler: (t: AgentTask) => void): () => void {
  const ch = "task:" + id;
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}
