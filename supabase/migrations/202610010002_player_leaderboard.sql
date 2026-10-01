begin;

-- Individual leaderboard across all guilds (travelers + Guild Leaders; admins
-- excluded). Same point rule as get_guild_leaderboard: earned rows only,
-- refunds don't count.
create or replace function public.get_player_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  guild_id uuid,
  guild_name text,
  guild_emblem text,
  guild_color text,
  points bigint,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select
      e.user_id,
      sum(e.amount) filter (where e.created_at >= public.guild_period_start(p_period)) as period_points,
      sum(e.amount) as all_points
    from public.guild_point_events e
    where e.amount > 0 and e.reason <> 'redemption_refund'
    group by e.user_id
  )
  select
    p.id, p.display_name, p.avatar_url, p.role,
    g.id, g.name, g.emblem, g.color,
    coalesce(earned.period_points, 0)::bigint,
    coalesce(earned.all_points, 0)::bigint
  from earned
  join public.profiles p on p.id = earned.user_id
  left join public.guild_members gm on gm.user_id = p.id
  left join public.guilds g on g.id = gm.guild_id
  where p.role in ('traveler', 'guild_leader')
    and coalesce(earned.period_points, 0) > 0
  order by 9 desc, 10 desc, p.display_name
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_player_leaderboard(text, int) to authenticated;

commit;
