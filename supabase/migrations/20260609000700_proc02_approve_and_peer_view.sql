-- ============================================================================
-- 0700 — ADDITIVE (spine 000100–000400 stays FROZEN). PROC-02 approval write
-- path + PROC-03 peer request-list read path. Re-probe after applying.
--
-- Why a SECURITY DEFINER function for approval: the authenticated role has NO
-- INSERT grant on rosters/roster_peers (deny-by-default, by design — roster
-- creation is a privileged, audited path). Approving a peer set is a multi-table
-- write (rosters + roster_peers + reviews.roster_id + peer_feedback seeds +
-- nominations.status) that MUST be atomic — two separate clients can't guarantee
-- that. One definer function gives one transaction. Because the definer bypasses
-- RLS, it RE-ASSERTS the actor's authority (assigned approver OR resolved
-- manager) before writing — it does not trust the caller.
-- ============================================================================

create or replace function app.approve_nominations(p_cycle uuid, p_employee uuid, p_actor uuid)
  returns uuid
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_company uuid;
  v_review uuid;
  v_roster uuid;
  v_deadline_days int;
  v_deadline timestamptz;
begin
  -- Resolve the subject's review (1:1 with cycle+employee); gives company + the
  -- review the roster attaches to.
  select r.id, r.company_id into v_review, v_company
  from reviews r where r.cycle_id = p_cycle and r.employee_id = p_employee;
  if v_review is null then
    raise exception 'ERR_REVIEW_NOT_FOUND: no review for this subject in this cycle' using errcode = 'P0001';
  end if;

  -- Fail closed: the actor must be the assigned approver OR the resolved manager
  -- for this subject+cycle. (Mirrors app.is_approver_of, but parameterized by the
  -- explicit actor since the definer runs with no JWT identity.)
  if not exists (
        select 1 from reviews r
        where r.cycle_id = p_cycle and r.employee_id = p_employee and r.approver_id = p_actor)
     and not exists (
        select 1 from roster_members rm
        where rm.cycle_id = p_cycle and rm.account_id = p_employee and rm.manager_account_id = p_actor) then
    raise exception 'ERR_FORBIDDEN: actor is not the approver/manager for this subject' using errcode = 'P0001';
  end if;

  if not exists (select 1 from nominations n where n.cycle_id = p_cycle and n.employee_id = p_employee) then
    raise exception 'ERR_NO_NOMINEES: there is nothing to approve' using errcode = 'P0001';
  end if;

  -- Create (or idempotently re-affirm) the approved roster => rosterId.
  insert into rosters (company_id, cycle_id, employee_id, approved_by, approved_at)
    values (v_company, p_cycle, p_employee, p_actor, now())
  on conflict (cycle_id, employee_id)
    do update set approved_by = excluded.approved_by, approved_at = now()
  returning id into v_roster;

  -- Record the nominated peers as roster peers (idempotent). The subject is never
  -- their own peer — the 0900 nominee_not_self CHECK blocks self-nomination at the
  -- table, and this <> p_employee guard keeps the seed correct even against a
  -- pre-existing self row (red-team H1: a subject must never seed their own
  -- self-authored words into the anonymity count).
  insert into roster_peers (company_id, roster_id, peer_account_id)
  select v_company, v_roster, n.nominee_account_id
  from nominations n
  where n.cycle_id = p_cycle and n.employee_id = p_employee and n.nominee_account_id <> p_employee
  on conflict (roster_id, peer_account_id) do nothing;

  -- Attach the roster to the review.
  update reviews set roster_id = v_roster where id = v_review;

  -- Open the feedback window: company default (overridable per cycle), default 14d.
  v_deadline_days := coalesce(app.effective_setting(p_cycle, 'feedbackDeadlineDays')::int, 14);
  v_deadline := now() + make_interval(days => v_deadline_days);
  update reviews set feedback_deadline_at = v_deadline where id = v_review and feedback_deadline_at is null;

  -- Seed one single-author peer_feedback request (state 'new') per approved peer,
  -- so each nominee has a private row to fill. Idempotent. self + peer are
  -- collected IN PARALLEL — this does not gate on the self-review.
  insert into peer_feedback (company_id, cycle_id, employee_id, review_id, roster_id, peer_account_id, state, deadline_at)
  select v_company, p_cycle, p_employee, v_review, v_roster, rp.peer_account_id, 'new', v_deadline
  from roster_peers rp
  where rp.roster_id = v_roster
  on conflict (cycle_id, employee_id, peer_account_id) do nothing;

  -- Flip the WHOLE nomination set uniformly to 'approved' — keeps
  -- nomination_sets.set_status (min over status) correct and engages the
  -- subject's approved-edit lock (which keys on a rosters row existing).
  update nominations set status = 'approved' where cycle_id = p_cycle and employee_id = p_employee;

  perform app.append_audit(v_company, 'nomination_approved', p_actor, v_review,
    jsonb_build_object('rosterId', v_roster));

  return v_roster;
end
$$;

-- Privileged, audited path — service role only (mirrors consume_activation_token,
-- commit_lock, append_audit). The approver's web action calls this via the
-- service-role client AFTER requireRole('approver'); the function re-asserts
-- authority itself, so a stray call still fails closed.
grant execute on function app.approve_nominations(uuid, uuid, uuid) to service_role;

-- ── peer_request_list — the peer's ONLY read path to their assigned requests ──
-- A peer has no accounts grant for the subject, so it cannot render its request
-- list from peer_feedback alone. This owner-run view exposes EXACTLY the
-- subject's display name + department (which the peer inherently knows — they
-- were nominated to give feedback ON that person) plus the peer's OWN row
-- metadata. It exposes NO self-review, NO draft, NO rating/outcome, NO other
-- peer, and NO response content of anyone (the peer reads its own responses from
-- peer_feedback directly, under the single-author RLS). The WHERE clause scopes
-- every row to the calling peer.
create view peer_request_list with (security_invoker = false) as
select
  pf.review_id,
  pf.cycle_id,
  pf.employee_id,
  subj.display_name as subject_name,
  rm.department as subject_department,
  pf.state,
  pf.deadline_at,
  pf.submitted_at,
  pf.declined_at
from peer_feedback pf
join accounts subj on subj.id = pf.employee_id
left join roster_members rm on rm.cycle_id = pf.cycle_id and rm.account_id = pf.employee_id
where pf.company_id = app.current_company_id()
  and pf.peer_account_id = app.current_account_id();

grant select on peer_request_list to authenticated;
