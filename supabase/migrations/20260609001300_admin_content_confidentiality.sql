-- ============================================================================
-- 1300 — ADDITIVE (spine 000100–000400 FROZEN; layers corrected SELECT policies
-- on top, like 000600/000900/001100/001200). Admin-confidentiality hardening from
-- the admin-slice adversarial review (ADM-1..4, WD-1).
--
-- The frozen spine granted the ADMIN role a direct base-table read of INDIVIDUAL
-- review content — self-review bodies, the synthesized draft narrative + internal
-- flag_reason/generated_by_model, each review's rating + flag status, the locked
-- narrative/rating, and the subject's written response. That contradicts the
-- contract's "Admin: cycle monitor — AGGREGATE ONLY" (contract-map.md) and the
-- design's "not reading individual reviews" (admin.jsx). Postgres RLS can't mask
-- individual columns, so we remove the admin disjunct entirely: admin oversight is
-- the aggregate, no-content `cycle_monitor` view (owner-run, so it still works)
-- plus the audit log — never the content tables. Each policy keeps its legitimate
-- non-admin reader(s). review_drafts also gains the withdrawn-subject archive guard
-- (WD-1: a withdrawn subject's draft is a derivative of their archived inputs and
-- must not remain readable). Re-probe after applying.
-- ============================================================================

-- self-review body — the SUBJECT alone (admin removed).
drop policy self_reviews_select on self_reviews;
create policy self_reviews_select on self_reviews for select to authenticated
  using (company_id = app.current_company_id()
         and employee_id = app.current_account_id()
         and not app.is_subject_withdrawn(cycle_id, employee_id));

-- draft narrative + internal fields — the ELIGIBLE APPROVER alone (admin removed),
-- and archived once the subject is withdrawn (WD-1).
drop policy review_drafts_select on review_drafts;
create policy review_drafts_select on review_drafts for select to authenticated
  using (company_id = app.current_company_id()
         and app.is_approver_of(employee_id, cycle_id)
         and not app.is_subject_withdrawn(cycle_id, employee_id));

-- review row (rating / flagged_internal / flag_reason) — the assigned APPROVER
-- alone (admin removed; the subject reads status via views, never this base table).
drop policy reviews_select on reviews;
create policy reviews_select on reviews for select to authenticated
  using (company_id = app.current_company_id()
         and approver_id = app.current_account_id() and status <> 'aborted');

-- locked narrative + final rating — SUBJECT + APPROVER (admin removed).
drop policy locked_reviews_select on locked_reviews;
create policy locked_reviews_select on locked_reviews for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id() or approver_id = app.current_account_id()));

-- the employee's written response beside the locked review — SUBJECT + that
-- review's APPROVER (admin removed).
drop policy employee_responses_select on employee_responses;
create policy employee_responses_select on employee_responses for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or exists (select 1 from reviews r
                         where r.id = employee_responses.review_id
                           and r.approver_id = app.current_account_id())));
