import { q } from "../db.js";

/**
 * PROC-05 ack-window auto-lock. The window-close lock and the web acknowledge BOTH
 * funnel through app.commit_lock (the single committer) — so a simultaneous manual
 * acknowledge and window-close on the same review yield exactly one locked row and
 * one audit entry; the loser no-ops (CAS on 'awaiting-acknowledgement' + the
 * locked_reviews PK). Each due review is closed in its own transaction, so one bad
 * review can't block the rest.
 */
export async function selectExpiredAckWindows(): Promise<string[]> {
  const { rows } = await q<{ id: string }>(
    `select r.id from reviews r
      where r.status = 'awaiting-acknowledgement'
        and r.ack_window_ends_at is not null
        and r.ack_window_ends_at <= now()
        and not exists (select 1 from employee_responses er where er.review_id = r.id)
      order by r.ack_window_ends_at`,
  );
  return rows.map((row) => row.id);
}

export async function closeOneAckWindow(reviewId: string): Promise<string> {
  const { rows } = await q<{ outcome: string }>("select app.close_one_ack_window($1) as outcome", [reviewId]);
  return rows[0]?.outcome ?? "skipped";
}

export async function runAckWindowAutoLock(): Promise<{ locked: number }> {
  const due = await selectExpiredAckWindows();
  let locked = 0;
  for (const id of due) {
    try {
      if ((await closeOneAckWindow(id)) === "locked") locked++;
    } catch {
      /* leave for the next sweep — the window stays expired until it locks */
    }
  }
  return { locked };
}
