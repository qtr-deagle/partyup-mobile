-- Vehicle details and rules:
--   * vehicle_type + seat_capacity (seats including the driver), and a trip
--     can't offer more rider seats than the car holds;
--   * registration_expiry (OR/CR); new carpools need an unexpired one. An
--     approved car whose registration expired may be edited, which drops it
--     back to 'unverified' so the renewed OR/CR is reviewed again;
--   * one account can't add the same plate twice, and two accounts can't both
--     submit the same plate as owned (borrowing a family car stays possible);
--   * a car on an upcoming or ongoing trip can't be removed;
--   * get_trip_vehicle: what riders see so they get into the right car
--     (plate only for accepted members).
-- Existing vehicles keep null type/seats/expiry and aren't blocked by them.

begin;

alter table public.vehicles
  add column if not exists vehicle_type text
    check (vehicle_type is null or vehicle_type in ('sedan', 'hatchback', 'suv', 'mpv', 'van', 'pickup')),
  add column if not exists seat_capacity int
    check (seat_capacity is null or seat_capacity between 2 and 15),
  add column if not exists registration_expiry date;

-- "ABC 1234", "abc-1234" and "ABC1234" are the same plate.
create or replace function public.normalize_plate(p_plate text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

create or replace function public.guard_vehicle_plate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plate text := public.normalize_plate(new.plate_number);
begin
  if v_plate is null then
    return new;
  end if;

  if (tg_op = 'INSERT' or new.plate_number is distinct from old.plate_number)
    and exists (
      select 1 from public.vehicles v
      where v.user_id = new.user_id and v.id <> new.id and public.normalize_plate(v.plate_number) = v_plate
    ) then
    raise exception 'You already added a vehicle with plate %', upper(new.plate_number);
  end if;

  -- Submitting as owned while another account has the same plate as owned.
  if tg_op = 'UPDATE'
    and new.verification_status = 'pending'
    and old.verification_status is distinct from 'pending'
    and new.ownership_type = 'owned'
    and exists (
      select 1 from public.vehicles v
      where v.user_id <> new.user_id
        and v.ownership_type = 'owned'
        and v.verification_status in ('pending', 'approved')
        and public.normalize_plate(v.plate_number) = v_plate
    ) then
    raise exception 'Plate % is already registered to another owner on PartyUp. If you are borrowing it, choose "Borrowed". If it''s yours, contact support.', upper(new.plate_number);
  end if;

  return new;
end;
$$;

drop trigger if exists guard_vehicle_plate on public.vehicles;
create trigger guard_vehicle_plate
before insert or update on public.vehicles
for each row execute function public.guard_vehicle_plate();

-- Same as 202610030009 plus the new columns. An approved car with an
-- expired registration may be edited; doing so resets it to 'unverified'
-- (never a silent date bump on a verified car).
create or replace function public.guard_vehicle_verification_edits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_registration_lapsed boolean;
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' then
      raise exception 'New vehicles must start as unverified';
    end if;
    if new.ai_flag is not null or new.ai_checked_at is not null then
      raise exception 'AI check results are set by PartyUp';
    end if;
    return new;
  end if;

  if new.ai_plate_detected is distinct from old.ai_plate_detected
    or new.ai_plate_match is distinct from old.ai_plate_match
    or new.ai_orcr_plate_match is distinct from old.ai_orcr_plate_match
    or new.ai_owner_match is distinct from old.ai_owner_match
    or new.ai_flag is distinct from old.ai_flag
    or new.ai_error is distinct from old.ai_error
    or new.ai_checked_at is distinct from old.ai_checked_at then
    raise exception 'AI check results are set by PartyUp';
  end if;

  v_registration_lapsed := old.verification_status = 'approved'
    and old.registration_expiry is not null
    and old.registration_expiry < current_date;

  if v_registration_lapsed and new.verification_status = 'approved' and (
    new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.year is distinct from old.year
    or new.color is distinct from old.color
    or new.plate_number is distinct from old.plate_number
    or new.vehicle_type is distinct from old.vehicle_type
    or new.seat_capacity is distinct from old.seat_capacity
    or new.registration_expiry is distinct from old.registration_expiry
  ) then
    new.verification_status := 'unverified';
    return new;
  end if;

  if old.verification_status in ('pending', 'approved') and (
    new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.year is distinct from old.year
    or new.color is distinct from old.color
    or new.plate_number is distinct from old.plate_number
    or new.vehicle_type is distinct from old.vehicle_type
    or new.seat_capacity is distinct from old.seat_capacity
    or new.registration_expiry is distinct from old.registration_expiry
    or new.ownership_type is distinct from old.ownership_type
    or new.exterior_image_path is distinct from old.exterior_image_path
    or new.orcr_image_path is distinct from old.orcr_image_path
    or new.plate_image_path is distinct from old.plate_image_path
    or new.authorization_letter_path is distinct from old.authorization_letter_path
    or new.owner_id_front_path is distinct from old.owner_id_front_path
    or new.owner_id_back_path is distinct from old.owner_id_back_path
    or new.owner_signatures_path is distinct from old.owner_signatures_path
  ) then
    raise exception 'This vehicle can''t be edited while it is under review or verified';
  end if;

  if new.verification_status is distinct from old.verification_status
    and not (
      old.verification_status in ('unverified', 'rejected')
      and new.verification_status = 'pending'
    ) then
    raise exception 'Only admins can change a vehicle''s verification status';
  end if;

  if new.reviewer_id is distinct from old.reviewer_id
    or new.reviewer_notes is distinct from old.reviewer_notes
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Only admins can change review details';
  end if;

  return new;
end;
$$;

-- Keep a car that's on an upcoming or ongoing trip.
create or replace function public.guard_vehicle_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.trips t
    where t.vehicle_id = old.id and t.status in ('draft', 'open', 'full', 'ongoing')
  ) then
    raise exception 'This vehicle is on an upcoming or ongoing trip. Finish or cancel that trip first.';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_vehicle_delete on public.vehicles;
create trigger guard_vehicle_delete
before delete on public.vehicles
for each row execute function public.guard_vehicle_delete();

-- Rider seats must fit the car (seat_capacity counts the driver), and a new
-- carpool needs an unexpired registration when one is on file.
create or replace function public.guard_trip_vehicle_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles;
begin
  if new.vehicle_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.vehicle_id is not distinct from old.vehicle_id
    and new.seats_total is not distinct from old.seats_total then
    return new;
  end if;

  select * into v_vehicle from public.vehicles where id = new.vehicle_id;
  if not found then
    return new;
  end if;

  if v_vehicle.seat_capacity is not null and new.seats_total is not null
    and new.seats_total > v_vehicle.seat_capacity - 1 then
    raise exception 'Your % seats % including you, so you can offer at most % rider seats.',
      v_vehicle.make || ' ' || v_vehicle.model, v_vehicle.seat_capacity, v_vehicle.seat_capacity - 1;
  end if;

  if tg_op = 'INSERT' and v_vehicle.registration_expiry is not null and v_vehicle.registration_expiry < current_date then
    raise exception 'The registration (OR/CR) of your % expired. Update it in My Vehicles to create carpools.',
      v_vehicle.make || ' ' || v_vehicle.model;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_trip_vehicle_limits on public.trips;
create trigger guard_trip_vehicle_limits
before insert or update of vehicle_id, seats_total on public.trips
for each row execute function public.guard_trip_vehicle_limits();

-- The car riders should look for. Plate only for accepted members (and the
-- driver), so strangers browsing can't collect plates.
create or replace function public.get_trip_vehicle(p_trip_id uuid)
returns table (
  make text,
  model text,
  year int,
  color text,
  vehicle_type text,
  seat_capacity int,
  plate_number text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.make,
    v.model,
    v.year,
    v.color,
    v.vehicle_type,
    v.seat_capacity,
    case when t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin()
      then v.plate_number end
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id
  where t.id = p_trip_id and auth.uid() is not null;
$$;
grant execute on function public.get_trip_vehicle(uuid) to authenticated;

commit;
