-- Ratings are final: once you rate a companion for a trip, the rating can't
-- be changed. submit_user_rating used to upsert (the app showed an "Edit"
-- button); a second rating for the same person and trip is now rejected.

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

  begin
    insert into public.feedback (author_id, target_user_id, trip_id, rating, feedback_type, comment)
    values (auth.uid(), p_target_user_id, p_trip_id, p_rating, 'user', nullif(trim(coalesce(p_comment, '')), ''))
    returning * into result;
  exception when unique_violation then
    raise exception 'You already rated this traveler for this trip. Ratings can''t be changed.';
  end;

  return result;
end;
$$;
grant execute on function public.submit_user_rating(uuid, uuid, int, text) to authenticated;
