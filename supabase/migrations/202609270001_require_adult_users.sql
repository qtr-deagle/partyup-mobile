begin;

-- PartyUp is 18+ only. The sign-up screen checks this, but signUp() can be
-- called straight against the API with any date_of_birth in the metadata,
-- so the rule lives here too. Raising inside the profiles insert aborts
-- handle_new_user() and with it the auth.users insert, so an underage
-- sign-up never gets an account at all.
--
-- Checked only when date_of_birth is set or changed, so accounts created
-- before this rule can still be updated (see the query at the bottom).
create or replace function public.enforce_adult_date_of_birth()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Users are in the Philippines; don't let UTC shift a birthday by a day.
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if new.date_of_birth is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.date_of_birth is not distinct from old.date_of_birth then
    return new;
  end if;

  if new.date_of_birth > (v_today - interval '18 years')::date then
    raise exception 'You must be at least 18 years old to use PartyUp.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_adult_date_of_birth on public.profiles;
create trigger enforce_adult_date_of_birth
before insert or update of date_of_birth on public.profiles
for each row execute function public.enforce_adult_date_of_birth();

commit;

-- To find accounts that signed up underage before this migration:
-- select id, display_name, email, date_of_birth
-- from public.profiles
-- where date_of_birth > ((now() at time zone 'Asia/Manila')::date - interval '18 years')::date;
