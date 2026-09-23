begin;

-- Both join_trip_via_invite (carpool) and join_public_trip (tours) return
-- `table (trip_id uuid, ...)`, which makes PL/pgSQL create an implicit
-- `trip_id` variable in scope. Their existing membership-lookup query used
-- a bare `trip_id` column reference, which Postgres can't disambiguate
-- between that variable and trip_members.trip_id -- raising
-- "column reference \"trip_id\" is ambiguous" on every single call. This
-- means joining a carpool via invite code, and joining a public tour, have
-- never actually worked. Fix: qualify the column with a table alias.
create or replace function public.join_trip_via_invite(p_invite_code text, p_referrer_user_id uuid default null)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
  v_referrer uuid;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_trip from public.trips where invite_code = p_invite_code;
  if v_trip.id is null then
    raise exception 'Invite not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting riders';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  v_referrer := null;
  if p_referrer_user_id is not null and exists (
    select 1 from public.trip_members where trip_id = v_trip.id and user_id = p_referrer_user_id and status = 'accepted'
  ) then
    v_referrer := p_referrer_user_id;
  end if;

  v_new_status := case when v_trip.visibility = 'public' then 'accepted' else 'pending' end;

  insert into public.trip_members (trip_id, user_id, member_role, status, invited_by_user_id, joined_at)
  values (v_trip.id, auth.uid(), 'member', v_new_status, v_referrer, case when v_new_status = 'accepted' then now() else null end);

  insert into public.notifications (user_id, type, title, message)
  select
    v_trip.creator_id, 'trip',
    case when v_new_status = 'accepted' then 'New rider joined' else 'Join request received' end,
    (select display_name from public.profiles where id = auth.uid()) ||
      case when v_new_status = 'accepted' then ' joined your trip "' || v_trip.title || '".'
           else ' requested to join your trip "' || v_trip.title || '".' end;

  return query select v_trip.id, v_new_status;
end;
$$;

grant execute on function public.join_trip_via_invite(text, uuid) to authenticated;

create or replace function public.join_public_trip(p_trip_id uuid)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_trip from public.trips where id = p_trip_id and visibility = 'public';
  if v_trip.id is null then
    raise exception 'Trip not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting participants';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'member', 'accepted', now());

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'New participant joined',
    (select display_name from public.profiles where id = auth.uid()) || ' joined "' || v_trip.title || '".'
  );

  return query select v_trip.id, 'accepted'::text;
end;
$$;

grant execute on function public.join_public_trip(uuid) to authenticated;

commit;
