begin;

-- Guild size: 10 at Level 1, +2 every 5 guild levels (Lv 6, 11, 16, 21),
-- up to 20 (leader included). Was 20 + 5 per level (202610010016). Keep in
-- sync with guildMemberCap() in lib/guilds.ts. Guild level = xp / 500 + 1, so
-- one +2 step per 2500 lifetime XP. Guilds already above their new cap keep
-- their members; they just can't take new ones until they level up.

create or replace function public.guild_member_cap(p_guild_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(20, 10 + 2 * (public.guild_lifetime_xp(p_guild_id) / 2500))::int;
$$;

commit;
