-- ============================================================================
-- 1000 — ADDITIVE (spine 000100–000400 FROZEN). PROC-MAIN eager fan-out +
-- PROC-04→05 approver resolution + PROC-06 admin actions. Every write is audited
-- and every admin function RE-ASSERTS the actor is an admin (service-role bypasses
-- RLS, so the function does not trust the caller). Re-probe after applying.
-- ============================================================================

-- PROC-MAIN eager fan-out: one review per ACTIVE subject in the cycle. Idempotent
-- on (cycle_id, employee_id) — re-running "start cycle" creates zero duplicates.
-- approver_id AND input_author_id are BOTH NULL (resolved later) — the exact
-- NULL/NULL case migration 000600 made the SoD CHECK tolerate.
create or replace function app.start_cycle_fanout(p_cycle uuid, p_actor uuid) returns int
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_company uuid;
  v_ids uuid[];
  v_id uuid;
begin
  select company_id into v_company from cycles where id = p_cycle;
  if v_company is null then
    raise exception 'ERR_CYCLE_NOT_FOUND: no such cycle' using errcode = 'P0001';
  end if;
  if not exists (select 1 from account_roles ar
                 where ar.account_id = p_actor and ar.role = 'admin' and ar.company_id = v_company) then
    raise exception 'ERR_FORBIDDEN: actor is not an admin' using errcode = 'P0001';
  end if;

  with ins as (
    insert into reviews (company_id, cycle_id, employee_id, status)
    select v_company, p_cycle, rm.account_id, 'draft'
    from roster_members rm
    where rm.cycle_id = p_cycle
      and rm.account_id is not null
      and rm.withdrawn_at is null
      and 'subject' = any (rm.structural_roles)
    on conflict (cycle_id, employee_id) do nothing
    returning id
  )
  select array_agg(id) into v_ids from ins;

  if v_ids is null then return 0; end if;
  foreach v_id in array v_ids loop
    perform app.append_audit(v_company, 'review_created', p_actor, v_id, '{}'::jsonb);
  end loop;
  return array_length(v_ids, 1);
end
$$;
grant execute on function app.start_cycle_fanout(uuid, uuid) to service_role;

-- PROC-04→05 approver resolution: when a draft is ready, assign the subject's
-- manager as approver IF they pass SoD (not the subject, not a contributor); if
-- there's no eligible approver, move to blocked_sod (non-terminal; surfaced to
-- admin to reassign). Re-runnable; a no-op once an approver is set.
create or replace function app.resolve_approver(p_review_id uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_review record;
  v_manager uuid;
begin
  select id, company_id, cycle_id, employee_id, approver_id, status into v_review
  from reviews where id = p_review_id for update;
  if not found then return 'skipped'; end if;
  if v_review.approver_id is not null then return 'already'; end if;
  if v_review.status not in ('in-review', 'flagged') then return 'skipped'; end if;

  select rm.manager_account_id into v_manager
  from roster_members rm
  where rm.cycle_id = v_review.cycle_id and rm.account_id = v_review.employee_id;

  if v_manager is not null and app.is_eligible_approver(p_review_id, v_manager) then
    update reviews set approver_id = v_manager where id = p_review_id;
    perform app.append_audit(v_review.company_id, 'approver_resolved', null, p_review_id,
      jsonb_build_object('approverId', v_manager));
    return 'resolved';
  end if;

  update reviews set status = 'blocked_sod' where id = p_review_id and status in ('in-review', 'flagged');
  perform app.append_audit(v_review.company_id, 'finalize_blocked_sod', null, p_review_id, '{}'::jsonb);
  return 'blocked_sod';
end
$$;
grant execute on function app.resolve_approver(uuid) to service_role;

-- PROC-06 (a) reassign approver — admin-only, RE-PASSES SoD (rule 1). A locked
-- review is immutable. A blocked_sod review with a now-eligible approver re-enters.
create or replace function app.reassign_approver(p_review_id uuid, p_new_approver uuid, p_actor uuid) returns void
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare v_review record;
begin
  select id, company_id, status into v_review from reviews where id = p_review_id for update;
  if not found then raise exception 'ERR_REVIEW_NOT_FOUND' using errcode = 'P0001'; end if;
  if not exists (select 1 from account_roles ar
                 where ar.account_id = p_actor and ar.role = 'admin' and ar.company_id = v_review.company_id) then
    raise exception 'ERR_FORBIDDEN: actor is not an admin' using errcode = 'P0001';
  end if;
  if v_review.status = 'locked' then
    raise exception 'ERR_REVIEW_LOCKED: locked reviews are immutable' using errcode = 'P0001';
  end if;
  if not app.is_eligible_approver(p_review_id, p_new_approver) then
    raise exception 'ERR_SOD_INELIGIBLE: new approver fails segregation of duties' using errcode = 'P0001';
  end if;
  update reviews set approver_id = p_new_approver where id = p_review_id;
  update reviews set status = 'in-review' where id = p_review_id and status = 'blocked_sod';
  perform app.append_audit(v_review.company_id, 'approver_reassigned', p_actor, p_review_id,
    jsonb_build_object('approverId', p_new_approver));
end
$$;
grant execute on function app.reassign_approver(uuid, uuid, uuid) to service_role;

-- PROC-06 (b) extend one subject's deadline (feedback or acknowledgement) — admin
-- only, audited, never on a locked review.
create or replace function app.extend_deadline(p_review_id uuid, p_kind text, p_new timestamptz, p_actor uuid) returns void
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare v_review record;
begin
  select id, company_id, status into v_review from reviews where id = p_review_id for update;
  if not found then raise exception 'ERR_REVIEW_NOT_FOUND' using errcode = 'P0001'; end if;
  if not exists (select 1 from account_roles ar
                 where ar.account_id = p_actor and ar.role = 'admin' and ar.company_id = v_review.company_id) then
    raise exception 'ERR_FORBIDDEN: actor is not an admin' using errcode = 'P0001';
  end if;
  if v_review.status = 'locked' then
    raise exception 'ERR_REVIEW_LOCKED: locked reviews are immutable' using errcode = 'P0001';
  end if;
  if p_kind = 'feedback' then
    update reviews set feedback_deadline_at = p_new where id = p_review_id;
  elsif p_kind = 'ack' then
    update reviews set ack_window_ends_at = p_new where id = p_review_id and status = 'awaiting-acknowledgement';
  else
    raise exception 'ERR_BAD_KIND: kind must be feedback or ack' using errcode = 'P0001';
  end if;
  perform app.append_audit(v_review.company_id, 'deadline_extended', p_actor, p_review_id,
    jsonb_build_object('kind', p_kind));
end
$$;
grant execute on function app.extend_deadline(uuid, text, timestamptz, uuid) to service_role;

-- PROC-06 (c) withdraw a departed subject — admin only. Marks the roster member
-- withdrawn (which closes the read path on their feedback via the 1100 RLS),
-- ABORTS any in-flight (pre-reveal) review + cancels its synthesis job, and audits.
-- Already-revealed (awaiting-acknowledgement) and locked reviews are RETAINED.
create or replace function app.withdraw_subject(p_cycle uuid, p_employee uuid, p_actor uuid) returns text
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_company uuid;
  v_review record;
begin
  select company_id into v_company from cycles where id = p_cycle;
  if v_company is null then raise exception 'ERR_CYCLE_NOT_FOUND' using errcode = 'P0001'; end if;
  if not exists (select 1 from account_roles ar
                 where ar.account_id = p_actor and ar.role = 'admin' and ar.company_id = v_company) then
    raise exception 'ERR_FORBIDDEN: actor is not an admin' using errcode = 'P0001';
  end if;

  update roster_members set withdrawn_at = now()
  where cycle_id = p_cycle and account_id = p_employee and withdrawn_at is null;

  select id, status into v_review from reviews
  where cycle_id = p_cycle and employee_id = p_employee for update;

  if found and v_review.status in ('draft', 'in-review', 'flagged', 'blocked_sod') then
    update reviews set status = 'aborted', aborted_reason = 'subject_withdrawn' where id = v_review.id;
    update synthesis_jobs set state = 'aborted', updated_at = now()
    where review_id = v_review.id and state in ('queued', 'running');
  end if;

  perform app.append_audit(v_company, 'subject_withdrawn', p_actor,
    case when found then v_review.id else null end, '{}'::jsonb);
  return 'withdrawn';
end
$$;
grant execute on function app.withdraw_subject(uuid, uuid, uuid) to service_role;
