begin;

-- Trusted Circle contacts must be an existing app friend rather than a freeform
-- name/phone/email entry, so this links trusted_contacts to a real profile and
-- validates the friendship (accepted friend_requests row) on add.

alter table public.trusted_contacts
  add column if not exists contact_user_id uuid references public.profiles(id) on delete cascade;

alter table public.trusted_contacts
  drop column if exists full_name,
  drop column if exists phone,
  drop column if exists email,
  drop column if exists is_primary;

-- Any rows left over from the old freeform entry flow have no linked account and
-- can't be backfilled, so drop them rather than leave orphaned contacts behind.
delete from public.trusted_contacts where contact_user_id is null;

alter table public.trusted_contacts
  alter column contact_user_id set not null;

alter table public.trusted_contacts
  drop constraint if exists trusted_contacts_not_self;
alter table public.trusted_contacts
  add constraint trusted_contacts_not_self check (contact_user_id <> user_id);

create unique index if not exists trusted_contacts_user_contact_idx
  on public.trusted_contacts (user_id, contact_user_id);

drop function if exists public.add_trusted_contact(text, text, text, text, text);

create or replace function public.add_trusted_contact(
  p_contact_user_id uuid,
  p_relationship text,
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

  if p_contact_user_id = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;

  if p_relationship not in ('Parent', 'Friend', 'Sibling', 'Spouse', 'Colleague', 'Guardian', 'Other') then
    raise exception 'Invalid relationship';
  end if;

  if not exists (
    select 1 from public.friend_requests
    where least(requester_id, recipient_id) = least(auth.uid(), p_contact_user_id)
      and greatest(requester_id, recipient_id) = greatest(auth.uid(), p_contact_user_id)
      and status = 'accepted'
  ) then
    raise exception 'You can only add friends to your trusted circle';
  end if;

  insert into public.trusted_contacts (user_id, contact_user_id, relationship, emergency_info)
  values (auth.uid(), p_contact_user_id, p_relationship, nullif(trim(coalesce(p_emergency_info, '')), ''))
  on conflict (user_id, contact_user_id) do update
    set relationship = excluded.relationship,
        emergency_info = excluded.emergency_info
  returning * into v_contact;

  return v_contact;
end;
$$;

grant execute on function public.add_trusted_contact(uuid, text, text) to authenticated;

drop function if exists public.list_trusted_contacts();

create or replace function public.list_trusted_contacts()
returns table (
  id uuid,
  user_id uuid,
  contact_user_id uuid,
  display_name text,
  avatar_url text,
  phone text,
  email text,
  relationship text,
  emergency_info text,
  alerts_enabled boolean,
  verified boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tc.id,
    tc.user_id,
    tc.contact_user_id,
    p.display_name,
    p.avatar_url,
    p.phone,
    p.email,
    tc.relationship,
    tc.emergency_info,
    tc.alerts_enabled,
    tc.verified,
    tc.created_at
  from public.trusted_contacts tc
  join public.profiles p on p.id = tc.contact_user_id
  where tc.user_id = auth.uid()
  order by tc.created_at desc;
$$;

grant execute on function public.list_trusted_contacts() to authenticated;

commit;
