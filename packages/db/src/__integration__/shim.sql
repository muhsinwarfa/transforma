-- Supabase-compatible shim so the production migrations run unchanged on a plain
-- Postgres (no Docker / no Supabase CLI). Provides: the `extensions` schema, a
-- minimal `auth` schema (users + auth.uid()), and the three Supabase roles.
-- The migrations themselves are NOT modified — this only stands up what Supabase
-- would otherwise provide.

create schema if not exists extensions;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() reads the request JWT claims GUC (set per-probe to simulate a user).
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- let the bootstrap superuser assume these roles for the probes
grant anon, authenticated, service_role to current_user;

-- Minimal Supabase Vault stand-in (migration 1700 reads the audit-chain key from
-- vault.decrypted_secrets; on prod that is the real Vault view). A TABLE here so a
-- probe can swap/blank the key to exercise the keyed property + the fail-loud path.
-- The seeded key is a real (test) 64-char secret — NOT the old dev-insecure
-- fallback, which 1700 removed entirely.
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text,
  decrypted_secret text
);
insert into vault.decrypted_secrets (name, decrypted_secret)
  values ('audit_chain_key', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2')
  on conflict (name) do nothing;
