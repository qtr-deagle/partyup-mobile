begin;

-- =====================================================================
-- Gmail-only accounts for now (keeps out temp-mail signups). The sign-up
-- screen checks this too; this trigger stops anyone calling auth.signUp
-- directly. Existing accounts are untouched (insert / email change only).
-- =====================================================================

create or replace function public.enforce_gmail_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  if new.email is not null
    and lower(split_part(new.email, '@', 2)) not in ('gmail.com', 'googlemail.com') then
    raise exception 'Please use a Gmail address (@gmail.com) to sign up.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_gmail_signup on auth.users;
create trigger enforce_gmail_signup
before insert or update of email on auth.users
for each row execute function public.enforce_gmail_signup();

commit;
