-- Read-only inventory. Run in the Supabase SQL editor and review before hardening.sql.
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public', 'storage') order by tablename, policyname;
select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated') order by table_name, grantee;
select routine_name, grantee, privilege_type from information_schema.routine_privileges
where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC');
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
