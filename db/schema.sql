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
