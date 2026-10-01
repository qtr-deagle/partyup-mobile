begin;

-- TESTING ONLY: lets any traveler apply to be a Guild Leader regardless of
-- the requirements, so guild founding can be tested without the website's
-- direct-promote. The checklist still shows real progress; only `eligible`
-- is forced true (apply_for_guild_leader() reads it, so the server allows it
-- too). To re-enforce, add a migration that restores the commented line.

create or replace function public.get_leader_eligibility()
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
    -- TESTING: requirements bypassed. Restore the line below to enforce them.
    -- trips_ok and hosted_ok and rating_ok and coalesce(verified, false),
    true,
    pending
  from checks;
$$;

commit;
