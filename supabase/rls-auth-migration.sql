-- SOP app secure storage migration
-- Run this once in Supabase SQL Editor after enabling Email Auth.
--
-- Important:
-- This migration switches prototype public data to per-login-user data.
-- Existing prototype rows with no owner_id are deleted to avoid primary-key
-- conflicts during the first authenticated sync. If you need to preserve
-- those rows, copy your user UUID from Authentication > Users and set
-- owner_id on those rows before running the delete statements below.

begin;

create extension if not exists pgcrypto;

alter table public.standards
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.standard_revisions
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.app_settings
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.work_runs
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Remove rows created by the earlier no-login prototype policy.
delete from public.standard_revisions where owner_id is null;
delete from public.work_runs where owner_id is null;
delete from public.standards where owner_id is null;
delete from public.app_settings where owner_id is null;

alter table public.standards alter column owner_id set not null;
alter table public.standard_revisions alter column owner_id set not null;
alter table public.app_settings alter column owner_id set not null;
alter table public.work_runs alter column owner_id set not null;

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings
  add constraint app_settings_pkey primary key (owner_id, key);

create index if not exists standards_owner_saved_at_idx
  on public.standards(owner_id, saved_at desc);

create index if not exists standard_revisions_owner_standard_idx
  on public.standard_revisions(owner_id, standard_id, saved_at);

create index if not exists work_runs_owner_work_date_idx
  on public.work_runs(owner_id, work_date desc);

alter table public.standards enable row level security;
alter table public.standard_revisions enable row level security;
alter table public.app_settings enable row level security;
alter table public.work_runs enable row level security;

revoke all on table public.standards from anon;
revoke all on table public.standard_revisions from anon;
revoke all on table public.app_settings from anon;
revoke all on table public.work_runs from anon;

grant select, insert, update, delete on table public.standards to authenticated;
grant select, insert, update, delete on table public.standard_revisions to authenticated;
grant select, insert, update, delete on table public.app_settings to authenticated;
grant select, insert, update, delete on table public.work_runs to authenticated;

drop policy if exists "prototype public access standards" on public.standards;
drop policy if exists "prototype public access standard revisions" on public.standard_revisions;
drop policy if exists "prototype public access app settings" on public.app_settings;
drop policy if exists "prototype public access work runs" on public.work_runs;

drop policy if exists "users can read own standards" on public.standards;
drop policy if exists "users can insert own standards" on public.standards;
drop policy if exists "users can update own standards" on public.standards;
drop policy if exists "users can delete own standards" on public.standards;

create policy "users can read own standards"
on public.standards for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "users can insert own standards"
on public.standards for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "users can update own standards"
on public.standards for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "users can delete own standards"
on public.standards for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "users can read own revisions" on public.standard_revisions;
drop policy if exists "users can insert own revisions" on public.standard_revisions;
drop policy if exists "users can update own revisions" on public.standard_revisions;
drop policy if exists "users can delete own revisions" on public.standard_revisions;

create policy "users can read own revisions"
on public.standard_revisions for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "users can insert own revisions"
on public.standard_revisions for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.standards s
    where s.id = standard_id
      and s.owner_id = (select auth.uid())
  )
);

create policy "users can update own revisions"
on public.standard_revisions for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.standards s
    where s.id = standard_id
      and s.owner_id = (select auth.uid())
  )
);

create policy "users can delete own revisions"
on public.standard_revisions for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "users can read own settings" on public.app_settings;
drop policy if exists "users can insert own settings" on public.app_settings;
drop policy if exists "users can update own settings" on public.app_settings;
drop policy if exists "users can delete own settings" on public.app_settings;

create policy "users can read own settings"
on public.app_settings for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "users can insert own settings"
on public.app_settings for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "users can update own settings"
on public.app_settings for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "users can delete own settings"
on public.app_settings for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "users can read own work runs" on public.work_runs;
drop policy if exists "users can insert own work runs" on public.work_runs;
drop policy if exists "users can update own work runs" on public.work_runs;
drop policy if exists "users can delete own work runs" on public.work_runs;

create policy "users can read own work runs"
on public.work_runs for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "users can insert own work runs"
on public.work_runs for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    standard_id is null
    or exists (
      select 1
      from public.standards s
      where s.id = standard_id
        and s.owner_id = (select auth.uid())
    )
  )
);

create policy "users can update own work runs"
on public.work_runs for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    standard_id is null
    or exists (
      select 1
      from public.standards s
      where s.id = standard_id
        and s.owner_id = (select auth.uid())
    )
  )
);

create policy "users can delete own work runs"
on public.work_runs for delete
to authenticated
using ((select auth.uid()) = owner_id);

commit;

-- Force Supabase/PostgREST to refresh its schema cache after the column changes.
notify pgrst, 'reload schema';
