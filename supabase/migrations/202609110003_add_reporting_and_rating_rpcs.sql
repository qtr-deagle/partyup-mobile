begin;

-- Traveler-facing report submission -- serves the chat "Report" menu item,
-- reporting a trip member, and reporting a user from their profile. The
-- reports table's check constraint still allows 'payment'/'feedback' report
-- types for other (non-traveler-initiated) flows, but this RPC only accepts
-- the subset that means "report a user/situation".
create or replace function public.submit_report(
  p_reported_user_id uuid default null,
  p_trip_id uuid default null,
  p_report_type text default 'other',
  p_details text default ''
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.reports;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_report_type not in ('safety', 'behavior', 'other') then
    raise exception 'Invalid report type';
  end if;

  if trim(coalesce(p_details, '')) = '' then
    raise exception 'Please describe what happened';
  end if;

  if p_reported_user_id is not null and p_reported_user_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  if p_reported_user_id is null and p_trip_id is null then
    raise exception 'A report must reference a user or a trip';
  end if;

  insert into public.reports (reporter_id, reported_user_id, trip_id, report_type, details)
  values (auth.uid(), p_reported_user_id, p_trip_id, p_report_type, trim(p_details))
  returning * into result;

  return result;
end;
$$;

grant execute on function public.submit_report(uuid, uuid, text, text) to authenticated;

-- Only "user" feedback needs (author, target, trip) uniqueness -- 'trip'/
-- 'service' feedback rows don't set target_user_id and stay unconstrained.
create unique index if not exists feedback_user_rating_unique_idx
on public.feedback (author_id, target_user_id, trip_id)
where feedback_type = 'user';

-- Rate a travel companion after a completed trip. Upserts so re-rating the
-- same person on the same trip updates rather than duplicates.
create or replace function public.submit_user_rating(
  p_target_user_id uuid,
  p_trip_id uuid,
  p_rating int,
  p_comment text default null
)
returns public.feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.feedback;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id = auth.uid() then
    raise exception 'You cannot rate yourself';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if not exists (select 1 from public.trips where id = p_trip_id and status = 'completed') then
    raise exception 'You can only rate travelers after the trip is completed';
  end if;

  if not public.is_trip_member(p_trip_id) then
    raise exception 'You were not part of this trip';
  end if;

  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_target_user_id and status = 'accepted'
  ) then
    raise exception 'That traveler was not part of this trip';
  end if;

  insert into public.feedback (author_id, target_user_id, trip_id, rating, feedback_type, comment)
  values (auth.uid(), p_target_user_id, p_trip_id, p_rating, 'user', nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (author_id, target_user_id, trip_id) where feedback_type = 'user'
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.submit_user_rating(uuid, uuid, int, text) to authenticated;

-- Lets the trip detail screen show which companions the caller already rated.
create or replace function public.list_my_given_ratings(p_trip_id uuid)
returns table (target_user_id uuid, rating int, comment text)
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id, rating, comment
  from public.feedback
  where author_id = auth.uid() and trip_id = p_trip_id and feedback_type = 'user';
$$;

grant execute on function public.list_my_given_ratings(uuid) to authenticated;

commit;
