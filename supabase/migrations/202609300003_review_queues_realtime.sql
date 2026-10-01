-- Live staff/admin website: every Staff*/Admin* page subscribes to the tables it
-- reads so new rows appear without a page reload (ID and vehicle queues,
-- reports, payments, feedback, audit log, users/staff, dashboards).
-- Realtime still applies RLS, so each user only receives rows they could
-- already select.
do $$
declare
  t text;
begin
  foreach t in array array[
    'id_verifications', 'vehicles', 'reports', 'payment_history', 'feedback',
    'audit_logs', 'profiles', 'trips', 'trip_members'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
