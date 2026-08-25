begin;

create or replace function public.remove_friend(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.friend_requests
  where status = 'accepted'
    and ((requester_id = auth.uid() and recipient_id = p_other_user_id)
      or (recipient_id = auth.uid() and requester_id = p_other_user_id));
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;

commit;
