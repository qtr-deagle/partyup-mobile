#!/usr/bin/env node
// Demo seed: ~26 Bulacan travelers covering every state the app and the
// staff website can show (pending/rejected IDs, vehicle queue incl. a
// borrowed car, carpools and tours in every status, chats, SOS history,
// reports, tickets, guilds, Discover plans, cosmetics).
//
// Usage:
//   npm run demo:seed                 wipe seed accounts, then seed everything
//   npm run demo:seed -- --with-live-sos   also leave one ACTIVE SOS alert
//   npm run demo:locations            refresh map positions (they go stale after 5 min)
//   npm run demo:reset                delete every seed account and its uploads
//
// .env needs SUPABASE_SERVICE_ROLE_KEY and SEED_GMAIL_BASE (see lib.mjs).

import { createPeople, deleteSeedUsers, existingIds, PEOPLE } from './accounts.mjs';
import { DEMO_PASSWORD, seedEmail, warningCount } from './lib.mjs';
import { seedVerification } from './verification.mjs';
import { seedVehicles } from './vehicles.mjs';
import { seedGuilds } from './guilds.mjs';
import { seedTrips } from './trips.mjs';
import { seedLocations, seedSocial } from './social.mjs';
import { seedSafety } from './safety.mjs';
import { seedDiscover } from './discover.mjs';

const mode = process.argv[2];
const flags = new Set(process.argv.slice(3));

async function seed() {
  console.log('Removing old seed accounts...');
  await deleteSeedUsers();

  console.log('\nAccounts');
  const ids = await createPeople();
  console.log('\nID verification');
  await seedVerification(ids);
  console.log('\nVehicles & licenses');
  const vehicleIds = await seedVehicles(ids);
  console.log('\nGuilds');
  const guildIds = await seedGuilds(ids);
  console.log('\nTrips');
  const trips = await seedTrips(ids, vehicleIds, guildIds);
  console.log('\nSocial & chat');
  await seedSocial(ids, trips);
  console.log('\nSafety & reports');
  await seedSafety(ids, trips, { liveSos: flags.has('--with-live-sos') });
  console.log('\nDiscover & cosmetics');
  await seedDiscover(ids);

  console.log(`\nLogins (password for all: ${DEMO_PASSWORD})`);
  for (const p of PEOPLE) {
    if (!ids[p.key]) continue;
    console.log(`  ${seedEmail(p.key).padEnd(40)} ${p.demos}`);
  }
  const warnings = warningCount();
  console.log(warnings ? `\nDone with ${warnings} warning(s) -- scroll up for ⚠ lines.` : '\nDone, no warnings.');
}

if (mode === 'seed') {
  await seed();
} else if (mode === 'locations') {
  await seedLocations(await existingIds());
} else if (mode === 'reset') {
  const count = await deleteSeedUsers();
  console.log(`\nRemoved ${count} seed account(s).`);
} else {
  console.log('Usage: node scripts/seed/index.mjs <seed [--with-live-sos] | locations | reset>');
  process.exit(1);
}
