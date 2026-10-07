-- Luxury cosmetics collection: 7 banners + 7 frames for sale, priced above
-- the starter set and gated by rank at the top end. How each one looks lives
-- in lib/cosmetics.ts (BANNER_STYLES / FRAME_STYLES), keyed by `key`.
-- Existing table only (202610030001), so no new grants are needed.

insert into public.cosmetics (key, kind, name, description, cost, unlock_mission, min_rank, sort) values
  -- Banners
  ('banner_champagne',      'banner', 'Champagne Silk',  'Bronze silk with gold-thread trim',      300, null, 'Bronze',   15),
  ('banner_aurora',         'banner', 'Aurora Nights',   'Northern lights over a starry sky',      350, null, null,       16),
  ('banner_sapphire',       'banner', 'Sapphire Facets', 'Cut-gem blue with platinum trim',        450, null, 'Silver',   17),
  ('banner_marble',         'banner', 'Black Marble',    'Gold-veined black marble',               500, null, 'Silver',   18),
  ('banner_damask',         'banner', 'Royal Damask',    'Burgundy brocade with a gold lattice',   550, null, 'Gold',     19),
  ('banner_deco',           'banner', 'Art Deco Gala',   'Black and gold Gatsby sunburst',         650, null, 'Gold',     20),
  ('banner_emerald_laurel', 'banner', 'Emerald Laurel',  'A gold laurel wreath on deep emerald',   900, null, 'Platinum', 21),
  -- Frames
  ('frame_aurora',          'frame',  'Aurora Ring',     'Shifting teal, violet and pink',         250, null, null,       34),
  ('frame_rose_gold',       'frame',  'Rose Gold',       'Polished rose gold',                     300, null, 'Bronze',   35),
  ('frame_obsidian',        'frame',  'Obsidian & Gold', 'Black lacquer with a gold inlay',        400, null, 'Silver',   36),
  ('frame_sapphire',        'frame',  'Sapphire Setting','Platinum set with four sapphires',       500, null, 'Silver',   37),
  ('frame_imperial',        'frame',  'Imperial Ruby',   'Heavy gold set with four rubies',        650, null, 'Gold',     38),
  ('frame_platinum',        'frame',  'Platinum Halo',   'Six diamonds on polished platinum',      800, null, 'Platinum', 39),
  ('frame_diamond',         'frame',  'Diamond Eternity','Eight diamonds all the way around',     1200, null, 'Legend',   40)
on conflict (key) do update set
  kind = excluded.kind, name = excluded.name, description = excluded.description, cost = excluded.cost,
  unlock_mission = excluded.unlock_mission, min_rank = excluded.min_rank, sort = excluded.sort, is_active = true;

-- Keep milestone rewards after the shop items in each tab.
update public.cosmetics set sort = 25 where key = 'banner_open_road';
update public.cosmetics set sort = 26 where key = 'banner_pillar';
update public.cosmetics set sort = 27 where key = 'banner_legend';
update public.cosmetics set sort = 45 where key = 'frame_trail';
update public.cosmetics set sort = 46 where key = 'frame_loyal';
update public.cosmetics set sort = 47 where key = 'frame_rising';
