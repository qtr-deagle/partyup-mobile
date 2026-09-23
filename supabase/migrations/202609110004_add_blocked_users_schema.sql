begin;

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self check (blocker_id <> blocked_id),
  constraint blocked_users_unique unique (blocker_id, blocked_id)
);

create index if not exists blocked_users_blocker_idx on public.blocked_users(blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

-- Only the blocker (or staff) can see/insert/delete their own block rows --
-- the blocked person cannot query this table to discover they're blocked,
-- mirroring the friend_requests/reports privacy posture.
drop policy if exists "blocked users own access" on public.blocked_users;
create policy "blocked users own access"
on public.blocked_users
for all
to authenticated
using (blocker_id = auth.uid() or public.is_staff_or_admin())
with check (blocker_id = auth.uid() or public.is_staff_or_admin());

create or replace function public.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

commit;
