-- E2E only: the Supabase roles PostgREST and the migrations expect. The auth
-- schema content is created by the real Supabase Auth (GoTrue) migrations.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'e2e';
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Like Supabase's supabase_auth_admin: owns the auth schema, search_path auth.
create role supabase_auth_admin login superuser;
alter role supabase_auth_admin set search_path = auth;
create schema auth authorization supabase_auth_admin;

create publication supabase_realtime;
