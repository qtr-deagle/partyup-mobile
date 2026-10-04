begin;

-- =====================================================================
-- Driver's license for carpool drivers. One license per person (not per
-- car): for a borrowed car it's the borrower's license that counts.
--   * Drivers whose approved ID verification WAS a driver's license reuse
--     it in one tap (use_verified_id_as_license) -- already admin-approved.
--   * Everyone else takes camera photos of the front/back in Verify Vehicle
--     (submit_driver_license); the admin approves it with the vehicle.
--   * Creating a carpool needs an approved, unexpired license.
-- The verify-vehicle-ai edge function reads the license (name, expiry,
-- restriction codes) and writes the ai_* / expiry columns as service role.
-- =====================================================================

create table if not exists public.driver_licenses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null check (source in ('id_verification', 'upload')),
  id_verification_id uuid references public.id_verifications(id) on delete set null,
  -- id_verification: paths in the id-verifications bucket; upload: vehicle-verifications.
  front_image_path text not null,
  back_image_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  expiry_date date,
  restriction_codes text[] not null default '{}'::text[],
  ai_name_match boolean,
  ai_flag text check (ai_flag is null or ai_flag in ('passed', 'needs_review', 'mismatch', 'error')),
  ai_error text,
  ai_checked_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.driver_licenses enable row level security;

-- Reads only; every write goes through the security-definer RPCs below or
-- the edge function (service role).
drop policy if exists "driver licenses own or admin read" on public.driver_licenses;
create policy "driver licenses own or admin read" on public.driver_licenses for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.driver_licenses to authenticated;
grant all on public.driver_licenses to service_role;

-- Approved and not known to be expired (an unread expiry counts as valid;
-- the admin approved it). p_on is the date it must still be valid on.
create or replace function public.has_valid_driver_license(p_user_id uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.driver_licenses dl
    where dl.user_id = p_user_id
      and dl.status = 'approved'
      and (dl.expiry_date is null or dl.expiry_date >= p_on)
  );
$$;

grant execute on function public.has_valid_driver_license(uuid, date) to authenticated;

-- Is the caller's approved ID verification a driver's license?
create or replace function public.get_verified_id_license()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select iv.id
  from public.id_verifications iv
  where iv.user_id = auth.uid() and iv.status = 'approved' and iv.document_type = 'driver_license'
  order by iv.reviewed_at desc nulls last, iv.submitted_at desc
  limit 1;
$$;

grant execute on function public.get_verified_id_license() to authenticated;

create or replace function public.use_verified_id_as_license()
returns public.driver_licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id public.id_verifications;
  v_license public.driver_licenses;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_id from public.id_verifications iv
  where iv.id = public.get_verified_id_license();
  if v_id.id is null or v_id.front_image_path is null then
    raise exception 'Your verified ID is not a driver''s license. Take a photo of your license instead.';
  end if;

  insert into public.driver_licenses (
    user_id, source, id_verification_id, front_image_path, back_image_path, status,
    expiry_date, restriction_codes, ai_name_match, ai_flag, ai_error, ai_checked_at,
    reviewer_id, reviewer_notes, submitted_at, reviewed_at
  )
  values (
    auth.uid(), 'id_verification', v_id.id, v_id.front_image_path, v_id.back_image_path, 'approved',
    null, '{}', null, null, null, null,
    v_id.reviewer_id, null, now(), coalesce(v_id.reviewed_at, now())
  )
  on conflict (user_id) do update set
    source = excluded.source, id_verification_id = excluded.id_verification_id,
    front_image_path = excluded.front_image_path, back_image_path = excluded.back_image_path,
    status = excluded.status, expiry_date = null, restriction_codes = '{}',
    ai_name_match = null, ai_flag = null, ai_error = null, ai_checked_at = null,
    reviewer_id = excluded.reviewer_id, reviewer_notes = null,
    submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at
  returning * into v_license;

  return v_license;
end;
$$;

grant execute on function public.use_verified_id_as_license() to authenticated;

create or replace function public.submit_driver_license(p_front_path text, p_back_path text)
returns public.driver_licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.driver_licenses;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Photos must be the caller's own uploads (vehicle-verifications/<uid>/...).
  if coalesce(p_front_path, '') not like auth.uid()::text || '/%'
    or coalesce(p_back_path, '') not like auth.uid()::text || '/%' then
    raise exception 'Invalid license photos';
  end if;

  if public.has_valid_driver_license(auth.uid()) then
    raise exception 'Your driver''s license is already verified';
  end if;

  insert into public.driver_licenses (user_id, source, front_image_path, back_image_path, status, submitted_at)
  values (auth.uid(), 'upload', p_front_path, p_back_path, 'pending', now())
  on conflict (user_id) do update set
    source = 'upload', id_verification_id = null,
    front_image_path = excluded.front_image_path, back_image_path = excluded.back_image_path,
    status = 'pending', expiry_date = null, restriction_codes = '{}',
    ai_name_match = null, ai_flag = null, ai_error = null, ai_checked_at = null,
    reviewer_id = null, reviewer_notes = null, submitted_at = now(), reviewed_at = null
  returning * into v_license;

  return v_license;
end;
$$;

grant execute on function public.submit_driver_license(text, text) to authenticated;

create or replace function public.review_driver_license(p_user_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can review driver''s licenses';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  update public.driver_licenses
  set status = p_decision, reviewer_id = auth.uid(), reviewer_notes = p_notes, reviewed_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'Driver''s license not found';
  end if;

  insert into public.notifications (user_id, type, title, message)
  values (
    p_user_id, 'system',
    case when p_decision = 'approved' then 'Driver''s license verified' else 'Driver''s license rejected' end,
    case when p_decision = 'approved' then 'Your driver''s license is verified. You can create carpools.'
         else coalesce('Your driver''s license was rejected: ' || p_notes, 'Your driver''s license was rejected. Please retake clearer photos.') end
  );
end;
$$;

grant execute on function public.review_driver_license(uuid, text, text) to authenticated;

-- Vehicle review also decides the owner's pending uploaded license (it was
-- submitted together with the car).
create or replace function public.review_vehicle_verification(
  p_vehicle_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review vehicle verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if v_user_id is null then
    raise exception 'Vehicle not found';
  end if;

  update public.vehicles
  set
    verification_status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_vehicle_id;

  update public.driver_licenses
  set status = p_decision, reviewer_id = auth.uid(), reviewer_notes = p_notes, reviewed_at = now()
  where user_id = v_user_id and status = 'pending';

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'Vehicle verification approved' else 'Vehicle verification rejected' end,
    case
      when p_decision = 'approved' then 'Your vehicle has been verified. You can now use it to create carpool trips!'
      else coalesce('Your vehicle verification was rejected: ' || p_notes, 'Your vehicle verification was rejected. Please resubmit clearer photos.')
    end
  );
end;
$$;

-- Carpools need a valid license, checked on the departure date. A trigger
-- (instead of another create_trip rewrite) covers every way a trip is made.
create or replace function public.require_driver_license_for_carpool()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trip_type <> 'carpool' then
    return new;
  end if;

  if not exists (select 1 from public.driver_licenses where user_id = new.creator_id and status = 'approved') then
    raise exception 'Add your driver''s license before creating a carpool';
  end if;

  if not public.has_valid_driver_license(new.creator_id, coalesce(new.start_at::date, current_date)) then
    raise exception 'Your driver''s license has expired. Upload your renewed license.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_driver_license_for_carpool on public.trips;
create trigger require_driver_license_for_carpool
before insert on public.trips
for each row execute function public.require_driver_license_for_carpool();

commit;
