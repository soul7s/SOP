-- Check whether app_settings is ready for per-user storage.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_settings'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.app_settings'::regclass
order by conname;
