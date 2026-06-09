-- ============================================================================
-- Transforma — 0500: PROC-02 nomination support (ADDITIVE; the frozen 0100–0400
-- spine is not modified). Adds (a) a subject-scoped candidate list so a subject
-- can nominate without reading the whole roster, and (b) the approved-edit guard
-- so an approved roster cannot be silently re-edited on the subject write path.
-- ============================================================================

-- (a) Candidate population for the CURRENT subject's cycle — names + department
-- only, excluding self and withdrawn members. Scoped to the subject's own review's
-- cycle; a peer/other subject cannot use it to enumerate someone else's candidates.
create view nomination_candidates
  with (security_invoker = false) as
select rm.cycle_id,
       rm.account_id as candidate_account_id,
       rm.display_name,
       rm.department
from roster_members rm
join reviews r on r.cycle_id = rm.cycle_id and r.employee_id = app.current_account_id()
where rm.account_id is not null
  and rm.account_id <> app.current_account_id()
  and rm.withdrawn_at is null
  and rm.company_id = app.current_company_id();

grant select on nomination_candidates to authenticated;

-- (b) Approved-edit guard. Once a roster (the approved peer set => rosterId) exists
-- for the subject, the subject may no longer insert / update / delete nominations.
-- Replace the broad subject write policy from 0400 with guarded ones; keep an
-- explicit approver/admin update path.
drop policy if exists nominations_subject_insert on nominations;
drop policy if exists nominations_write on nominations;

grant delete on nominations to authenticated;  -- subject replaces the set pre-approval

create policy nominations_subject_insert on nominations for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and employee_id = app.current_account_id()
    and not exists (
      select 1 from rosters ro
      where ro.cycle_id = nominations.cycle_id and ro.employee_id = nominations.employee_id
    )
  );

create policy nominations_subject_update on nominations for update to authenticated
  using (
    company_id = app.current_company_id()
    and employee_id = app.current_account_id()
    and not exists (
      select 1 from rosters ro
      where ro.cycle_id = nominations.cycle_id and ro.employee_id = nominations.employee_id
    )
  );

create policy nominations_subject_delete on nominations for delete to authenticated
  using (
    company_id = app.current_company_id()
    and employee_id = app.current_account_id()
    and not exists (
      select 1 from rosters ro
      where ro.cycle_id = nominations.cycle_id and ro.employee_id = nominations.employee_id
    )
  );

create policy nominations_approver_update on nominations for update to authenticated
  using (
    company_id = app.current_company_id()
    and (app.is_approver_of(employee_id, cycle_id) or app.has_role(company_id, 'admin'))
  );

-- PROC-03 self-review submit (additive fix): the 0400 update policy had only a
-- USING clause, which PG also applies as WITH CHECK — that would block the legal
-- draft → submitted transition (new state is 'submitted'). Give it an explicit
-- WITH CHECK so a draft can be submitted, while USING still forbids editing a row
-- that is already submitted.
drop policy if exists self_reviews_subject_update on self_reviews;
create policy self_reviews_subject_update on self_reviews for update to authenticated
  using (
    company_id = app.current_company_id()
    and employee_id = app.current_account_id()
    and state <> 'submitted'
  )
  with check (company_id = app.current_company_id() and employee_id = app.current_account_id());

