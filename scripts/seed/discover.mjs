// Discover + cosmetics: travel plans so match % has something to compare,
// and owned/equipped banners and frames taken from the live catalog.

import { person } from './accounts.mjs';
import { admin, ok, random, run } from './lib.mjs';

// Values must match the travel_plans check constraints (max 2 each).
const PLANS = {
  miggy: { ride: ['car'], destination: ['mountain', 'beach'], food: ['food_finding'], missions: true, description: 'Weekend hikes, early starts, always down for lugaw after.', preferred: ['male', 'female'] },
  carla: { ride: ['car'], destination: ['cities', 'beach'], food: ['resto_search', 'food_finding'], missions: true, description: 'Food crawls and heritage towns. I drive, you pick the kainan.', preferred: ['male', 'female'] },
  jun: { ride: ['car'], destination: ['mountain'], food: ['food_finding'], missions: true, description: 'Trail runs and sunrise drives around Norzagaray.', preferred: ['male', 'female'] },
  marco: { ride: ['car', 'motor'], destination: ['cities'], food: ['drink_search', 'resto_search'], missions: false, description: 'Mall runs, concerts, late-night food trips.', preferred: ['male', 'female'] },
  trisha: { ride: ['car'], destination: ['mountain', 'beach'], food: ['food_finding'], missions: true, description: 'Photography hikes, slow pace, lots of stops.', preferred: ['female'] },
  ramon: { ride: ['motor'], destination: ['mountain'], food: ['food_finding'], missions: true, description: 'Camping on a budget.', preferred: ['male', 'female'] },
  enzo: { ride: ['car'], destination: ['beach'], food: ['resto_search', 'food_finding'], missions: false, description: 'Seafood is life.', preferred: ['male', 'female'] },
  lia: { ride: ['car'], destination: ['beach', 'cities'], food: ['resto_search'], missions: false, description: 'New here! Looking for chill beach trips.', preferred: ['female'] },
  kim: { ride: ['car', 'motor'], destination: ['beach', 'mountain'], food: ['food_finding'], missions: true, description: 'Backpacker energy. Will join anything with a view.', preferred: ['male', 'female'] },
  ana: { ride: ['car'], destination: ['cities'], food: ['resto_search'], missions: true, description: 'Heritage walks and kakanin hunts in Malolos.', preferred: ['male', 'female'] },
  paolo: { ride: ['car', 'motor'], destination: ['mountain'], food: ['food_finding'], missions: true, description: 'Guide for Biak-na-Bato and Madlum.', preferred: ['male', 'female'] },
  bea: { ride: ['car'], destination: ['beach'], food: ['food_finding', 'resto_search'], missions: true, description: 'River days and fish-port lunches.', preferred: ['male', 'female'] },
  rico: { ride: ['car'], destination: ['cities', 'mountain'], food: ['drink_search'], missions: false, description: 'Waiting on my car approval, then road trips!', preferred: ['male', 'female'] },
  joy: { ride: ['car'], destination: ['cities'], food: ['resto_search'], missions: false, description: 'Driving my dad\'s Ertiga for weekend food trips.', preferred: ['female'] },
  dante: { ride: ['car', 'motor'], destination: ['mountain', 'cities'], food: ['food_finding'], missions: false, description: 'Budget rides to Santa Maria and SJDM.', preferred: ['male', 'female'] },
};

// Higher-ranked people wear more; everyone listed gets something.
const COSMETIC_OWNERS = { carla: 6, paolo: 5, jun: 4, ana: 4, trisha: 3, enzo: 2, bea: 2, miggy: 2, ramon: 1 };

export async function seedDiscover(ids) {
  const plans = Object.entries(PLANS).filter(([key]) => ids[key]).map(([key, p]) => ({
    user_id: ids[key], ride: p.ride, destination: p.destination, food: p.food, missions: p.missions,
    description: p.description, gender: person(key).gender, preferred_gender: p.preferred,
  }));
  await run('travel plans', admin.from('travel_plans').upsert(plans));

  const { data: catalog } = await admin.from('cosmetics').select('key, kind, sort').eq('is_active', true).order('sort');
  let owned = 0;
  if (catalog?.length) {
    const rows = [];
    for (const [key, count] of Object.entries(COSMETIC_OWNERS)) {
      if (!ids[key]) continue;
      const picks = [...catalog].sort(() => random() - 0.5).slice(0, count);
      const equipped = new Set();
      for (const c of picks) {
        const wear = !equipped.has(c.kind);
        equipped.add(c.kind);
        rows.push({ user_id: ids[key], cosmetic_key: c.key, kind: c.kind, source: 'admin', equipped: wear });
      }
    }
    if (await run('user cosmetics', admin.from('user_cosmetics').insert(rows))) owned = rows.length;
  }

  ok(`Discover: ${plans.length} travel plans; cosmetics: ${owned} owned across ${Object.keys(COSMETIC_OWNERS).length} people`);
}
