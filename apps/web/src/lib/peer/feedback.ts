import "server-only";
import { createRlsClient } from "@/lib/supabase/server";

export interface PeerPrompt {
  id: string;
  q: string;
  hint: string;
  type: "short" | "long";
  optional?: boolean;
}

// Ported verbatim from the design (data.jsx PEER_PROMPTS). pq1–pq3 required, pq4 optional.
export const PEER_PROMPTS: readonly PeerPrompt[] = [
  { id: "pq1", q: "How have you worked with them?", hint: "A line or two of context — same team, a project, a one-off.", type: "short" },
  { id: "pq2", q: "What are they great at?", hint: "Be specific — a moment or example helps more than adjectives.", type: "long" },
  { id: "pq3", q: "Where could they grow?", hint: "Said kindly, the way you'd want to hear it yourself.", type: "long" },
  { id: "pq4", q: "Anything else worth knowing?", hint: "Optional — leave blank if you've covered it.", type: "long", optional: true },
];

export const PEER_PROMPT_IDS = PEER_PROMPTS.map((p) => p.id);
export const REQUIRED_PEER_PROMPT_IDS = PEER_PROMPTS.filter((p) => !p.optional).map((p) => p.id);

export type PeerAnswers = Record<string, string>;

export interface PeerAssignment {
  reviewId: string;
  subjectName: string;
  department: string | null;
  state: string;
  deadlineAt: string | null;
  submittedAt: string | null;
}

export interface PeerFeedbackView extends PeerAssignment {
  answers: PeerAnswers;
}

/** Keep only the known prompt keys — never persist arbitrary client payload. */
export function sanitizeAnswers(answers: PeerAnswers): PeerAnswers {
  const out: PeerAnswers = {};
  for (const id of PEER_PROMPT_IDS) {
    const v = answers[id];
    if (typeof v === "string") out[id] = v;
  }
  return out;
}

/**
 * The peer's assigned feedback requests. Reads `peer_request_list` — an owner-run
 * view scoped to peer_account_id = current — which exposes ONLY the subject's
 * name/department + this peer's own row metadata. A peer has no read path to the
 * self-review, the draft, the outcome, or any other peer (enforced by RLS, proven
 * in the DB probes).
 */
export async function getPeerAssignments(): Promise<PeerAssignment[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("peer_request_list")
    .select("review_id, subject_name, subject_department, state, deadline_at, submitted_at");
  return (data ?? []).map((r) => ({
    reviewId: r.review_id as string,
    subjectName: r.subject_name as string,
    department: (r.subject_department as string | null) ?? null,
    state: r.state as string,
    deadlineAt: (r.deadline_at as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
  }));
}

/**
 * One feedback request, for the form/confirmation screens. Combines the safe
 * metadata (peer_request_list) with the peer's OWN responses (peer_feedback,
 * single-author RLS). Returns null when this peer isn't assigned — absence at the
 * data layer, nothing crosses the wire.
 */
export async function getPeerFeedback(reviewId: string): Promise<PeerFeedbackView | null> {
  const supabase = await createRlsClient();
  const { data: meta } = await supabase
    .from("peer_request_list")
    .select("review_id, subject_name, subject_department, state, deadline_at, submitted_at")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!meta) return null;

  const { data: own } = await supabase
    .from("peer_feedback")
    .select("responses")
    .eq("review_id", reviewId)
    .maybeSingle();

  return {
    reviewId,
    subjectName: meta.subject_name as string,
    department: (meta.subject_department as string | null) ?? null,
    state: meta.state as string,
    deadlineAt: (meta.deadline_at as string | null) ?? null,
    submittedAt: (meta.submitted_at as string | null) ?? null,
    answers: sanitizeAnswers((own?.responses as PeerAnswers | null) ?? {}),
  };
}
