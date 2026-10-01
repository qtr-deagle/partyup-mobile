-- Live admin website: the Guild Leader application queue (/admin/staff,
-- LeaderProgram.tsx) refetches when an application is filed or decided.
-- Realtime still applies RLS ("leader applications own or admin"), so only
-- admins and the applicant receive a row.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guild_leader_applications'
  ) then
    alter publication supabase_realtime add table public.guild_leader_applications;
  end if;
end;
$$;
