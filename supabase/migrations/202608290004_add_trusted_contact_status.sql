begin;

-- Being added to someone's Trusted Circle now requires the chosen friend's
-- confirmation, mirroring the friend_requests flow: the owner sends a request
-- (status 'pending'), and the invited friend confirms or declines it before
-- they can actually receive SOS alerts.

alter table public.trusted_contacts
  add column if not exists status text not null default 'pending' check (status in ('pending', 'accepted', 'declined'));

alter table public.trusted_contacts
  drop column if exists verified;

-- Existing rows were inserted directly (pre-confirmation flow); treat them as
-- already accepted so nobody loses a working trusted contact under the new model.
update public.trusted_contacts set status = 'accepted' where status = 'pending';

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

  insert into public.trusted_contacts (user_id, contact_user_id, relationship, emergency_info, status)
  values (auth.uid(), p_contact_user_id, p_relationship, nullif(trim(coalesce(p_emergency_info, '')), ''), 'pending')
  on conflict (user_id, contact_user_id) do update
    set relationship = excluded.relationship,
        emergency_info = excluded.emergency_info,
        status = case when public.trusted_contacts.status = 'declined' then 'pending' else public.trusted_contacts.status end
  returning * into v_contact;

  return v_contact;
end;
$$;

grant execute on function public.add_trusted_contact(uuid, text, text) to authenticated;

create or replace function public.respond_to_trusted_contact_request(p_contact_id uuid, p_status text)
returns public.trusted_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.trusted_contacts;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'Invalid status';
  end if;

  update public.trusted_contacts
  set status = p_status
  where id = p_contact_id
    and contact_user_id = auth.uid()
    and status = 'pending'
  returning * into v_contact;

  if v_contact.id is null then
    raise exception 'Trusted circle request not found';
  end if;

  return v_contact;
end;
$$;

grant execute on function public.respond_to_trusted_contact_request(uuid, text) to authenticated;

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
  status text,
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
    tc.status,
    tc.created_at
  from public.trusted_contacts tc
  join public.profiles p on p.id = tc.contact_user_id
  where tc.user_id = auth.uid()
  order by tc.created_at desc;
$$;

grant execute on function public.list_trusted_contacts() to authenticated;

create or replace function public.list_incoming_trusted_circle_requests()
returns table (
  id uuid,
  owner_id uuid,
  display_name text,
  avatar_url text,
  relationship text,
  emergency_info text,
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
    p.display_name,
    p.avatar_url,
    tc.relationship,
    tc.emergency_info,
    tc.created_at
  from public.trusted_contacts tc
  join public.profiles p on p.id = tc.user_id
  where tc.contact_user_id = auth.uid()
    and tc.status = 'pending'
  order by tc.created_at desc;
$$;

grant execute on function public.list_incoming_trusted_circle_requests() to authenticated;

commit;
