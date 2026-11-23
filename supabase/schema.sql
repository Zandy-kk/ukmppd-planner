-- UKMPPD Planner · Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

create table if not exists public.day_logs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.error_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists error_items_user_idx on public.error_items (user_id);

create table if not exists public.planner_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each signed-in user can only see and change their own rows.
alter table public.day_logs         enable row level security;
alter table public.error_items      enable row level security;
alter table public.planner_settings enable row level security;

drop policy if exists "own day_logs" on public.day_logs;
create policy "own day_logs" on public.day_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own error_items" on public.error_items;
create policy "own error_items" on public.error_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own planner_settings" on public.planner_settings;
create policy "own planner_settings" on public.planner_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
