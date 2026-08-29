begin;

-- Create a carpool trip; auto-adds the creator as its driver and generates a
-- shareable invite code.
create or replace function public.create_trip(
  p_title text,
  p_origin text,
  p_destination text,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_visibility text default 'public',
  p_seats_total int default null,
  p_total_cost numeric default null,
  p_notes text default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_visibility not in ('public', 'trusted_circle', 'private') then
    raise exception 'Invalid visibility';
  end if;

  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_origin, '')) = '' or trim(coalesce(p_destination, '')) = '' then
    raise exception 'Title, origin, and destination are required';
  end if;

  loop
    v_code := encode(gen_random_bytes(5), 'hex');
    exit when not exists (select 1 from public.trips where invite_code = v_code);
  end loop;

  insert into public.trips (
    creator_id, title, trip_type, origin, destination, start_at, end_at,
    status, visibility, seats_total, seats_available, total_cost, invite_code, notes
  )
  values (
    auth.uid(), trim(p_title), 'carpool', trim(p_origin), trim(p_destination), p_start_at, p_end_at,
    'open', p_visibility, p_seats_total, p_seats_total, p_total_cost, v_code, nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'driver', 'accepted', now());

  select * into v_trip from public.trips where id = v_trip.id;

  return v_trip;
end;
$$;

grant execute on function public.create_trip(text, text, text, timestamptz, timestamptz, text, int, numeric, text) to authenticated;

-- Trips the caller drives or rides, for the "My Trips" tab.
create or replace function public.list_my_trips(p_trip_type text default 'carpool')
returns table (
  id uuid,
  title text,
  origin text,
  destination text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  visibility text,
  seats_total int,
  seats_available int,
  total_cost numeric,
  price_per_person numeric,
  rider_count int,
  my_role text,
  my_status text,
  pending_join_requests_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.title, t.origin, t.destination, t.start_at, t.end_at,
    t.status, t.visibility, t.seats_total, t.seats_available, t.total_cost, t.price_per_person,
    (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int as rider_count,
    tm.member_role as my_role,
    tm.status as my_status,
    case when tm.member_role = 'driver'
      then (select count(*) from public.trip_members pr where pr.trip_id = t.id and pr.status = 'pending')::int
      else 0
    end as pending_join_requests_count,
    t.created_at
  from public.trips t
  join public.trip_members tm on tm.trip_id = t.id and tm.user_id = auth.uid()
  where t.trip_type = p_trip_type
    and tm.status in ('accepted', 'pending')
  order by t.created_at desc;
$$;

grant execute on function public.list_my_trips(text) to authenticated;

-- Trip header, driver payment handles, and the caller's own membership state.
create or replace function public.get_trip_detail(p_trip_id uuid)
returns table (
  id uuid, title text, origin text, destination text, start_at timestamptz, end_at timestamptz,
  status text, visibility text, seats_total int, seats_available int, notes text,
  total_cost numeric, price_per_person numeric, rider_count int, invite_code text,
  driver_id uuid, driver_display_name text, driver_avatar_url text,
  driver_gcash_handle text, driver_paymaya_handle text,
  is_driver boolean, my_status text, my_payment_status text, my_payment_amount numeric,
  my_invited_by_display_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
  ) then
    raise exception 'Trip not found';
  end if;

  return query
  select
    t.id, t.title, t.origin, t.destination, t.start_at, t.end_at,
    t.status, t.visibility, t.seats_total, t.seats_available, t.notes,
    t.total_cost, t.price_per_person,
    (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
    t.invite_code,
    d.id, d.display_name, d.avatar_url, d.gcash_handle, d.paymaya_handle,
    (t.creator_id = auth.uid()),
    my_tm.status,
    my_tm.payment_status,
    my_tm.payment_amount,
    inviter.display_name
  from public.trips t
  join public.profiles d on d.id = t.creator_id
  left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
  left join public.profiles inviter on inviter.id = my_tm.invited_by_user_id
  where t.id = p_trip_id;
end;
$$;

grant execute on function public.get_trip_detail(uuid) to authenticated;

-- Full member roster for the trip detail / driver management screen.
create or replace function public.list_trip_members(p_trip_id uuid)
returns table (
  id uuid, user_id uuid, display_name text, avatar_url text, member_role text, status text,
  invited_by_user_id uuid, invited_by_display_name text,
  payment_status text, payment_amount numeric, payment_reference text,
  payment_reported_at timestamptz, payment_confirmed_at timestamptz,
  joined_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
  ) then
    raise exception 'Trip not found';
  end if;

  return query
  select
    tm.id, tm.user_id, p.display_name, p.avatar_url, tm.member_role, tm.status,
    tm.invited_by_user_id, inviter.display_name,
    tm.payment_status, tm.payment_amount, tm.payment_reference,
    tm.payment_reported_at, tm.payment_confirmed_at, tm.joined_at, tm.created_at
  from public.trip_members tm
  join public.profiles p on p.id = tm.user_id
  left join public.profiles inviter on inviter.id = tm.invited_by_user_id
  where tm.trip_id = p_trip_id
    and tm.status <> 'left'
  order by
    case tm.member_role when 'driver' then 0 else 1 end,
    case tm.status when 'pending' then 0 else 1 end,
    tm.joined_at nulls last,
    tm.created_at;
end;
$$;

grant execute on function public.list_trip_members(uuid) to authenticated;

-- Any accepted member can fetch (and lazily generate) the trip's invite code.
create or replace function public.get_trip_invite_link(p_trip_id uuid)
returns table (trip_id uuid, invite_code text, trip_title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_title text;
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
  ) then
    raise exception 'Trip not found';
  end if;

  select invite_code, title into v_code, v_title from public.trips where id = p_trip_id;

  if v_code is null then
    loop
      v_code := encode(gen_random_bytes(5), 'hex');
      exit when not exists (select 1 from public.trips where invite_code = v_code);
    end loop;
    update public.trips set invite_code = v_code where id = p_trip_id;
  end if;

  return query select p_trip_id, v_code, v_title;
end;
$$;

grant execute on function public.get_trip_invite_link(uuid) to authenticated;

-- Deep-link entry point: join (public trips, if seats allow) or request to
-- join (trusted_circle/private trips, always). Idempotent if already a
-- member. Validates the referrer is an actual accepted member of this trip
-- before recording the "invited by" attribution.
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

  select * into v_existing from public.trip_members where trip_id = v_trip.id and user_id = auth.uid();
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

-- Driver approves/declines a pending join request (required for
-- trusted_circle/private trips regardless of invite-link possession).
create or replace function public.respond_to_join_request(p_trip_member_id uuid, p_status text)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Invalid status';
  end if;

  select tm.* into v_member from public.trip_members tm where tm.id = p_trip_member_id and tm.status = 'pending';
  if v_member.id is null then
    raise exception 'Join request not found';
  end if;

  select * into v_trip from public.trips where id = v_member.trip_id and creator_id = auth.uid();
  if v_trip.id is null then
    raise exception 'Not authorized';
  end if;

  if p_status = 'accepted' and v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  update public.trip_members
  set status = p_status, joined_at = case when p_status = 'accepted' then now() else joined_at end
  where id = p_trip_member_id
  returning * into v_member;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_member.user_id, 'trip',
    case when p_status = 'accepted' then 'Join request accepted' else 'Join request declined' end,
    case when p_status = 'accepted' then 'You''re in! Your request to join "' || v_trip.title || '" was accepted.'
         else 'Your request to join "' || v_trip.title || '" was declined.' end
  );

  return v_member;
end;
$$;

grant execute on function public.respond_to_join_request(uuid, text) to authenticated;

-- Rider leaves a trip; frees a seat and raises the remaining riders' live fare.
create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
begin
  select * into v_member from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and status in ('accepted', 'pending');
  if v_member.id is null then
    raise exception 'You are not part of this trip';
  end if;

  if v_member.member_role = 'driver' then
    raise exception 'The driver cannot leave the trip. Cancel it instead.';
  end if;

  update public.trip_members set status = 'left' where id = v_member.id;

  select * into v_trip from public.trips where id = p_trip_id;
  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'Rider left your trip',
    (select display_name from public.profiles where id = auth.uid()) || ' left "' || v_trip.title || '".'
  );
end;
$$;

grant execute on function public.leave_trip(uuid) to authenticated;

-- Driver cancels the whole trip.
create or replace function public.cancel_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips where id = p_trip_id and creator_id = auth.uid();
  if v_trip.id is null then
    raise exception 'Not authorized';
  end if;

  update public.trips set status = 'cancelled' where id = p_trip_id;

  insert into public.notifications (user_id, type, title, message)
  select tm.user_id, 'trip', 'Trip cancelled', 'The trip "' || v_trip.title || '" was cancelled by the driver.'
  from public.trip_members tm
  where tm.trip_id = p_trip_id and tm.status in ('accepted', 'pending') and tm.user_id <> auth.uid();
end;
$$;

grant execute on function public.cancel_trip(uuid) to authenticated;

-- Rider self-reports an off-platform GCash/PayMaya payment. Snapshots the
-- live price_per_person into payment_amount at this instant -- later riders
-- joining (or leaving) never change what an already-reported rider owes.
create or replace function public.report_payment(p_trip_id uuid, p_reference text default null)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
  v_amount numeric(10,2);
  v_payment_id uuid;
begin
  select * into v_member from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and member_role = 'member' and status = 'accepted';
  if v_member.id is null then
    raise exception 'You are not an accepted rider on this trip';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  v_amount := coalesce(v_trip.price_per_person, v_trip.total_cost, 0);

  insert into public.payment_history (user_id, trip_id, trip_member_id, amount, currency, status, reference)
  values (auth.uid(), p_trip_id, v_member.id, v_amount, 'PHP', 'pending', nullif(trim(coalesce(p_reference, '')), ''))
  returning id into v_payment_id;

  update public.trip_members
  set payment_status = 'pending',
      payment_amount = v_amount,
      payment_reference = nullif(trim(coalesce(p_reference, '')), ''),
      payment_reported_at = now(),
      last_payment_id = v_payment_id
  where id = v_member.id
  returning * into v_member;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'Payment reported',
    (select display_name from public.profiles where id = auth.uid()) || ' reported a payment of ₱' || v_amount || ' for "' || v_trip.title || '". Confirm once received.'
  );

  return v_member;
end;
$$;

grant execute on function public.report_payment(uuid, text) to authenticated;

-- Driver confirms they received the off-platform payment; this is the second
-- step of the two-step confirmation flow.
create or replace function public.confirm_payment_received(p_trip_member_id uuid)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
begin
  select tm.* into v_member from public.trip_members tm where tm.id = p_trip_member_id and tm.payment_status = 'pending';
  if v_member.id is null then
    raise exception 'No pending payment found for this rider';
  end if;

  select * into v_trip from public.trips where id = v_member.trip_id and creator_id = auth.uid();
  if v_trip.id is null then
    raise exception 'Not authorized';
  end if;

  update public.payment_history set status = 'paid', confirmed_by = auth.uid()
  where id = v_member.last_payment_id;

  update public.trip_members
  set payment_status = 'paid', payment_confirmed_at = now()
  where id = p_trip_member_id
  returning * into v_member;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_member.user_id, 'trip', 'Payment confirmed',
    'Your payment of ₱' || v_member.payment_amount || ' for "' || v_trip.title || '" was confirmed.'
  );

  return v_member;
end;
$$;

grant execute on function public.confirm_payment_received(uuid) to authenticated;

commit;
