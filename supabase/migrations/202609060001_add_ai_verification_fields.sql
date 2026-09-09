begin;

-- Advisory AI pre-check fields, populated by the verify-id-ai Edge Function.
-- These never drive an automatic approve/reject decision on their own;
-- review_id_verification() remains the only path that can set status/verification_status.
alter table public.id_verifications
  add column if not exists ai_similarity_score numeric,
  add column if not exists ai_age_low int,
  add column if not exists ai_age_high int,
  add column if not exists ai_flag text,
  add column if not exists ai_underage_flag boolean not null default false,
  add column if not exists ai_error text,
  add column if not exists ai_processed_at timestamptz;

alter table public.id_verifications
  drop constraint if exists id_verifications_ai_flag_check;
alter table public.id_verifications
  add constraint id_verifications_ai_flag_check
  check (ai_flag is null or ai_flag in ('high_confidence', 'needs_review', 'low_similarity', 'error'));

commit;
