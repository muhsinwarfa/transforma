-- ============================================================================
-- 1700 — ADDITIVE (spine 000100–000400 FROZEN; CREATE OR REPLACE on the audit
-- core, the integrity heart). Moves the keyed-HMAC audit-chain key OFF a Postgres
-- GUC and INTO Supabase Vault, because the delegated `postgres` role cannot set a
-- persistent GUC (ALTER DATABASE/ROLE → 42501). Owner-read validated first:
-- `postgres` (the SECURITY DEFINER owner of these functions) can SELECT
-- vault.decrypted_secrets.
--
-- FAIL LOUD, NO SILENT FALLBACK: the 0300 functions fell back to a dev-insecure
-- key via coalesce(current_setting(...), 'dev-insecure-...'). That is the one
-- outcome that quietly voids the tamper-resistance while everything looks green.
-- 1700 removes the fallback entirely: app.audit_key() RAISES if the Vault secret
-- is absent/too-short, so append_audit and verify_audit_chain refuse to operate
-- under an insecure key. The keyed-HMAC property (an attacker with DB write access
-- still cannot forge a valid continuation without the key) is preserved — only the
-- key's storage moved from a GUC to Vault.
--
-- No caching: audit writes are low-frequency (one per audit event), so a per-call
-- Vault decrypt is cheap; caching the secret in session state would be a worse
-- security trade-off (the secret would linger in a GUC).
-- ============================================================================

-- The single key source. Returns the secret; RAISES (never falls back) if absent.
-- Returns the secret value, so it is service-role/owner-internal ONLY — revoked
-- from PUBLIC/anon/authenticated below (append_audit/verify call it as the owner).
create or replace function app.audit_key() returns text
  language plpgsql stable security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'audit_chain_key'
  limit 1;
  if v_key is null or length(v_key) < 32 then
    raise exception 'ERR_AUDIT_KEY_MISSING: audit_chain_key absent or too short in Vault — refusing to read/write audit entries under an insecure key'
      using errcode = 'P0001';
  end if;
  return v_key;
end
$$;
revoke execute on function app.audit_key() from public, anon, authenticated;

-- append_audit — IDENTICAL to 0300 except the key now comes from app.audit_key()
-- (which raises if the Vault key is missing, so a write can never use a dev key).
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
  v_key text := app.audit_key();
  v_canon text;
  v_hash bytea;
  v_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext(p_company::text));
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

-- verify_audit_chain — IDENTICAL to 0300 except the key now comes from
-- app.audit_key() (so verification also refuses to run under an insecure key).
create or replace function app.verify_audit_chain(p_company uuid) returns bigint
  language plpgsql security definer
  set search_path = app, public, pg_temp set row_security = off
as $$
declare
  r record;
  v_prev bytea := null;
  v_key text := app.audit_key();
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
