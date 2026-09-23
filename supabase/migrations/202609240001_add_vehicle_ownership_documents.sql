begin;

-- Borrowed vehicles need proof the real owner allowed it: a letter of
-- authorization, both sides of the owner's valid ID, and one photo of the
-- owner's 3 specimen signatures. Owned vehicles leave these null.
alter table public.vehicles
  add column if not exists ownership_type text not null default 'owned',
  add column if not exists authorization_letter_path text,
  add column if not exists owner_id_front_path text,
  add column if not exists owner_id_back_path text,
  add column if not exists owner_signatures_path text;

alter table public.vehicles drop constraint if exists vehicles_ownership_type_check;
alter table public.vehicles
  add constraint vehicles_ownership_type_check check (ownership_type in ('owned', 'borrowed'));

commit;
