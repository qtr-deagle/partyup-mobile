begin;

-- Records when a user accepted the Terms & Conditions during sign-up.
-- Sign-up only for now; sign-in does not check or re-prompt for this.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

commit;
