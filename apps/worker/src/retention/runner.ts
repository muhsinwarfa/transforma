import { q } from "../db.js";

/**
 * Retention sweep. Once a locked review's retention window elapses, purge ONLY the
 * raw source bodies (self_reviews, peer_feedback, feedback_bundles) — the locked
 * snapshot and the audit chain are the permanent record and are never touched.
 * Idempotent: a purged job is skipped, and redacting already-empty content is a
 * no-op. Each due job runs in its own transaction.
 */
export async function selectDuePurges(): Promise<string[]> {
  const { rows } = await q<{ review_id: string }>(
    `select review_id from retention_jobs
      where state = 'scheduled' and purge_after <= now()
      order by purge_after`,
  );
  return rows.map((row) => row.review_id);
}

export async function purgeOneRetention(reviewId: string): Promise<string> {
  const { rows } = await q<{ outcome: string }>("select app.purge_one_retention($1) as outcome", [reviewId]);
  return rows[0]?.outcome ?? "skipped";
}

export async function runRetentionSweep(): Promise<{ purged: number }> {
  const due = await selectDuePurges();
  let purged = 0;
  for (const id of due) {
    try {
      if ((await purgeOneRetention(id)) === "purged") purged++;
    } catch {
      /* leave for the next sweep — the job stays 'scheduled' until it purges */
    }
  }
  return { purged };
}
