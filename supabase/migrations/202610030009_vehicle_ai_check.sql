begin;

-- =====================================================================
-- Advisory AI pre-check for vehicle verification (verify-vehicle-ai edge
-- function, AWS Rekognition DetectText -- the same setup as verify-id-ai).
-- It reads the plate photo and the OR/CR, checks they match the declared
-- plate number, and checks the OR/CR owner name against the submitter's
-- legal name (or the owner's ID for borrowed vehicles). Admins still make
-- the decision; nothing here changes verification_status.
-- =====================================================================

alter table public.vehicles
  add column if not exists ai_plate_detected text,
  add column if not exists ai_plate_match boolean,
  add column if not exists ai_orcr_plate_match boolean,
  add column if not exists ai_owner_match boolean,
  add column if not exists ai_flag text check (ai_flag is null or ai_flag in ('passed', 'needs_review', 'mismatch', 'error')),
  add column if not exists ai_error text,
  add column if not exists ai_checked_at timestamptz;

-- Same guard as 202610010009, plus: only the edge function (service role)
-- writes the ai_* columns, so owners can't mark their own car as passed.
create or replace function public.guard_vehicle_verification_edits()
returns trigger
language plpgsql
set search_path = public
as $$
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

  if old.verification_status in ('pending', 'approved') and (
    new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.year is distinct from old.year
    or new.color is distinct from old.color
    or new.plate_number is distinct from old.plate_number
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
    and not (old.verification_status in ('unverified', 'rejected') and new.verification_status = 'pending') then
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

commit;
