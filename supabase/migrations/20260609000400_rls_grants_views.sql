-- ============================================================================
-- Transforma — 0400: the one security migration (RLS + policies + grants + views)
--
-- RLS is ENABLED (not FORCEd) so the table owner / SECURITY DEFINER helpers and
-- the seed run cleanly; the immutability guarantee that FORCE was meant to add is
-- provided instead by the BEFORE UPDATE/DELETE triggers + REVOKE grants (0300 +
-- below), which bind EVERY caller including the BYPASSRLS service role — strictly
-- stronger than FORCE for the non-negotiable. RLS here is the human tenant +
-- confidentiality floor; default posture is deny (no policy ⇒ no access for the
-- `authenticated` role). The worker (service_role) bypasses RLS by design and is
-- fenced by the SECURITY DEFINER tenant re-assertion (app.worker_*).
-- ============================================================================

-- ── enable RLS everywhere ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'companies','accounts','account_roles','cycles','roster_members','activation_tokens',
    'nominations','rosters','roster_peers','self_reviews','peer_feedback','feedback_bundles',
    'review_drafts','reviews','review_contributors','audit_heads','audit_log',
    'locked_reviews','employee_responses','synthesis_jobs','retention_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── base grants for the authenticated role (RLS narrows from here) ──────────
grant usage on schema app to authenticated, anon, service_role;
grant select on
  companies, accounts, account_roles, cycles, roster_members,
  nominations, rosters, roster_peers, self_reviews, peer_feedback,
  review_drafts, reviews, review_contributors, audit_log,
  locked_reviews, employee_responses
to authenticated;
grant insert, update on
  nominations, self_reviews, peer_feedback, review_drafts, reviews, employee_responses
to authenticated;
grant update on companies, accounts, cycles, roster_members to authenticated;

-- append-only tables: no UPDATE/DELETE for anyone (trigger is the floor too)
revoke update, delete on locked_reviews, audit_log, employee_responses
  from public, anon, authenticated, service_role;

-- ── companies ───────────────────────────────────────────────────────────────
create policy companies_select on companies for select to authenticated
  using (id = app.current_company_id());
create policy companies_update on companies for update to authenticated
  using (id = app.current_company_id() and app.has_role(id, 'admin'))
  with check (id = app.current_company_id() and app.has_role(id, 'admin'));

-- ── accounts ────────────────────────────────────────────────────────────────
create policy accounts_select on accounts for select to authenticated
  using (company_id = app.current_company_id()
         and (id = app.current_account_id()
              or app.has_role(company_id, 'admin')
              or app.has_role(company_id, 'approver')));
create policy accounts_update on accounts for update to authenticated
  using (company_id = app.current_company_id()
         and (id = app.current_account_id() or app.has_role(company_id, 'admin')))
  with check (company_id = app.current_company_id());

-- ── account_roles ────────────────────────────────────────────────────────────
create policy account_roles_select on account_roles for select to authenticated
  using (account_id = app.current_account_id() or app.has_role(company_id, 'admin'));

-- ── cycles ────────────────────────────────────────────────────────────────────
create policy cycles_select on cycles for select to authenticated
  using (company_id = app.current_company_id());
create policy cycles_admin_write on cycles for all to authenticated
  using (company_id = app.current_company_id() and app.has_role(company_id, 'admin'))
  with check (company_id = app.current_company_id() and app.has_role(company_id, 'admin'));

-- ── roster_members ────────────────────────────────────────────────────────────
create policy roster_members_select on roster_members for select to authenticated
  using (company_id = app.current_company_id()
         and (app.has_role(company_id, 'admin') or account_id = app.current_account_id()));
create policy roster_members_admin_write on roster_members for all to authenticated
  using (company_id = app.current_company_id() and app.has_role(company_id, 'admin'))
  with check (company_id = app.current_company_id() and app.has_role(company_id, 'admin'));

-- ── activation_tokens — NO authenticated/anon policy (deny). service-role only. ─

-- ── nominations (PROC-02) ─────────────────────────────────────────────────────
create policy nominations_select on nominations for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or app.is_approver_of(employee_id, cycle_id)
              or app.has_role(company_id, 'admin')));
create policy nominations_subject_insert on nominations for insert to authenticated
  with check (company_id = app.current_company_id() and employee_id = app.current_account_id());
create policy nominations_write on nominations for update to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or app.is_approver_of(employee_id, cycle_id)
              or app.has_role(company_id, 'admin')));

-- ── rosters + roster_peers (peer CANNOT enumerate co-peers) ─────────────────────
create policy rosters_select on rosters for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or app.is_approver_of(employee_id, cycle_id)
              or app.has_role(company_id, 'admin')));
create policy roster_peers_select on roster_peers for select to authenticated
  using (exists (select 1 from rosters r
                 where r.id = roster_peers.roster_id
                   and (r.employee_id = app.current_account_id()
                        or app.is_approver_of(r.employee_id, r.cycle_id)
                        or app.has_role(r.company_id, 'admin'))));

-- ── self_reviews (subject + admin only; peer never; approver sees the draft) ──
create policy self_reviews_select on self_reviews for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id() or app.has_role(company_id, 'admin')));
create policy self_reviews_subject_write on self_reviews for insert to authenticated
  with check (company_id = app.current_company_id() and employee_id = app.current_account_id());
create policy self_reviews_subject_update on self_reviews for update to authenticated
  using (company_id = app.current_company_id() and employee_id = app.current_account_id()
         and state <> 'submitted');

-- ── peer_feedback — THE confidentiality guarantee: single author-only grant ──
create policy peer_feedback_author_select on peer_feedback for select to authenticated
  using (company_id = app.current_company_id() and peer_account_id = app.current_account_id());
create policy peer_feedback_author_insert on peer_feedback for insert to authenticated
  with check (company_id = app.current_company_id() and peer_account_id = app.current_account_id());
create policy peer_feedback_author_update on peer_feedback for update to authenticated
  using (company_id = app.current_company_id() and peer_account_id = app.current_account_id()
         and state in ('new', 'draft'));

-- ── feedback_bundles — NO authenticated policy (deny). counts reach the
--    approver/admin only through the scoped views below. service-role writes. ──

-- ── review_drafts — eligible approver + admin; subject has NO grant ──────────
create policy review_drafts_select on review_drafts for select to authenticated
  using (company_id = app.current_company_id()
         and (app.is_approver_of(employee_id, cycle_id) or app.has_role(company_id, 'admin')));
create policy review_drafts_approver_update on review_drafts for update to authenticated
  using (company_id = app.current_company_id() and app.is_approver_of(employee_id, cycle_id));

-- ── reviews — approver (eligible) + admin direct; SUBJECT reads via views only ─
-- (subject has NO direct grant ⇒ cannot read flagged_internal/flag_reason/rating
--  pre-reveal; non-negotiable #3 is structural.)
create policy reviews_select on reviews for select to authenticated
  using (company_id = app.current_company_id()
         and ((approver_id = app.current_account_id() and status <> 'aborted')
              or app.has_role(company_id, 'admin')));
create policy reviews_approver_update on reviews for update to authenticated
  using (company_id = app.current_company_id()
         and approver_id = app.current_account_id() and status <> 'locked')
  with check (company_id = app.current_company_id());

-- ── review_contributors ──────────────────────────────────────────────────────
create policy review_contributors_select on review_contributors for select to authenticated
  using (company_id = app.current_company_id()
         and (app.has_role(company_id, 'admin')
              or exists (select 1 from reviews r
                         where r.id = review_contributors.review_id
                           and r.approver_id = app.current_account_id())));

-- ── audit_log — admin read; writes only via app.append_audit (definer) ──────
create policy audit_log_admin_select on audit_log for select to authenticated
  using (app.has_role(company_id, 'admin'));

-- ── locked_reviews — read-only to subject/approver/admin ────────────────────
create policy locked_reviews_select on locked_reviews for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or approver_id = app.current_account_id()
              or app.has_role(company_id, 'admin')));

-- ── employee_responses — beside the review; subject inserts, all read ───────
create policy employee_responses_select on employee_responses for select to authenticated
  using (company_id = app.current_company_id()
         and (employee_id = app.current_account_id()
              or app.has_role(company_id, 'admin')
              or exists (select 1 from reviews r
                         where r.id = employee_responses.review_id
                           and r.approver_id = app.current_account_id())));
create policy employee_responses_subject_insert on employee_responses for insert to authenticated
  with check (company_id = app.current_company_id() and employee_id = app.current_account_id());

-- audit_heads / synthesis_jobs / retention_jobs: no authenticated policy (deny).

-- ── EXECUTE grants on app functions ─────────────────────────────────────────
-- read/identity helpers (used in policies + by handlers):
grant execute on function
  app.current_account_id(), app.current_company_id(),
  app.has_role(uuid, app_role), app.is_manager_of(uuid, uuid),
  app.is_approver_of(uuid, uuid), app.is_eligible_approver(uuid, uuid),
  app.effective_setting(uuid, text), app.effective_threshold(uuid),
  app.is_legal_transition(review_status, review_status)
to authenticated, anon, service_role;

-- privileged primitives — service role ONLY (narrow, audited server paths):
grant execute on function
  app.consume_activation_token(bytea, uuid),
  app.commit_lock(uuid, ack_outcome),
  app.append_audit(uuid, audit_action, uuid, uuid, jsonb),
  app.worker_submitted_peer_responses(uuid, uuid),
  app.verify_audit_chain(uuid)
to service_role;

-- ── scoped views (regular views; owner-run; each enforces its own scoping) ──

-- subject status channel: status-only, flagged/blocked/draft/in-review → "in-review"
create view subject_review_status
  with (security_invoker = false) as
select r.id as review_id, r.cycle_id, r.employee_id,
  case
    when r.status in ('draft','in-review','flagged','blocked_sod','aborted') then 'in-review'
    when r.status = 'awaiting-acknowledgement' then 'awaiting-acknowledgement'
    when r.status = 'locked' then 'locked'
    else 'in-review'
  end as display_status,
  r.revealed_at, r.ack_window_ends_at
from reviews r
where r.employee_id = app.current_account_id();

-- reveal-gated finished review: zero rows before reveal; content only at/after
create view revealed_review
  with (security_invoker = false) as
select r.id as review_id, r.employee_id, r.status, r.rating,
  case when r.status = 'locked' then lr.narrative else rd.sections end as narrative,
  r.revealed_at, r.ack_window_ends_at, r.locked_at
from reviews r
left join review_drafts rd on rd.id = r.review_draft_id
left join locked_reviews lr on lr.review_id = r.id
where r.employee_id = app.current_account_id()
  and r.status in ('awaiting-acknowledgement', 'locked');

-- approver queue: SoD-ineligible reviews absent; below floor exposes NO count
create view approver_queue
  with (security_invoker = false) as
select r.id as review_id, r.cycle_id, r.employee_id,
  emp.display_name as subject_name, rm.department as subject_department,
  r.status, r.flagged_internal, r.review_draft_id,
  coalesce(fb.below_floor, false) as below_floor,
  -- non-quantifying below the floor: the exact count is exposed ONLY at/above floor
  case when fb.at_or_above_floor then fb.submitted_peer_count else null end as peer_count
from reviews r
join accounts emp on emp.id = r.employee_id
left join roster_members rm on rm.cycle_id = r.cycle_id and rm.account_id = r.employee_id
left join feedback_bundles fb on fb.review_id = r.id
where r.approver_id = app.current_account_id()
  and r.status <> 'aborted'
  and app.is_eligible_approver(r.id, app.current_account_id());

-- admin cycle monitor: aggregate status counts ONLY (no bodies)
create view cycle_monitor
  with (security_invoker = false) as
select r.company_id, r.cycle_id, r.status, count(*)::int as n
from reviews r
where r.company_id = app.current_company_id() and app.has_role(r.company_id, 'admin')
group by r.company_id, r.cycle_id, r.status;

-- nomination sets: per-subject approval state for the manager queue
create view nomination_sets
  with (security_invoker = false) as
select n.company_id, n.cycle_id, n.employee_id,
  emp.display_name as subject_name,
  min(n.status::text) as set_status,
  count(*)::int as nominee_count
from nominations n
join accounts emp on emp.id = n.employee_id
where n.company_id = app.current_company_id()
  and (app.is_approver_of(n.employee_id, n.cycle_id) or app.has_role(n.company_id, 'admin'))
group by n.company_id, n.cycle_id, n.employee_id, emp.display_name;

grant select on
  subject_review_status, revealed_review, approver_queue, cycle_monitor, nomination_sets
to authenticated;
