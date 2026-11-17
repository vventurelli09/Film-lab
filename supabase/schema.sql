-- Film Lab database setup.
-- Supabase → SQL Editor → New query → paste this whole file → Run.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'coach' check (role in ('coach','parent','player')),
  created_at timestamptz not null default now()
);

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  sport text not null,
  position text,
  level text,
  bats text,
  throws text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists film_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  sport text not null,
  session_type text not null check (session_type in ('game','practice','individual','team')),
  focus text,
  athlete_ids uuid[] not null default '{}',
  notes text,
  video_path text,
  frame_paths text[] not null default '{}',
  frame_times numeric[] not null default '{}',
  frame_interval numeric,
  clip_start numeric,
  clip_end numeric,
  status text not null default 'processing',
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references film_sessions on delete cascade,
  content text not null,
  model text,
  rating smallint,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references film_sessions on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- "Teach the AI": standing coaching rules included in every future analysis.
create table if not exists ai_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  sport text,
  athlete_id uuid references athletes on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid references film_sessions on delete cascade,
  athlete_id uuid references athletes on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','approved','completed')),
  items jsonb not null default '[]',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plan_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references plans on delete cascade,
  item_index int not null,
  note text,
  done_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- Row level security: every user only sees their own rows.
do $$
declare t text;
begin
  foreach t in array array['athletes','film_sessions','analyses','messages','ai_rules','plans','plan_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

alter table profiles enable row level security;
drop policy if exists own_profile on profiles;
create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- Private storage bucket for film. Files live under <user id>/...
insert into storage.buckets (id, name, public)
values ('film', 'film', false)
on conflict (id) do nothing;

drop policy if exists film_own on storage.objects;
create policy film_own on storage.objects for all
  using (bucket_id = 'film' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'film' and (storage.foldername(name))[1] = auth.uid()::text);
