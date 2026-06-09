-- ============================================================================
-- 1500 — ADDITIVE (spine 000100–000400 FROZEN). Two findings from the cron-tail
-- adversarial review, both foundation-level:
--
-- AUTH-1/2/3 (CRITICAL, systemic): PostgreSQL grants EXECUTE to PUBLIC on every
--   CREATE FUNCTION by default. The migrations only ever `grant ... to service_role`
--   — an ADDITIVE grant that never removed the implicit PUBLIC grant — so the
--   `authenticated` role (it has `usage` on schema app) could call EVERY privileged
--   primitive directly: commit_lock, append_audit (forge audit entries),
--   worker_submitted_peer_responses (read raw peer feedback), purge_one_retention,
--   approve_nominations, withdraw_subject, etc. — several with no internal tenant
--   check, i.e. cross-tenant. The web/worker always invoke these via the SERVICE
--   role, never as an authenticated user, so revoking PUBLIC/authenticated breaks
--   no real path. REVOKE the implicit grant; service_role keeps it. The read /
--   identity helpers RLS depends on (current_account_id, has_role, is_approver_of,
--   effective_setting, is_subject_withdrawn, …) are intentionally left executable.
--
-- H1/H2 (revise-after-reveal): the revealed rating + draft narrative were mutable
--   while a review sat at 'awaiting-acknowledgement', so a post-reveal revise could
--   lock the employee into content they never saw. Freeze the revealed payload
--   until lock (the carry-forward invariant: a revision must RE-REVEAL, never slip
--   version B in behind an acknowledgement), and require a real narrative to reveal.
-- Re-probe after applying.
-- ============================================================================

-- Part A — privileged primitives are service_role ONLY. Strip the default PUBLIC
-- EXECUTE (and any anon/authenticated grant) from every mutating/privileged fn.
revoke execute on function
  app.consume_activation_token(bytea, uuid),
  app.commit_lock(uuid, public.ack_outcome),
  app.append_audit(uuid, public.audit_action, uuid, uuid, jsonb),
  app.worker_submitted_peer_responses(uuid, uuid),
  app.verify_audit_chain(uuid),
  app.approve_nominations(uuid, uuid, uuid),
  app.close_feedback(uuid),
  app.start_cycle_fanout(uuid, uuid),
  app.resolve_approver(uuid),
  app.reassign_approver(uuid, uuid, uuid),
  app.extend_deadline(uuid, text, timestamptz, uuid),
  app.withdraw_subject(uuid, uuid, uuid),
  app.close_one_ack_window(uuid),
  app.purge_one_retention(uuid)
from public, anon, authenticated;

-- Part B — freeze the revealed payload (rating + attached draft) between reveal and
-- lock, and require a non-empty narrative to enter reveal. Binds EVERY caller
-- (RLS-authenticated, service-role, or a future re-open path) at the row.
create or replace function app.reviews_reveal_freeze() returns trigger
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
begin
  -- entering reveal requires a real narrative — never lock the employee into '{}'.
  if new.status = 'awaiting-acknowledgement' and old.status is distinct from 'awaiting-acknowledgement' then
    if new.review_draft_id is null
       or coalesce((select sections from review_drafts where id = new.review_draft_id), '{}'::jsonb) = '{}'::jsonb then
      raise exception 'ERR_REVEAL_NO_NARRATIVE: cannot reveal a review with no narrative' using errcode = 'P0001';
    end if;
  end if;
  -- once revealed, the revealed payload is frozen until lock. A revision must
  -- RE-REVEAL (reset the ack window) via the deferred re-open path — it can never
  -- silently change content behind an acknowledgement. (commit_lock's transition to
  -- 'locked' changes neither rating nor draft, so it passes.)
  if old.status = 'awaiting-acknowledgement' and new.status = 'awaiting-acknowledgement'
     and (new.rating is distinct from old.rating or new.review_draft_id is distinct from old.review_draft_id) then
    raise exception 'ERR_REVEALED_FROZEN: revealed rating/narrative is frozen until lock; a revision must re-reveal'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;
-- Named to sort AFTER reviews_transition_guard so an ILLEGAL edge still reports
-- ERR_ILLEGAL_TRANSITION; the reveal/freeze checks apply to otherwise-valid edges.
create trigger reviews_zz_reveal_freeze before update on reviews
  for each row execute function app.reviews_reveal_freeze();

-- Part C — freeze the draft body once its review is revealed/locked (the narrative
-- the employee saw can't be edited out from under them). Edits during in-review /
-- flagged (pre-reveal) are unaffected.
create or replace function app.review_drafts_reveal_freeze() returns trigger
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
begin
  if new.sections is distinct from old.sections
     and exists (select 1 from reviews r
                 where r.id = new.review_id and r.status in ('awaiting-acknowledgement', 'locked')) then
    raise exception 'ERR_DRAFT_FROZEN: the draft is frozen once the review is revealed' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger review_drafts_reveal_freeze before update on review_drafts
  for each row execute function app.review_drafts_reveal_freeze();
