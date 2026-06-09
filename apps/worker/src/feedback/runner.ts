import { q } from "../db.js";

/**
 * PROC-03 feedback-close. The compile + floor + window-close + status transition
 * + synthesis enqueue + audit all run atomically inside app.close_feedback (one
 * transaction, idempotent on the bundle's UNIQUE (cycle_id, employee_id) and the
 * synthesis_job's UNIQUE idempotency_key). The worker just selects what's due and
 * invokes it; the floor decision and confidentiality CHECKs live at the DB.
 */
export async function closeFeedbackForReview(reviewId: string): Promise<string> {
  const { rows } = await q<{ outcome: string }>("select app.close_feedback($1) as outcome", [reviewId]);
  return rows[0]?.outcome ?? "skipped";
}

/** Reviews whose feedback window has elapsed and have not yet been compiled. */
export async function selectDueReviews(): Promise<string[]> {
  const { rows } = await q<{ id: string }>(
    `select r.id from reviews r
      where r.status in ('draft','in-review')
        and r.feedback_deadline_at is not null
        and r.feedback_deadline_at <= now()
        and not exists (
          select 1 from feedback_bundles fb
          where fb.cycle_id = r.cycle_id and fb.employee_id = r.employee_id
        )
      order by r.feedback_deadline_at`,
  );
  return rows.map((row) => row.id);
}

/**
 * The cron body: close every due review. At-least-once safe — re-running over
 * the same state compiles nothing twice (app.close_feedback returns 'skipped'
 * once a bundle exists). Each review carries its own company_id; close_feedback
 * scopes every write by it. Quorum-early-close is not wired (no quorum setting in
 * the schema); deadline is the close trigger.
 */
export async function runFeedbackClose(): Promise<{ compiled: number; belowFloor: number }> {
  const due = await selectDueReviews();
  let compiled = 0;
  let belowFloor = 0;
  for (const id of due) {
    const outcome = await closeFeedbackForReview(id);
    if (outcome === "compiled" || outcome === "below_floor") compiled++;
    if (outcome === "below_floor") belowFloor++;
  }
  return { compiled, belowFloor };
}
