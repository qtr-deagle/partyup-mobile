begin;

-- Reusable off-platform payment handles a driver shares with riders. Payment
-- itself never passes through PartyUp (GCash/PayMaya settle directly between
-- rider and driver) -- this is just where riders find where to send money.
alter table public.profiles
  add column if not exists gcash_handle text,
  add column if not exists paymaya_handle text;

-- Driver sets a fixed total cost for the trip; price_per_person becomes a
-- live, trigger-maintained value (see recompute_trip_fare below) instead of
-- driver input, so referring friends into the same trip mechanically lowers
-- everyone's share.
alter table public.trips
  add column if not exists total_cost numeric(10,2) check (total_cost is null or total_cost > 0),
  add column if not exists invite_code text unique;

alter table public.trip_members
  add column if not exists invited_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid')),
  add column if not exists payment_amount numeric(10,2),
  add column if not exists payment_reference text,
  add column if not exists payment_reported_at timestamptz,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists last_payment_id uuid references public.payment_history(id) on delete set null;

alter table public.payment_history
  add column if not exists trip_member_id uuid references public.trip_members(id) on delete set null,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;

-- Keeps trips.price_per_person / seats_available / status in sync with the
-- live accepted-rider headcount. A rider's fare is NOT locked when they join
-- -- it stays live until report_payment() snapshots it -- so inviting a
-- friend before paying is the rational, win-win move for everyone already in
-- the trip.
create or replace function public.recompute_trip_fare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_rider_count int;
  v_total_cost numeric(10,2);
  v_seats_total int;
begin
  if TG_TABLE_NAME = 'trips' then
    v_trip_id := new.id;
  elsif TG_OP = 'DELETE' then
    v_trip_id := old.trip_id;
  else
    v_trip_id := new.trip_id;
  end if;

  select count(*) into v_rider_count
  from public.trip_members
  where trip_id = v_trip_id and member_role = 'member' and status = 'accepted';

  select total_cost, seats_total into v_total_cost, v_seats_total
  from public.trips where id = v_trip_id;

  update public.trips
  set
    price_per_person = case when v_total_cost is null then null else round(v_total_cost / greatest(v_rider_count, 1), 2) end,
    seats_available = case when v_seats_total is null then null else greatest(v_seats_total - v_rider_count, 0) end,
    status = case
      when v_seats_total is not null and (v_seats_total - v_rider_count) <= 0 and status = 'open' then 'full'
      when v_seats_total is not null and (v_seats_total - v_rider_count) > 0 and status = 'full' then 'open'
      else status
    end
  where id = v_trip_id;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists recompute_trip_fare_on_member_change on public.trip_members;
create trigger recompute_trip_fare_on_member_change
after insert or update or delete on public.trip_members
for each row execute function public.recompute_trip_fare();

drop trigger if exists recompute_trip_fare_on_cost_change on public.trips;
create trigger recompute_trip_fare_on_cost_change
after update of total_cost on public.trips
for each row execute function public.recompute_trip_fare();

commit;
