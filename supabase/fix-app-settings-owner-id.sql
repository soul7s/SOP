-- Repair app_settings for authenticated per-user storage.
-- Run this in Supabase SQL Editor if the app shows:
-- Could not find the 'owner_id' column of 'app_settings' in the schema cache

begin;

alter table public.app_settings
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Old prototype settings were shared and have no owner. Remove them so the
-- table can become user-scoped. The app recreates system options automatically.
delete from public.app_settings where owner_id is null;

alter table public.app_settings
  alter column owner_id set not null;

alter table public.app_settings
  drop constraint if exists app_settings_pkey;

alter table public.app_settings
  add constraint app_settings_pkey primary key (owner_id, key);

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon;
grant select, insert, update, delete on table public.app_settings to authenticated;

drop policy if exists "prototype public access app settings" on public.app_settings;
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

commit;

-- Force Supabase/PostgREST to refresh its schema cache after the column change.
notify pgrst, 'reload schema';
