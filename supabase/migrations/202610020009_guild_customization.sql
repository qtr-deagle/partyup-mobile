begin;

-- Guild customization: 12 more emblems, any (readable) custom color, and
-- officers may edit the guild's look. Keep in sync with GUILD_EMBLEMS /
-- isReadableOnWhite() in lib/guilds.ts and the website's GuildEmblem.

-- ---------------------------------------------------------------------
-- 1. Emblems. The original check was declared inline (202610010001), so
--    look its name up instead of guessing.
-- ---------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.guilds'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%emblem%'
  loop
    execute format('alter table public.guilds drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.guilds
  add constraint guilds_emblem_check check (emblem in (
    'shield', 'flame', 'mountain', 'compass', 'star', 'wave', 'leaf', 'crown',
    'car', 'bike', 'tent', 'trees', 'sun', 'palm', 'anchor', 'plane', 'camera', 'utensils', 'heart', 'bolt'
  ));

-- ---------------------------------------------------------------------
-- 2. Color readability. The Guild Hall banner and the emblem put white on
--    the guild color, so it must give white at least 3:1 WCAG contrast
--    (relative luminance <= 0.30). All 8 preset colors pass.
-- ---------------------------------------------------------------------
create or replace function public.guild_color_readable(p_color text)
returns boolean
language sql
immutable
as $$
  with channels as (
    select (('x' || substr(p_color, i, 2))::bit(8)::int / 255.0) as c, w
    from (values (2, 0.2126), (4, 0.7152), (6, 0.0722)) as v(i, w)
    where p_color ~ '^#[0-9A-Fa-f]{6}$'
  )
  select coalesce(
    (select 1.05 / (sum(w * case when c <= 0.03928 then c / 12.92 else power((c + 0.055) / 1.055, 2.4) end) + 0.05) >= 3
     from channels having count(*) = 3),
    false
  );
$$;

grant execute on function public.guild_color_readable(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. update_guild: same as 202610010015 plus the readability check.
--    Leader (or admin) only -- it also changes name and joining rules.
-- ---------------------------------------------------------------------
create or replace function public.update_guild(
  p_guild_id uuid,
  p_name text,
  p_tagline text,
  p_emblem text,
  p_color text,
  p_join_policy text default null,
  p_min_rank text default null,
  p_description text default null,
  p_areas text[] default '{}',
  p_focus text[] default '{}'
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if not exists (
    select 1 from public.guilds
    where id = p_guild_id and (leader_id = auth.uid() or public.current_user_role() = 'admin')
  ) then
    raise exception 'Only this guild''s leader can edit it';
  end if;
  if exists (
    select 1 from public.guilds where id <> p_guild_id and lower(btrim(name)) = lower(btrim(p_name))
  ) then
    raise exception 'That guild name is taken';
  end if;
  if p_color is not null and not public.guild_color_readable(p_color) then
    raise exception 'That color is too light — pick a darker shade';
  end if;

  -- Joining rules are always written (null / empty = no limit), so the
  -- form sends the full current settings. Narrowing areas or raising the
  -- rank doesn't remove current members.
  update public.guilds
  set name = btrim(p_name),
      tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color),
      join_policy = coalesce(p_join_policy, join_policy),
      min_rank = p_min_rank,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      areas = coalesce(p_areas, '{}'),
      focus = coalesce(p_focus, '{}')
  where id = p_guild_id
  returning * into v_guild;

  return v_guild;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Appearance only (motto, about, emblem, color): leader, officers or
--    admin. Name and joining rules stay with update_guild.
-- ---------------------------------------------------------------------
create or replace function public.update_guild_appearance(
  p_guild_id uuid,
  p_tagline text,
  p_description text,
  p_emblem text,
  p_color text
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_manage_guild(p_guild_id) then
    raise exception 'Only the guild leader or an officer can edit the guild''s look';
  end if;
  if p_color is not null and not public.guild_color_readable(p_color) then
    raise exception 'That color is too light — pick a darker shade';
  end if;

  update public.guilds
  set tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color)
  where id = p_guild_id
  returning * into v_guild;

  if v_guild.id is null then
    raise exception 'Guild not found';
  end if;
  return v_guild;
end;
$$;

revoke all on function public.update_guild_appearance(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_guild_appearance(uuid, text, text, text, text) to authenticated;

commit;
