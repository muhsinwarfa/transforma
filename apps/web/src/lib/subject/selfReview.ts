import "server-only";
import { createRlsClient } from "@/lib/supabase/server";

export const SELF_PROMPTS = [
  { id: "q1", q: "What are you proud of this cycle?", hint: "A project, a moment, or a habit you built." },
  { id: "q2", q: "Where did you grow?", hint: "A skill, a relationship, or a way of working." },
  { id: "q3", q: "What got in the way?", hint: "Be honest — this helps your review stay fair." },
  { id: "q4", q: "What do you want to focus on next?", hint: "One or two things, not ten." },
] as const;

export type SelfAnswers = Record<string, string>;

export interface SelfReviewData {
  reviewId: string;
  cycleId: string;
  answers: SelfAnswers;
  submitted: boolean;
}

export async function getSelfReview(): Promise<SelfReviewData | null> {
  const supabase = await createRlsClient();
  const { data: status } = await supabase
    .from("subject_review_status")
    .select("review_id, cycle_id")
    .maybeSingle();
  if (!status) return null;
  const { data: sr } = await supabase
    .from("self_reviews")
    .select("sections, state")
    .eq("cycle_id", status.cycle_id)
    .maybeSingle();
  return {
    reviewId: status.review_id as string,
    cycleId: status.cycle_id as string,
    answers: (sr?.sections as SelfAnswers) ?? {},
    submitted: sr?.state === "submitted",
  };
}
