begin;

-- =====================================================================
-- Anti-fake check for driver's licenses: the QR on the back of an LTO
-- license holds readable details. The app scans it live (camera, never from
-- an image) and verify-vehicle-ai compares it with the printed card and the
-- driver's legal name. The license number also stops one license being used
-- on two accounts. There is no public LTO API, so this catches edited
-- photos and borrowed licenses, not a perfect forgery -- admins still decide.
-- =====================================================================

alter table public.driver_licenses
  add column if not exists qr_data text check (qr_data is null or char_length(qr_data) <= 2000),
  add column if not exists license_number text,
  add column if not exists ai_qr_match boolean;

-- One license per account. Only the edge function (service role) sets
-- license_number; a duplicate makes its write fail and it flags mismatch.
create unique index if not exists driver_licenses_license_number_unique
  on public.driver_licenses (upper(regexp_replace(license_number, '[^A-Za-z0-9]', '', 'g')))
  where license_number is not null and status <> 'rejected';

-- QR is now required for both ways of adding a license.
drop function if exists public.use_verified_id_as_license();
drop function if exists public.submit_driver_license(text, text);

create or replace function public.use_verified_id_as_license(p_qr_data text)
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

  if trim(coalesce(p_qr_data, '')) = '' or char_length(p_qr_data) > 2000 then
    raise exception 'Scan the QR code on the back of your license';
  end if;

  select * into v_id from public.id_verifications iv
  where iv.id = public.get_verified_id_license();
  if v_id.id is null or v_id.front_image_path is null then
    raise exception 'Your verified ID is not a driver''s license. Take a photo of your license instead.';
  end if;

  insert into public.driver_licenses (
    user_id, source, id_verification_id, front_image_path, back_image_path, status, qr_data,
    reviewer_id, submitted_at, reviewed_at
  )
  values (
    auth.uid(), 'id_verification', v_id.id, v_id.front_image_path, v_id.back_image_path, 'approved', p_qr_data,
    v_id.reviewer_id, now(), coalesce(v_id.reviewed_at, now())
  )
  on conflict (user_id) do update set
    source = excluded.source, id_verification_id = excluded.id_verification_id,
    front_image_path = excluded.front_image_path, back_image_path = excluded.back_image_path,
    status = excluded.status, qr_data = excluded.qr_data, license_number = null, ai_qr_match = null,
    expiry_date = null, restriction_codes = '{}',
    ai_name_match = null, ai_flag = null, ai_error = null, ai_checked_at = null,
    reviewer_id = excluded.reviewer_id, reviewer_notes = null,
    submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at
  returning * into v_license;

  return v_license;
end;
$$;

grant execute on function public.use_verified_id_as_license(text) to authenticated;

create or replace function public.submit_driver_license(p_front_path text, p_back_path text, p_qr_data text)
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

  if coalesce(p_front_path, '') not like auth.uid()::text || '/%'
    or coalesce(p_back_path, '') not like auth.uid()::text || '/%' then
    raise exception 'Invalid license photos';
  end if;

  if trim(coalesce(p_qr_data, '')) = '' or char_length(p_qr_data) > 2000 then
    raise exception 'Scan the QR code on the back of your license';
  end if;

  if public.has_valid_driver_license(auth.uid()) then
    raise exception 'Your driver''s license is already verified';
  end if;

  insert into public.driver_licenses (user_id, source, front_image_path, back_image_path, status, qr_data, submitted_at)
  values (auth.uid(), 'upload', p_front_path, p_back_path, 'pending', p_qr_data, now())
  on conflict (user_id) do update set
    source = 'upload', id_verification_id = null,
    front_image_path = excluded.front_image_path, back_image_path = excluded.back_image_path,
    status = 'pending', qr_data = excluded.qr_data, license_number = null, ai_qr_match = null,
    expiry_date = null, restriction_codes = '{}',
    ai_name_match = null, ai_flag = null, ai_error = null, ai_checked_at = null,
    reviewer_id = null, reviewer_notes = null, submitted_at = now(), reviewed_at = null
  returning * into v_license;

  return v_license;
end;
$$;

grant execute on function public.submit_driver_license(text, text, text) to authenticated;

commit;
