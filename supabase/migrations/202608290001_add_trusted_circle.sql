begin;

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  relationship text not null check (relationship in ('Parent', 'Friend', 'Sibling', 'Spouse', 'Colleague', 'Guardian', 'Other')),
  emergency_info text,
  alerts_enabled boolean not null default true,
  verified boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists trusted_contacts_user_id_created_at_idx
  on public.trusted_contacts (user_id, created_at desc);

alter table public.trusted_contacts enable row level security;

drop policy if exists "Users can view their own trusted contacts" on public.trusted_contacts;
create policy "Users can view their own trusted contacts"
  on public.trusted_contacts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can modify their own trusted contacts" on public.trusted_contacts;
create policy "Users can modify their own trusted contacts"
  on public.trusted_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.list_trusted_contacts()
returns setof public.trusted_contacts
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.trusted_contacts
  where user_id = auth.uid()
  order by created_at desc;
$$;

grant execute on function public.list_trusted_contacts() to authenticated;

create or replace function public.add_trusted_contact(
  p_full_name text,
  p_phone text,
  p_relationship text,
  p_email text default null,
  p_emergency_info text default null
)
returns public.trusted_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.trusted_contacts;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  if nullif(trim(p_phone), '') is null then
    raise exception 'Phone number is required';
  end if;

  if p_relationship not in ('Parent', 'Friend', 'Sibling', 'Spouse', 'Colleague', 'Guardian', 'Other') then
    raise exception 'Invalid relationship';
  end if;

  insert into public.trusted_contacts (user_id, full_name, phone, email, relationship, emergency_info)
  values (auth.uid(), trim(p_full_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''), p_relationship, nullif(trim(coalesce(p_emergency_info, '')), ''))
  returning * into v_contact;

  return v_contact;
end;
$$;

grant execute on function public.add_trusted_contact(text, text, text, text, text) to authenticated;

create or replace function public.set_trusted_contact_alerts(p_contact_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trusted_contacts
  set alerts_enabled = p_enabled
  where id = p_contact_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.set_trusted_contact_alerts(uuid, boolean) to authenticated;

create or replace function public.remove_trusted_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trusted_contacts
  where id = p_contact_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.remove_trusted_contact(uuid) to authenticated;

commit;
