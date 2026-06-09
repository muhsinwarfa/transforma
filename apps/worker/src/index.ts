import { assertAuditKeyConfigured } from "./audit/guard.js";
import { q } from "./db.js";
import { runFeedbackClose } from "./feedback/runner.js";
import { runAckWindowAutoLock } from "./locking/runner.js";
import { runRetentionSweep } from "./retention/runner.js";
import { synthesizeReview } from "./synthesis/runner.js";

const WORKER_ID = `worker-${process.pid}`;

/**
 * Claim ONE queued synthesis job (guarded compare-and-set + SKIP LOCKED) and run
 * it. Idempotent: exactly one job per review (idempotency_key = review_id UNIQUE);
 * a transient failure returns the job to `queued` for redelivery.
 */
export async function drainOneSynthesisJob(): Promise<boolean> {
  const { rows } = await q<{ review_id: string }>(
    `update synthesis_jobs set state = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
       where id = (
         select id from synthesis_jobs
          where state = 'queued' or (state = 'running' and locked_at < now() - interval '10 minutes')
          order by created_at
          limit 1
          for update skip locked
       )
     returning review_id`,
    [WORKER_ID],
  );
  const job = rows[0];
  if (!job) return false;

  try {
    const outcome = await synthesizeReview(job.review_id);
    const state = outcome === "aborted" ? "aborted" : outcome === "flagged" ? "flagged" : "done";
    await q("update synthesis_jobs set state = $2, updated_at = now() where review_id = $1", [job.review_id, state]);
  } catch (e) {
    // transient (429/5xx/connection) → back to queued for redelivery
    await q("update synthesis_jobs set state = 'queued', locked_by = null, last_error = $2 where review_id = $1", [
      job.review_id,
      e instanceof Error ? e.message : String(e),
    ]);
  }
  return true;
}

// ── Render Cron entrypoints (scaffolded — wired with their slices) ──────────
// feedback-deadline close (PROC-03), ack-window auto-lock (PROC-05 tail),
// retention sweep. Each is idempotent (guarded CAS) and advances Supabase state.
export async function feedbackDeadlineClose(): Promise<void> {
  // PROC-03: compile each due review's bundle (floor applied on real submitted
  // data), close its window, advance draft→in-review, and enqueue synthesis —
  // all atomic + idempotent inside app.close_feedback.
  await runFeedbackClose();
}
export async function ackWindowAutoLock(): Promise<void> {
  // PROC-05 tail: revealed reviews whose ack window elapsed with no subject action
  // lock via the same single committer (commit_lock) with the window_closed outcome.
  await runAckWindowAutoLock();
}
export async function retentionSweep(): Promise<void> {
  // purge raw source bodies past purge_after; the locked snapshot + audit chain
  // (the permanent record) are never touched.
  await runRetentionSweep();
}

async function loop(): Promise<void> {
  // event-driven drain with a short idle backoff; Render Cron also pings as a backstop
  for (;;) {
    const did = await drainOneSynthesisJob();
    if (!did) await new Promise((r) => setTimeout(r, 2000));
  }
}

if (process.env.NODE_ENV !== "test") {
  // Fail loud at boot: refuse to start unless the audit-chain key is configured in
  // Vault — never run flows that could write audit entries under an insecure key.
  assertAuditKeyConfigured()
    .then(() => loop())
    .catch((e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    });
}
