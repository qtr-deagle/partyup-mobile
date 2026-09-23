begin;

-- The "vehicles own access" RLS policy lets a traveler update any column of
-- their own vehicle. This trigger narrows that for non-staff:
--   * a vehicle under review ('pending') or verified ('approved') can't have
--     its details or verification documents changed, so staff always approve
--     exactly what they reviewed;
--   * travelers can't set their own verification outcome -- the only status
--     change they may make is submitting ('unverified'/'rejected' -> 'pending').
-- Staff/admin (including review_vehicle_verification, which runs as the
-- calling staff user) are unaffected.
create or replace function public.guard_vehicle_verification_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_staff_or_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' then
      raise exception 'New vehicles must start as unverified';
    end if;
    return new;
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
    raise exception 'Only staff can change a vehicle''s verification status';
  end if;

  if new.reviewer_id is distinct from old.reviewer_id
    or new.reviewer_notes is distinct from old.reviewer_notes
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Only staff can change review details';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_vehicle_verification_edits on public.vehicles;
create trigger guard_vehicle_verification_edits
before insert or update on public.vehicles
for each row execute function public.guard_vehicle_verification_edits();

commit;
