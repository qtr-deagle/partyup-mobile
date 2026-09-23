begin;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Blocking implies "we are no longer connected" -- auto-cancel any pending
  -- or accepted friend relationship, mirroring remove_friend's direct-delete
  -- style.
  delete from public.friend_requests
  where status in ('pending', 'accepted')
    and ((requester_id = auth.uid() and recipient_id = p_user_id)
      or (requester_id = p_user_id and recipient_id = auth.uid()));
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.blocked_users
  where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.list_blocked_users()
returns table (blocked_id uuid, display_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.list_blocked_users() to authenticated;

-- Single-profile fetch that bypasses the block filter added to
-- search_profiles (so a blocked profile can still be opened/unblocked) and
-- exposes block-state flags. Also replaces the previous approach of deriving
-- a single profile by scanning search_profiles('') client-side, which
-- silently failed past its 50-row limit.
create or replace function public.get_profile_by_id(p_user_id uuid)
returns table (
  id uuid, display_name text, avatar_url text, interests text[], bio text, date_of_birth date,
  verification_status text, city text, country text, trust_score numeric, trust_count bigint,
  updated_at timestamptz, is_blocked_by_me boolean, has_blocked_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.avatar_url, p.interests, p.bio, p.date_of_birth, p.verification_status, p.city, p.country,
    trust.avg_rating, trust.rating_count, p.updated_at,
    exists (select 1 from public.blocked_users b where b.blocker_id = auth.uid() and b.blocked_id = p.id) as is_blocked_by_me,
    exists (select 1 from public.blocked_users b where b.blocker_id = p.id and b.blocked_id = auth.uid()) as has_blocked_me
  from public.profiles p
  left join lateral (
    select avg(f.rating)::numeric(3,2) as avg_rating, count(*) as rating_count
    from public.feedback f where f.target_user_id = p.id
  ) trust on true
  where p.id = p_user_id and p.is_active;
$$;

grant execute on function public.get_profile_by_id(uuid) to authenticated;

commit;
