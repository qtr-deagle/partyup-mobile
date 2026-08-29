begin;

-- public.trusted_contacts already existed from the initial schema
-- (202608080001_partyup_initial_schema.sql) with columns name/phone/relationship/is_primary.
-- The previous migration's `create table if not exists` therefore no-op'd against that
-- older shape, leaving the new RPCs (which reference full_name, email, emergency_info,
-- alerts_enabled, verified) pointing at columns that don't exist. Evolve the existing
-- table in place instead of assuming a fresh create.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trusted_contacts' and column_name = 'name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trusted_contacts' and column_name = 'full_name'
  ) then
    alter table public.trusted_contacts rename column name to full_name;
  end if;
end;
$$;

alter table public.trusted_contacts
  add column if not exists email text,
  add column if not exists emergency_info text,
  add column if not exists alerts_enabled boolean not null default true,
  add column if not exists verified boolean not null default true;

alter table public.trusted_contacts
  drop constraint if exists trusted_contacts_relationship_check;

alter table public.trusted_contacts
  add constraint trusted_contacts_relationship_check
  check (relationship is null or relationship in ('Parent', 'Friend', 'Sibling', 'Spouse', 'Colleague', 'Guardian', 'Other'))
  not valid;

commit;
