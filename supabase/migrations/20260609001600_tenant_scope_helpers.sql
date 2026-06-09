-- ============================================================================
-- 1600 — ADDITIVE (spine 000100–000400 FROZEN; re-creates two helpers in place,
-- preserving their grants). Closes the cross-tenant metadata oracles found by the
-- 1500 red-team (XT-1, XT-2):
--   effective_setting / effective_threshold and is_subject_withdrawn are
--   SECURITY DEFINER (row_security off), take an explicit id, and had NO tenant
--   check — so an authenticated user in company A could read company B's cycle
--   settings (numbers) and a subject's withdrawn boolean cross-tenant. Low
--   severity (operational metadata, never review content), but a breach of the
--   companyId isolation invariant.
--
-- The guard only bites when there IS an authenticated company context
-- (current_company_id() not null) AND the target cycle belongs to a different
-- company. Service-role / internal callers (the worker, and the SECURITY DEFINER
-- functions commit_lock / close_feedback / resolve_approver that call these) have
-- a NULL company context and pass unchanged; same-tenant authenticated reads pass;
-- and the RLS policies that call is_subject_withdrawn only ever do so for a row
-- already scoped to the caller's company, so they are unaffected. Re-probe after.
-- ============================================================================

create or replace function app.effective_setting(p_cycle uuid, p_key text) returns text
  language plpgsql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_caller_company uuid := app.current_company_id();
  v_cycle_company uuid;
begin
  if v_caller_company is not null then
    select company_id into v_cycle_company from cycles where id = p_cycle;
    if v_cycle_company is not null and v_cycle_company <> v_caller_company then
      raise exception 'ERR_CROSS_TENANT: cycle is not in the caller company' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(
    (select c.settings ->> p_key from cycles c where c.id = p_cycle),
    (select co.default_settings ->> p_key
       from cycles c join companies co on co.id = c.company_id
      where c.id = p_cycle)
  );
end
$$;

-- effective_threshold delegates to effective_setting, so it inherits the guard.

create or replace function app.is_subject_withdrawn(p_cycle uuid, p_account uuid) returns boolean
  language plpgsql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_caller_company uuid := app.current_company_id();
  v_cycle_company uuid;
begin
  -- a cross-tenant probe gets no signal (false), never an oracle on B's roster.
  if v_caller_company is not null then
    select company_id into v_cycle_company from cycles where id = p_cycle;
    if v_cycle_company is not null and v_cycle_company <> v_caller_company then
      return false;
    end if;
  end if;
  return exists (
    select 1 from roster_members rm
    where rm.cycle_id = p_cycle and rm.account_id = p_account and rm.withdrawn_at is not null
  );
end
$$;
