-- ============================================================================
-- 1400 — ADDITIVE (spine 000100–000400 FROZEN). The two scheduled tails:
--   PROC-05 ack-window auto-lock — a revealed review whose acknowledgement window
--     elapses with no subject action locks via the SAME single committer
--     (app.commit_lock) as the manual acknowledge path. The window-close is a LOCK
--     OUTCOME, not a content change: it records 'window_closed' and locks the
--     revealed version unchanged.
--   Retention sweep — once a locked review's retention window elapses, ONLY the raw
--     source bodies are purged; the locked snapshot and the audit chain (the
--     permanent record) are NEVER touched.
-- Single-item functions: the worker SELECTs what's due and loops one call per item
-- (per-item transaction, so one bad item can't block the batch); a probe calls the
-- function directly. Both are idempotent + re-runnable. Re-probe after applying.
-- ============================================================================

-- PROC-05 ack-window auto-lock (ONE review). Funnels through app.commit_lock, so
-- the CAS on 'awaiting-acknowledgement' + the locked_reviews PK make a manual-ack /
-- window-close race resolve to exactly one locked row — the loser no-ops.
create or replace function app.close_one_ack_window(p_review_id uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_review record;
  v_reason ack_outcome;
begin
  select id, company_id, employee_id, status, ack_window_ends_at into v_review
  from reviews where id = p_review_id for update;
  if not found then return 'skipped'; end if;
  -- idempotent / race-safe: only an OPEN window past its deadline closes here.
  if v_review.status <> 'awaiting-acknowledgement' then return 'skipped'; end if;
  if v_review.ack_window_ends_at is null or v_review.ack_window_ends_at > now() then return 'skipped'; end if;

  -- A real subject response that committed before our row lock WINS the recorded
  -- outcome (audit fidelity): only genuine silence is recorded as window_closed,
  -- so locked_reviews.lock_reason always equals the surviving response outcome.
  select outcome into v_reason from employee_responses where review_id = p_review_id;
  if v_reason is null then
    insert into employee_responses (company_id, review_id, employee_id, outcome)
      values (v_review.company_id, p_review_id, v_review.employee_id, 'window_closed')
    on conflict (review_id) do nothing;
    select coalesce((select outcome from employee_responses where review_id = p_review_id), 'window_closed')
      into v_reason;
  end if;

  -- lock via the ONE committer (snapshots the revealed narrative+rating UNCHANGED,
  -- writes the hash-chained review_locked audit, schedules retention).
  perform app.commit_lock(p_review_id, v_reason);
  return 'locked';
end
$$;
grant execute on function app.close_one_ack_window(uuid) to service_role;

-- Retention sweep (ONE review). Purges/redacts ONLY the raw source bodies; the
-- locked_reviews snapshot + the audit_log chain are the permanent record and are
-- NEVER touched. Idempotent: a purged job is skipped; redacting empty is a no-op.
create or replace function app.purge_one_retention(p_review_id uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare v_job record;
begin
  select review_id, company_id, purge_after, state into v_job
  from retention_jobs where review_id = p_review_id for update;
  if not found then return 'skipped'; end if;
  if v_job.state = 'purged' then return 'already'; end if;
  if v_job.purge_after > now() then return 'not_due'; end if;

  -- ONLY source bodies. NEVER locked_reviews content or audit_log.
  update self_reviews    set sections = '{}'::jsonb        where review_id = p_review_id;
  update peer_feedback   set responses = '{}'::jsonb       where review_id = p_review_id;
  update feedback_bundles set peer_theme_payload = null    where review_id = p_review_id;

  update retention_jobs set state = 'purged', updated_at = now() where review_id = p_review_id;
  perform app.append_audit(v_job.company_id, 'retention_purged', null, p_review_id, '{}'::jsonb);
  return 'purged';
end
$$;
grant execute on function app.purge_one_retention(uuid) to service_role;
