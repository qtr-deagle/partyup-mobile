begin;

-- Surface payment_channel/payment_intent_id (added in 202609150001) to the
-- client so the trip screen can tell a gateway-verified payment apart from
-- a self-reported one and show the right status copy.
--
-- Postgres won't let CREATE OR REPLACE change a function's RETURNS TABLE
-- columns (even just adding one in the middle), so the old signature must
-- be dropped first.
drop function if exists public.get_trip_detail(uuid);

create function public.get_trip_detail(p_trip_id uuid)
returns table (
  id uuid, title text, origin text, destination text, start_at timestamptz, end_at timestamptz,
  status text, visibility text, seats_total int, seats_available int, notes text,
  total_cost numeric, price_per_person numeric, rider_count int, invite_code text,
  driver_id uuid, driver_display_name text, driver_avatar_url text,
  driver_gcash_handle text, driver_paymaya_handle text,
  is_driver boolean, my_status text, my_payment_status text, my_payment_amount numeric,
  my_payment_channel text, my_invited_by_display_name text
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
    my_tm.payment_channel,
    inviter.display_name
  from public.trips t
  join public.profiles d on d.id = t.creator_id
  left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
  left join public.profiles inviter on inviter.id = my_tm.invited_by_user_id
  where t.id = p_trip_id;
end;
$$;

grant execute on function public.get_trip_detail(uuid) to authenticated;

drop function if exists public.list_trip_members(uuid);

create function public.list_trip_members(p_trip_id uuid)
returns table (
  id uuid, user_id uuid, display_name text, avatar_url text, member_role text, status text,
  invited_by_user_id uuid, invited_by_display_name text,
  payment_status text, payment_amount numeric, payment_reference text,
  payment_channel text, payment_intent_id text,
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
    tm.payment_channel, tm.payment_intent_id,
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

commit;
