-- ============================================================================
-- 2026-06-11 — FIX: nomination_candidates rendered EMPTY for every subject.
--
-- 20260610002000 (decision #3, manager-as-peer exclusion) filtered candidates by
-- `rm.account_id <> r.approver_id`. But reviews.approver_id is NULL during the
-- NOMINATION phase (start_cycle_fanout creates reviews with approver_id NULL;
-- it's resolved later). In SQL `x <> NULL` is NULL — never TRUE — so EVERY
-- candidate row was filtered out: an empty pool for every subject (launch blocker).
--
-- Two corrections, columns unchanged (create-or-replace view is safe):
--   (1) Exclude the SUBJECT'S MANAGER via roster_members.manager_account_id (known
--       at nomination time) — the right field; reviews.approver_id isn't set yet.
--   (2) Use IS DISTINCT FROM so a NULL manager excludes NO ONE (never the whole
--       pool) — NULL-safe by construction.
-- ============================================================================
create or replace view nomination_candidates
  with (security_invoker = false) as
select rm.cycle_id,
       rm.account_id as candidate_account_id,
       rm.display_name,
       rm.department
from roster_members rm
join reviews r on r.cycle_id = rm.cycle_id and r.employee_id = app.current_account_id()
join roster_members me on me.cycle_id = rm.cycle_id and me.account_id = app.current_account_id()
where rm.account_id is not null
  and rm.account_id <> app.current_account_id()
  and rm.account_id is distinct from me.manager_account_id   -- decision #3: exclude the subject's manager (NULL-safe)
  and rm.withdrawn_at is null
  and rm.company_id = app.current_company_id();
grant select on nomination_candidates to authenticated;
