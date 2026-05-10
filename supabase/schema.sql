create extension if not exists pgcrypto;

create table if not exists public.standards (
  id text primary key,
  title text not null default '작업명 미입력',
  work_type text,
  equipment text,
  tag text,
  system text,
  rev text not null default 'Rev.01',
  saved_at timestamptz not null default now(),
  form jsonb not null default '{}'::jsonb,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.standard_revisions (
  id text primary key,
  standard_id text not null references public.standards(id) on delete cascade,
  rev text not null,
  saved_at timestamptz not null default now(),
  author text,
  summary text,
  form jsonb not null default '{}'::jsonb,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (standard_id, rev)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_runs (
  id uuid primary key default gen_random_uuid(),
  standard_id text references public.standards(id) on delete set null,
  standard_rev text,
  work_date date not null default current_date,
  status text not null default 'draft',
  tbm jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists standards_set_updated_at on public.standards;
create trigger standards_set_updated_at
before update on public.standards
for each row execute function public.set_updated_at();

drop trigger if exists work_runs_set_updated_at on public.work_runs;
create trigger work_runs_set_updated_at
before update on public.work_runs
for each row execute function public.set_updated_at();

alter table public.standards enable row level security;
alter table public.standard_revisions enable row level security;
alter table public.app_settings enable row level security;
alter table public.work_runs enable row level security;

-- Prototype policy: no login yet, so anyone with the app URL can read/write.
-- Before real company use, replace these with authenticated user/team policies.
drop policy if exists "prototype public access standards" on public.standards;
create policy "prototype public access standards"
on public.standards for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "prototype public access standard revisions" on public.standard_revisions;
create policy "prototype public access standard revisions"
on public.standard_revisions for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "prototype public access app settings" on public.app_settings;
create policy "prototype public access app settings"
on public.app_settings for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "prototype public access work runs" on public.work_runs;
create policy "prototype public access work runs"
on public.work_runs for all
to anon, authenticated
using (true)
with check (true);
