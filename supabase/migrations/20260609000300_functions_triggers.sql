-- ============================================================================
-- Transforma — 0300: enforcement functions + triggers (the controls)
--
-- `app.*` helpers are SECURITY DEFINER with a pinned search_path and
-- `row_security = off` so they may read identity/role tables without tripping
-- the RLS policies they support (no recursion). They run as the owner; callers
-- need only EXECUTE (granted in 0400).
--
-- Immutability (non-negotiable #2) and the tamper-evident audit chain are
-- enforced here by triggers + the single `commit_lock` writer — stronger than
-- RLS because triggers bind EVERY caller, including the service role.
-- ============================================================================

-- ── identity / role helpers (used inside RLS policies) ──────────────────────
-- v1 assumption: one auth user maps to exactly one account (accounts.auth_user_id
-- is unique). Multi-company-per-user would add a company claim; flagged for v2.

create or replace function app.current_account_id() returns uuid
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$ select id from accounts where auth_user_id = auth.uid() $$;

create or replace function app.current_company_id() returns uuid
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$ select company_id from accounts where auth_user_id = auth.uid() $$;

create or replace function app.has_role(p_company uuid, p_role app_role) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select exists (
    select 1 from account_roles ar
    join accounts a on a.id = ar.account_id
    where a.auth_user_id = auth.uid() and ar.company_id = p_company and ar.role = p_role
  )
$$;

create or replace function app.is_manager_of(p_employee uuid, p_cycle uuid) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select exists (
    select 1 from roster_members rm
    where rm.cycle_id = p_cycle and rm.account_id = p_employee
      and rm.manager_account_id = app.current_account_id()
  )
$$;

create or replace function app.is_approver_of(p_employee uuid, p_cycle uuid) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select exists (
    select 1 from reviews r
    where r.cycle_id = p_cycle and r.employee_id = p_employee
      and r.approver_id = app.current_account_id()
  ) or app.is_manager_of(p_employee, p_cycle)
$$;

-- SoD predicate (non-negotiable #1): eligible iff candidate is not the subject,
-- not the input author, and not in the plural contributor set.
create or replace function app.is_eligible_approver(p_review_id uuid, p_candidate uuid) returns boolean
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select p_candidate is not null
    and not exists (
      select 1 from reviews r
      where r.id = p_review_id
        and (p_candidate = r.employee_id or p_candidate = r.input_author_id)
    )
    and not exists (
      select 1 from review_contributors rc
      where rc.review_id = p_review_id and rc.contributor_account_id = p_candidate
    )
$$;

-- ── settings: company default overridable per cycle; threshold clamped ≥ 3 ──
create or replace function app.effective_setting(p_cycle uuid, p_key text) returns text
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
  select coalesce(
    (select c.settings ->> p_key from cycles c where c.id = p_cycle),
    (select co.default_settings ->> p_key
       from cycles c join companies co on co.id = c.company_id
      where c.id = p_cycle)
  )
$$;

create or replace function app.effective_threshold(p_cycle uuid) returns int
  language sql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$ select greatest(coalesce(app.effective_setting(p_cycle, 'peerAnonymityThreshold')::int, 3), 3) $$;

-- ── status lifecycle: legal edges ───────────────────────────────────────────
create or replace function app.is_legal_transition(p_from review_status, p_to review_status) returns boolean
  language sql immutable
as $$
  select case p_from
    when 'draft'                    then p_to in ('in-review','aborted')
    when 'in-review'                then p_to in ('flagged','awaiting-acknowledgement','aborted','blocked_sod')
    when 'flagged'                  then p_to in ('in-review','awaiting-acknowledgement','aborted','blocked_sod')
    when 'blocked_sod'              then p_to in ('in-review','flagged','aborted')
    when 'awaiting-acknowledgement' then p_to in ('locked')
    when 'locked'                   then false   -- terminal: no outbound edge
    when 'aborted'                  then false   -- terminal
    else false
  end
$$;

-- ── reviews transition guard: the DB backstop under the single TS fsm writer ─
create or replace function app.reviews_transition_guard() returns trigger
  language plpgsql
  set search_path = app, public, pg_temp
as $$
begin
  -- A locked review is immutable, spine included (no post-lock correction).
  if old.status = 'locked' then
    raise exception 'ERR_REVIEW_LOCKED: locked reviews are immutable' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if not app.is_legal_transition(old.status, new.status) then
      raise exception 'ERR_ILLEGAL_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    -- Only commit_lock may move a review to locked.
    if new.status = 'locked'
       and coalesce(current_setting('app.committing_lock', true), 'off') <> 'on' then
      raise exception 'ERR_LOCK_PATH: only commit_lock may lock a review' using errcode = 'P0001';
    end if;
    -- Reveal-before-lock has a timestamp: entering awaiting-acknowledgement
    -- requires the reveal + ack-window to be set.
    if new.status = 'awaiting-acknowledgement'
       and (new.revealed_at is null or new.ack_window_ends_at is null) then
      raise exception 'ERR_REVEAL_INCOMPLETE: reveal requires revealed_at and ack_window_ends_at'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger reviews_transition_guard
  before update on reviews
  for each row execute function app.reviews_transition_guard();

-- ── immutability guard for append-only tables ───────────────────────────────
create or replace function app.immutable_row_guard() returns trigger
  language plpgsql
as $$
begin
  raise exception 'ERR_IMMUTABLE: % rows are append-only (% rejected)', TG_TABLE_NAME, TG_OP
    using errcode = 'P0001';
end
$$;

create trigger locked_reviews_immutable
  before update or delete on locked_reviews
  for each row execute function app.immutable_row_guard();
create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function app.immutable_row_guard();
create trigger employee_responses_immutable
  before update or delete on employee_responses
  for each row execute function app.immutable_row_guard();

-- ── append-only, tamper-resistant audit chain (per-tenant, keyed HMAC) ──────
-- PRODUCTION: set the chain key once via `ALTER DATABASE <db> SET
-- app.audit_chain_key = '<secret>'`. The dev fallback below keeps migrations and
-- tests runnable but MUST be overridden in production.
create or replace function app.append_audit(
  p_company uuid, p_action audit_action, p_actor uuid, p_review uuid, p_target jsonb
) returns uuid
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_seq bigint;
  v_prev bytea;
  v_now timestamptz := now();
  v_key text := coalesce(current_setting('app.audit_chain_key', true), 'dev-insecure-audit-key-CHANGE-IN-PROD');
  v_canon text;
  v_hash bytea;
  v_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext(p_company::text));   -- total order, no gaps
  insert into audit_heads (company_id, last_seq, last_hash)
    values (p_company, 0, null) on conflict (company_id) do nothing;
  select last_seq, last_hash into v_seq, v_prev from audit_heads where company_id = p_company for update;
  v_seq := v_seq + 1;
  v_canon := p_company::text || '|' || v_seq::text || '|' || p_action::text || '|'
           || coalesce(p_actor::text, '') || '|' || coalesce(p_review::text, '') || '|'
           || coalesce(p_target, '{}'::jsonb)::text || '|' || v_now::text;
  v_hash := extensions.hmac(
              convert_to(v_canon, 'utf8') || coalesce(v_prev, ''::bytea),
              convert_to(v_key, 'utf8'), 'sha256');
  insert into audit_log (id, company_id, seq, action, actor_account_id, subject_review_id,
                         target, occurred_at, prev_hash, row_hash)
    values (v_id, p_company, v_seq, p_action, p_actor, p_review,
            coalesce(p_target, '{}'::jsonb), v_now, v_prev, v_hash);
  update audit_heads set last_seq = v_seq, last_hash = v_hash where company_id = p_company;
  return v_id;
end
$$;

-- chain verifier (daily cron re-runs this; returns first broken seq or null) ──
create or replace function app.verify_audit_chain(p_company uuid) returns bigint
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  r record;
  v_prev bytea := null;
  v_key text := coalesce(current_setting('app.audit_chain_key', true), 'dev-insecure-audit-key-CHANGE-IN-PROD');
  v_canon text;
  v_expect bytea;
begin
  for r in select * from audit_log where company_id = p_company order by seq asc loop
    if r.prev_hash is distinct from v_prev then return r.seq; end if;
    v_canon := r.company_id::text || '|' || r.seq::text || '|' || r.action::text || '|'
             || coalesce(r.actor_account_id::text,'') || '|' || coalesce(r.subject_review_id::text,'') || '|'
             || coalesce(r.target,'{}'::jsonb)::text || '|' || r.occurred_at::text;
    v_expect := extensions.hmac(convert_to(v_canon,'utf8') || coalesce(v_prev,''::bytea),
                                convert_to(v_key,'utf8'), 'sha256');
    if r.row_hash is distinct from v_expect then return r.seq; end if;
    v_prev := r.row_hash;
  end loop;
  return null;   -- intact
end
$$;

-- ── activation token: validate + atomically consume (single-use, fail closed) ─
create or replace function app.consume_activation_token(p_token_hash bytea, p_auth_user uuid)
  returns table (roster_member_id uuid, company_id uuid)
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
begin
  return query
    update activation_tokens t
       set consumed_at = now(), consumed_by_auth_user = p_auth_user
     where t.token_hash = p_token_hash
       and t.consumed_at is null
       and t.expires_at > now()
    returning t.roster_member_id, t.company_id;
  if not found then
    -- one fail-closed path for expired / used / missing — no information leak
    raise exception 'ERR_TOKEN_INVALID' using errcode = 'P0001';
  end if;
end
$$;

-- ── commit_lock: the ONLY writer of locked_reviews and the ONLY path to locked ─
create or replace function app.commit_lock(p_review_id uuid, p_reason ack_outcome)
  returns uuid
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_review reviews%rowtype;
  v_narrative jsonb;
  v_retention_days int;
  v_audit uuid;
  v_content_hash bytea;
begin
  select * into v_review from reviews where id = p_review_id for update;   -- row lock: ack vs cron race
  if not found then raise exception 'ERR_REVIEW_NOT_FOUND' using errcode = 'P0001'; end if;

  -- idempotent: if already locked, no-op (window-close vs acknowledge race loser)
  if v_review.status = 'locked' then return p_review_id; end if;

  if v_review.status <> 'awaiting-acknowledgement' then
    raise exception 'ERR_NOT_REVEALED: cannot lock a review in status %', v_review.status using errcode = 'P0001';
  end if;
  if v_review.rating is null then
    raise exception 'ERR_RATING_REQUIRED' using errcode = 'P0001';
  end if;

  select coalesce(sections, '{}'::jsonb) into v_narrative
    from review_drafts where id = v_review.review_draft_id;
  v_content_hash := extensions.digest(
    convert_to(coalesce(v_narrative,'{}'::jsonb)::text || '|' || v_review.rating, 'utf8'), 'sha256');

  v_audit := app.append_audit(v_review.company_id, 'review_locked', null, p_review_id,
    jsonb_build_object('lockReason', p_reason, 'contentHash', encode(v_content_hash, 'hex')));

  insert into locked_reviews (review_id, company_id, cycle_id, employee_id, approver_id,
                              rating, narrative, locked_at, lock_reason, content_hash, audit_entry_id)
    values (p_review_id, v_review.company_id, v_review.cycle_id, v_review.employee_id, v_review.approver_id,
            v_review.rating, coalesce(v_narrative,'{}'::jsonb), now(), p_reason, v_content_hash, v_audit);

  v_retention_days := coalesce(app.effective_setting(v_review.cycle_id, 'retentionDays')::int, 730);

  perform set_config('app.committing_lock', 'on', true);
  update reviews
     set status = 'locked', locked_at = now(),
         retention_due_at = now() + make_interval(days => v_retention_days)
   where id = p_review_id;
  perform set_config('app.committing_lock', 'off', true);

  insert into retention_jobs (company_id, review_id, locked_review_id, purge_after)
    values (v_review.company_id, p_review_id, p_review_id, now() + make_interval(days => v_retention_days))
    on conflict (review_id) do nothing;

  return p_review_id;
end
$$;

-- ── worker tenant-scoping backstop (mandatory, not lint-only) ───────────────
-- The worker uses the RLS-exempt service role; confidential body reads route
-- through SECURITY DEFINER functions that re-assert tenant, so an accidental
-- wildcard still fails at the DB.
create or replace function app.worker_submitted_peer_responses(p_review_id uuid, p_company uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare v_company uuid;
begin
  select company_id into v_company from reviews where id = p_review_id;
  if v_company is null then raise exception 'ERR_REVIEW_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_company <> p_company then
    raise exception 'ERR_TENANT_MISMATCH: review % is not in company %', p_review_id, p_company using errcode = 'P0001';
  end if;
  perform set_config('app.company_id', p_company::text, true);
  return coalesce(
    (select jsonb_agg(pf.responses order by pf.submitted_at)
       from peer_feedback pf
      where pf.review_id = p_review_id and pf.state = 'submitted'),
    '[]'::jsonb);
end
$$;

-- ── updated_at touch trigger on mutable tables ──────────────────────────────
create or replace function app.touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','accounts','cycles','roster_members','nominations',
    'self_reviews','peer_feedback','review_drafts','reviews',
    'synthesis_jobs','retention_jobs'
  ] loop
    execute format(
      'create trigger %I_touch before update on %I for each row execute function app.touch_updated_at()',
      t, t);
  end loop;
end $$;
