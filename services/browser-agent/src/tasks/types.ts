// Task types and status machine for the Eterna Browser Agent operator.
//
// Compliance rules baked into every runner:
//   - public pages only (no login wall bypass, no CAPTCHA solving)
//   - never auto-submits legal complaints / takedown forms — always halts at
//     "waiting_approval" so a human can review.

export type TaskType =
  | "youtube.investigate"
  | "instagram.investigate"
  | "contact.discover"
  | "email.prepare"
  | "takedown.prepare"
  | "web.search"
  | "image.reverse";


export type TaskStatus =
  | "queued"
  | "browser_opened"
  | "navigating"
  | "extracting"
  | "evidence_captured"
  | "contact_found"
  | "email_drafted"
  | "form_prepared"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskStep {
  ts: string;
  phase: TaskStatus | "init" | "guard";
  url?: string;
  note: string;
  screenshot?: string; // public URL
}

export interface AgentTask {
  id: string;
  type: TaskType;
  caseId?: string;
  status: TaskStatus;
  input: Record<string, unknown>;
  steps: TaskStep[];
  extracted: Record<string, unknown>;
  screenshots: string[];
  nextAction: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
