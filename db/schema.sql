-- flowmap schema. Apply to a fresh Neon database with:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Safe to re-run: every statement is guarded.

create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Opaque session tokens, not JWTs — logout and expiry are then a plain delete
-- rather than a revocation list.
create table if not exists sessions (
  token      text primary key,
  user_id    text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);

-- `pinned` lives on the map itself rather than as a separate list, so a map and
-- its dashboard state move together.
create table if not exists maps (
  id         text primary key,
  user_id    text not null references users (id) on delete cascade,
  name       text not null,
  nodes      jsonb not null default '[]'::jsonb,
  edges      jsonb not null default '[]'::jsonb,
  pinned     boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists maps_user_id_idx on maps (user_id);

-- Fixed-window counters for auth throttling. Keyed by 'login:email:<addr>',
-- 'login:ip:<addr>', or 'signup:ip:<addr>'; a row whose window has elapsed is
-- reset in place, so the table stays one row per active key rather than one row
-- per attempt.
create table if not exists rate_limits (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rate_limits_window_idx on rate_limits (window_start);

-- Email verification state. Nullable rather than a boolean default so accounts
-- created before verification existed are distinguishable from unverified ones.
alter table users add column if not exists email_verified_at timestamptz;

-- One table for both reset and verification links. Only a SHA-256 of the token
-- is stored: the raw value exists in the user's inbox and nowhere else, so a
-- database leak yields no usable link. Single-use is enforced by deleting the
-- row on consumption.
create table if not exists auth_tokens (
  token_hash text primary key,
  user_id    text not null references users (id) on delete cascade,
  purpose    text not null check (purpose in ('reset', 'verify')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_tokens_user_idx on auth_tokens (user_id, purpose);
create index if not exists auth_tokens_expiry_idx on auth_tokens (expires_at);

-- Optimistic concurrency. Autosave sends the whole document, so without a
-- version to write against, two editors (or two tabs) silently overwrite each
-- other. A write states the version it was based on; a stale one is refused.
alter table maps add column if not exists version integer not null default 0;

-- Capability links: anyone holding the raw token has the stated role on that
-- one map. Only the SHA-256 is stored, so a database leak yields no working
-- link. Unlike auth_tokens these are reusable, hence a separate table.
create table if not exists map_links (
  token_hash   text primary key,
  map_id       text not null references maps (id) on delete cascade,
  role         text not null check (role in ('viewer', 'editor')),
  created_by   text not null references users (id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  -- Soft revocation: keeps a record that the link existed and was withdrawn.
  revoked_at   timestamptz,
  last_used_at timestamptz
);

create index if not exists map_links_map_idx on map_links (map_id);

-- Named grants: access tied to an account, revocable per person. The primary
-- key is what stops one person holding two roles on the same map.
create table if not exists map_grants (
  map_id     text not null references maps (id) on delete cascade,
  user_id    text not null references users (id) on delete cascade,
  role       text not null check (role in ('viewer', 'editor')),
  granted_by text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

create index if not exists map_grants_user_idx on map_grants (user_id);
