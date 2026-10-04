begin;

-- =====================================================================
-- A driver's license used for ID verification can be reused for carpools
-- even when the user picked the wrong document type: verify-id-ai now reads
-- the ID text and sets ai_detected_license when it sees LTO license markers.
-- (Rows verified before this keep ai_detected_license null; only their
-- document_type counts.)
-- =====================================================================

alter table public.id_verifications
  add column if not exists ai_detected_license boolean;

create or replace function public.get_verified_id_license()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select iv.id
  from public.id_verifications iv
  where iv.user_id = auth.uid()
    and iv.status = 'approved'
    and (iv.document_type = 'driver_license' or iv.ai_detected_license is true)
  order by iv.reviewed_at desc nulls last, iv.submitted_at desc
  limit 1;
$$;

grant execute on function public.get_verified_id_license() to authenticated;

commit;
