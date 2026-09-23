begin;

-- pgcrypto ended up installed in the `extensions` schema (Supabase's
-- default install location), but every SECURITY DEFINER function that
-- calls gen_random_bytes() (create_trip, join_trip_via_invite-related
-- invite code generation, tours rpcs, etc.) pins `set search_path = public`
-- and never included `extensions`. Moving the extension into `public`
-- matches what those existing functions already assume, instead of having
-- to touch every function definition across many migration files.
do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname <> 'public'
  ) then
    alter extension pgcrypto set schema public;
  end if;
end
$$;

commit;
