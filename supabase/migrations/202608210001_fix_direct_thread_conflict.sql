begin;

-- The original index was partial, so ON CONFLICT (direct_key) could not infer it.
drop index if exists public.chat_threads_direct_key_idx;
create unique index if not exists chat_threads_direct_key_unique_idx
on public.chat_threads(direct_key);

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

commit;
