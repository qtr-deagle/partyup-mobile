begin;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (requester_id <> recipient_id)
);

create index if not exists friend_requests_requester_idx on public.friend_requests(requester_id, status);
create index if not exists friend_requests_recipient_idx on public.friend_requests(recipient_id, status);

create unique index if not exists friend_requests_active_pair_idx
on public.friend_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
where status in ('pending', 'accepted');

alter table public.chat_threads
  add column if not exists direct_key text;

create unique index if not exists chat_threads_direct_key_idx
on public.chat_threads(direct_key)
where direct_key is not null;

create or replace function public.set_friend_request_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_friend_requests_updated_at on public.friend_requests;
create trigger set_friend_requests_updated_at
before update on public.friend_requests
for each row execute function public.set_friend_request_updated_at();

create or replace function public.search_profiles(p_query text default '')
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  interests text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.interests
  from public.profiles p
  where p.is_active
    and p.id <> auth.uid()
    and (
      nullif(trim(p_query), '') is null
      or p.display_name ilike '%' || trim(p_query) || '%'
      or exists (
        select 1 from unnest(coalesce(p.interests, '{}'::text[])) interest
        where interest ilike '%' || trim(p_query) || '%'
      )
    )
  order by p.display_name asc
  limit 50;
$$;

grant execute on function public.search_profiles(text) to authenticated;

create or replace function public.send_friend_request(p_recipient_id uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.friend_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() = p_recipient_id then
    raise exception 'You cannot add yourself';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id and is_active) then
    raise exception 'User not found';
  end if;

  select * into result
  from public.friend_requests
  where least(requester_id, recipient_id) = least(auth.uid(), p_recipient_id)
    and greatest(requester_id, recipient_id) = greatest(auth.uid(), p_recipient_id)
    and status in ('pending', 'accepted')
  limit 1;

  if result.id is not null then
    return result;
  end if;

  insert into public.friend_requests (requester_id, recipient_id)
  values (auth.uid(), p_recipient_id)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_status text)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.friend_requests;
begin
  if p_status not in ('accepted', 'rejected', 'cancelled') then
    raise exception 'Invalid request status';
  end if;

  select * into result
  from public.friend_requests
  where id = p_request_id
    and status = 'pending'
    and (requester_id = auth.uid() or recipient_id = auth.uid());

  if result.id is null then
    raise exception 'Friend request not found';
  end if;

  if p_status = 'accepted' and result.recipient_id <> auth.uid() then
    raise exception 'Only the recipient can accept a request';
  end if;

  if p_status = 'cancelled' and result.requester_id <> auth.uid() then
    raise exception 'Only the requester can cancel a request';
  end if;

  update public.friend_requests
  set status = p_status, responded_at = now()
  where id = result.id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.respond_to_friend_request(uuid, text) to authenticated;

create or replace function public.create_or_get_direct_thread(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_id uuid;
  direct_key_value text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() = p_other_user_id then
    raise exception 'You cannot message yourself';
  end if;

  if not exists (
    select 1 from public.friend_requests
    where least(requester_id, recipient_id) = least(auth.uid(), p_other_user_id)
      and greatest(requester_id, recipient_id) = greatest(auth.uid(), p_other_user_id)
      and status in ('pending', 'accepted')
  ) then
    raise exception 'Send a friend request before messaging this user';
  end if;

  direct_key_value := least(auth.uid()::text, p_other_user_id::text) || ':' || greatest(auth.uid()::text, p_other_user_id::text);

  select id into thread_id from public.chat_threads where direct_key = direct_key_value;

  if thread_id is null then
    insert into public.chat_threads (created_by, thread_type, title, direct_key)
    values (auth.uid(), 'direct', null, direct_key_value)
    on conflict (direct_key) do update set direct_key = excluded.direct_key
    returning id into thread_id;

    insert into public.chat_participants (thread_id, user_id)
    values (thread_id, auth.uid()), (thread_id, p_other_user_id)
    on conflict (thread_id, user_id) do nothing;
  end if;

  return thread_id;
end;
$$;

grant execute on function public.create_or_get_direct_thread(uuid) to authenticated;

create or replace function public.list_direct_conversations()
returns table (
  thread_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  interests text[],
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    other.user_id,
    p.display_name,
    p.avatar_url,
    p.interests,
    latest.body,
    latest.created_at,
    (select count(*) from public.chat_messages unread where unread.thread_id = t.id and unread.sender_id <> auth.uid() and unread.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz))
  from public.chat_threads t
  join public.chat_participants me on me.thread_id = t.id and me.user_id = auth.uid()
  join public.chat_participants other on other.thread_id = t.id and other.user_id <> auth.uid()
  join public.profiles p on p.id = other.user_id
  left join lateral (
    select body, created_at from public.chat_messages m where m.thread_id = t.id order by m.created_at desc limit 1
  ) latest on true
  where t.thread_type = 'direct'
  order by latest.created_at desc nulls last, t.created_at desc;
$$;

grant execute on function public.list_direct_conversations() to authenticated;

create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants
  set last_read_at = now()
  where thread_id = p_thread_id and user_id = auth.uid();
$$;

grant execute on function public.mark_thread_read(uuid) to authenticated;

alter table public.friend_requests enable row level security;

drop policy if exists "friend requests own access" on public.friend_requests;
create policy "friend requests own access"
on public.friend_requests
for select
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid() or public.is_staff_or_admin());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests') then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;

commit;
