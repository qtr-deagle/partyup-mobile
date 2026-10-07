begin;

-- The website's Vehicles page now has a "Driver's licenses" queue and shows
-- each traveler's license with their vehicle; broadcast changes so new
-- submissions and auto-check results appear without a reload. Realtime still
-- applies RLS (own license, or admins).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_licenses'
  ) then
    alter publication supabase_realtime add table public.driver_licenses;
  end if;
end;
$$;

commit;
