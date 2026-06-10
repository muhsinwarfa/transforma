-- ============================================================================
-- 2000 — ADDITIVE self/assignment exclusions (spine 000100–000400 FROZEN; this is
-- create-or-replace only — no schema, no RLS policy, no new write path).
--
-- (1) Decision #1 — admin_review_list never lists the CALLER'S OWN review. A
--     People-Ops admin who is also a Team Member reads their own review as the
--     subject does (post-reveal), not through the sealed-record reader. One-line
--     filter on the already-audited, capability-gated list function; the audited
--     content read (admin_read_review) and its gates are unchanged.
--     NOTE (flagged): the by-id read app.admin_read_review(own_id) is NOT self-
--     blocked — it stays readable+audited; only the LIST surface hides own. A
--     matching one-line guard can close that path if desired.
--
-- (2) Decision #3 — a subject's ASSIGNED APPROVER never appears in their peer
--     candidate list (they already have the manager feedback channel). Placed in
--     the owner-run nomination_candidates VIEW (not the app) because the subject
--     cannot read reviews.approver_id at the app layer under RLS — the view already
--     joins the subject's own review, so r.approver_id is in scope here. One-line
--     filter; columns unchanged (create or replace view is safe).
-- ============================================================================

-- (1) admin_review_list — exclude the caller's own review.
create or replace function app.admin_review_list() returns table(
  review_id uuid,
  subject_name text,
  department text,
  status review_status,
  flagged_internal boolean
)
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select r.id, emp.display_name, rm.department, r.status, r.flagged_internal
  from reviews r
  join accounts emp on emp.id = r.employee_id
  left join roster_members rm on rm.cycle_id = r.cycle_id and rm.account_id = r.employee_id
  where r.company_id = app.current_company_id()
    and r.status <> 'aborted'
    and r.employee_id <> app.current_account_id()   -- decision #1: never the caller's own review
    and app.can_read_review_content(r.company_id)
  order by emp.display_name;
$$;
revoke all on function app.admin_review_list() from public, anon;
grant execute on function app.admin_review_list() to authenticated;

-- (2) nomination_candidates — exclude the subject's assigned approver.
create or replace view nomination_candidates
  with (security_invoker = false) as
select rm.cycle_id,
       rm.account_id as candidate_account_id,
       rm.display_name,
       rm.department
from roster_members rm
join reviews r on r.cycle_id = rm.cycle_id and r.employee_id = app.current_account_id()
where rm.account_id is not null
  and rm.account_id <> app.current_account_id()
  and rm.account_id <> r.approver_id            -- decision #3: exclude the assigned approver
  and rm.withdrawn_at is null
  and rm.company_id = app.current_company_id();
grant select on nomination_candidates to authenticated;
