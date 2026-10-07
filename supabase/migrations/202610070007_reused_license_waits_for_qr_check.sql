begin;

-- Reusing a verified-ID driver's license (scan its QR, no new photos) used to
-- insert the license as 'approved' on the spot. The QR was saved but never
-- compared with the ID, so any license's QR was accepted, and a failed or
-- skipped AI check left it approved.
--
-- Now it starts 'pending'. verify-vehicle-ai (run by the app right after)
-- compares the QR with the ID photos -- license number, name, expiry -- and
-- approves it only when every check passes; anything else waits for an admin
-- in the vehicle queue, like an uploaded license.
--
-- Same function as 202610030012 apart from status / reviewer / reviewed_at.
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
    auth.uid(), 'id_verification', v_id.id, v_id.front_image_path, v_id.back_image_path, 'pending', p_qr_data,
    null, now(), null
  )
  on conflict (user_id) do update set
    source = excluded.source, id_verification_id = excluded.id_verification_id,
    front_image_path = excluded.front_image_path, back_image_path = excluded.back_image_path,
    status = excluded.status, qr_data = excluded.qr_data, license_number = null, ai_qr_match = null,
    expiry_date = null, restriction_codes = '{}',
    ai_name_match = null, ai_flag = null, ai_error = null, ai_checked_at = null,
    reviewer_id = null, reviewer_notes = null,
    submitted_at = excluded.submitted_at, reviewed_at = null
  returning * into v_license;

  return v_license;
end;
$$;

grant execute on function public.use_verified_id_as_license(text) to authenticated;

commit;
