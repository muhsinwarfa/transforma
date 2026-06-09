-- ============================================================================
-- 1100 — ADDITIVE (spine 000100–000400 FROZEN; layers corrected SELECT policies
-- on top, like 000600/000900 did). The confidentiality control for PROC-06
-- withdraw: once a subject is withdrawn, their self-review and the peer feedback
-- ABOUT them are ARCHIVED at rest (rows retained for audit/retention) but have NO
-- read path — not for the subject, the author, or an admin.
--
-- The withdrawn check MUST go through a SECURITY DEFINER helper: a plain
-- `not exists (select from roster_members ...)` inside these policies is itself
-- evaluated under the QUERYING user's RLS, and roster_members is owner/admin-only —
-- so a peer (who can't see the subject's roster_members row) would get a vacuously
-- true `not exists` and the guard would never fire. The definer helper runs with
-- row_security off so the guard sees the withdrawal regardless of who is asking.
-- (The end-to-end thread caught this.) Re-probe after applying.
-- ============================================================================

create or replace function app.is_subject_withdrawn(p_cycle uuid, p_account uuid) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select exists (
    select 1 from roster_members rm
    where rm.cycle_id = p_cycle and rm.account_id = p_account and rm.withdrawn_at is not null
  )
$$;
grant execute on function app.is_subject_withdrawn(uuid, uuid) to authenticated, service_role;

drop policy self_reviews_select on self_reviews;
create policy self_reviews_select on self_reviews for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id() or app.has_role(company_id, 'admin'))
         and not app.is_subject_withdrawn(cycle_id, employee_id));

drop policy peer_feedback_author_select on peer_feedback;
create policy peer_feedback_author_select on peer_feedback for select to authenticated
  using (company_id = app.current_company_id()
         and peer_account_id = app.current_account_id()
         and not app.is_subject_withdrawn(cycle_id, employee_id));
