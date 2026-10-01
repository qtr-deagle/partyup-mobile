begin;

-- Advisory Bulacan address check, populated by the verify-id-ai Edge Function
-- (Rekognition DetectText on the ID front/back). Like the face-match fields,
-- it never approves or rejects anything on its own; staff still decide.
alter table public.id_verifications
  add column if not exists ai_address_flag text,
  add column if not exists ai_detected_municipality text;

alter table public.id_verifications
  drop constraint if exists id_verifications_ai_address_flag_check;
alter table public.id_verifications
  add constraint id_verifications_ai_address_flag_check
  check (
    ai_address_flag is null or ai_address_flag in (
      'match',
      'other_bulacan_town',
      'bulacan_unknown_town',
      'not_bulacan',
      'not_found',
      'not_applicable',
      'error'
    )
  );

commit;
