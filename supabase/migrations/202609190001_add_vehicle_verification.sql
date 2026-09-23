begin;

alter table public.vehicles
  add column if not exists exterior_image_path text,
  add column if not exists orcr_image_path text,
  add column if not exists plate_image_path text,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewer_notes text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

create index if not exists vehicles_verification_status_idx on public.vehicles(verification_status);

commit;
