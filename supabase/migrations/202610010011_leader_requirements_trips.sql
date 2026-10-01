begin;

-- Guild Leader eligibility no longer depends on rank. Applicants show they
-- can lead by actually traveling: completed trips, trips they organized,
-- an established 4+ rating, and a verified ID. Keep these thresholds in
-- sync with LEADER_REQUIREMENTS in lib/guilds.ts.
--   * 10+ completed trips (created or joined as an accepted member)
--   * 2+ completed trips they hosted
--   * 4.0+ average from at least 3 ratings
--   * verified ID

-- Return columns change, so the old signature has to go first.
drop function if exists public.get_leader_eligibility();

create function public.get_leader_eligibility()
returns table (
  trips_completed bigint,
  trips_hosted bigint,
  verified boolean,
  avg_rating numeric,
  rating_count bigint,
  trips_ok boolean,
  hosted_ok boolean,
  rating_ok boolean,
  eligible boolean,
  pending_application boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      (select count(*) from public.trips t
        where t.status = 'completed'
          and (
            t.creator_id = auth.uid()
            or exists (
              select 1 from public.trip_members tm
              where tm.trip_id = t.id and tm.user_id = auth.uid() and tm.status = 'accepted'
            )
          )) as trips,
      (select count(*) from public.trips t
        where t.status = 'completed' and t.creator_id = auth.uid()) as hosted,
      (select verification_status = 'approved' from public.profiles where id = auth.uid()) as verified,
      (select avg(rating) from public.feedback where target_user_id = auth.uid()) as avg_rating,
      (select count(*) from public.feedback where target_user_id = auth.uid()) as rating_count,
      exists (select 1 from public.guild_leader_applications where user_id = auth.uid() and status = 'pending') as pending
  ),
  checks as (
    select *,
      trips >= 10 as trips_ok,
      hosted >= 2 as hosted_ok,
      rating_count >= 3 and coalesce(avg_rating, 0) >= 4 as rating_ok
    from me
  )
  select
    trips,
    hosted,
    coalesce(verified, false),
    round(avg_rating, 2),
    rating_count,
    trips_ok,
    hosted_ok,
    rating_ok,
    trips_ok and hosted_ok and rating_ok and coalesce(verified, false),
    pending
  from checks;
$$;

revoke all on function public.get_leader_eligibility() from public;
grant execute on function public.get_leader_eligibility() to authenticated;

create or replace function public.apply_for_guild_leader(p_guild_name text, p_pitch text)
returns public.guild_leader_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eligible boolean;
  v_app public.guild_leader_applications;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_user_role() <> 'traveler' then
    raise exception 'Only travelers can apply';
  end if;
  select e.eligible into v_eligible from public.get_leader_eligibility() e;
  if not coalesce(v_eligible, false) then
    raise exception 'You need 10 completed trips, 2 hosted trips, a 4+ rating from 3 buddies and a verified ID to apply';
  end if;
  if exists (select 1 from public.guild_leader_applications where user_id = auth.uid() and status = 'pending') then
    raise exception 'You already have an application under review';
  end if;
  if exists (select 1 from public.guilds where lower(btrim(name)) = lower(btrim(p_guild_name))) then
    raise exception 'That guild name is taken';
  end if;

  insert into public.guild_leader_applications (user_id, guild_name, pitch)
  values (auth.uid(), btrim(p_guild_name), btrim(p_pitch))
  returning * into v_app;

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, message, data)
  select p.id, 'system', 'New Guild Leader application',
    coalesce(v_name, 'A traveler') || ' wants to found ' || v_app.guild_name || '.',
    jsonb_build_object('application_id', v_app.id)
  from public.profiles p where p.role = 'admin';

  return v_app;
end;
$$;

commit;
