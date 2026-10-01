#!/usr/bin/env node
// Seeds/resets fixed demo accounts for rehearsing the register -> verify ->
// carpool -> complete -> rate panel demo, so you don't have to re-type
// signup + wait for staff approval on the "other rider" every run.
//
// Usage:
//   node scripts/demo-seed.mjs seed    Recreate the staff reviewer + pre-approved rider accounts,
//                                      plus 3 demo guilds with members, points and season medals
//                                      (add --no-guilds to skip the guild data)
//   node scripts/demo-seed.mjs reset   Delete every account under @partyup.demo (including any
//                                      presenter account you registered live under that domain)
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env -- get it from the Supabase
// Dashboard: Project Settings -> API -> service_role secret. Never commit
// this key; .env is already gitignored.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY=<service_role secret> to .env');
  console.error('(Supabase Dashboard -> Project Settings -> API -> service_role secret).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_DOMAIN = 'partyup.demo';
const DEMO_PASSWORD = 'Demo1234!';

// Both accounts are pre-approved -- neither needs the ID-verification wait.
// Register your live "presenter" account separately with any email you like
// (e.g. you@partyup.demo, so `reset` also cleans it up between rehearsals).
const FIXED_ACCOUNTS = [
  {
    email: `reviewer@${DEMO_DOMAIN}`,
    displayName: 'Ana Reviewer',
    dateOfBirth: '01/01/1990',
    interests: ['Beach', 'Food Trip'],
    role: 'guild_leader',
    verificationStatus: 'approved',
    city: 'Malolos',
  },
  {
    email: `rider@${DEMO_DOMAIN}`,
    displayName: 'Miggy Rider',
    dateOfBirth: '05/15/1998',
    interests: ['Mountain', 'Road Trip'],
    role: 'traveler',
    verificationStatus: 'approved',
    city: 'Bulakan',
  },
];

// ---------------------------------------------------------------------------
// Guild demo data: three guilds, members spread across every rank, points
// over last month and this month (so leaderboards and season medals have
// something to show). Ana and Miggy above are folded in: Ana leads Malolos
// Wanderers and Miggy is a member. Kim is verified with no guild, for
// demoing "Find a guild" -> Join; Kim also has a pending request to Malolos.
// ---------------------------------------------------------------------------

const GUILDS = [
  { key: 'malolos', name: 'Malolos Wanderers', tagline: 'Heritage towns, good food, better company', emblem: 'shield', color: '#2563EB', joinPolicy: 'approval' },
  { key: 'biak', name: 'Biak-na-Bato Trailblazers', tagline: 'Every trail in Bulacan, one weekend at a time', emblem: 'mountain', color: '#059669', joinPolicy: 'open' },
  { key: 'hagonoy', name: 'Hagonoy River Riders', tagline: 'Rivers, rafts and roadside seafood', emblem: 'wave', color: '#0891B2', joinPolicy: 'approval' },
];

// target = lifetime points to aim for (rank in the comment); lastMonth = the
// share earned last month. Leaders lead the guild in `guild`.
const GUILD_ACCOUNTS = [
  { email: `reviewer@${DEMO_DOMAIN}`, guild: 'malolos', leader: true, target: 820, lastMonth: 0.5 }, // Gold I
  { email: `paolo@${DEMO_DOMAIN}`, displayName: 'Paolo Santos', dateOfBirth: '03/22/1991', interests: ['Mountain', 'Camping'], role: 'guild_leader', city: 'San Miguel', guild: 'biak', leader: true, target: 1650, lastMonth: 0.6 }, // Platinum
  { email: `bea@${DEMO_DOMAIN}`, displayName: 'Bea Cruz', dateOfBirth: '11/08/1993', interests: ['Beach', 'River'], role: 'guild_leader', city: 'Hagonoy', guild: 'hagonoy', leader: true, target: 380, lastMonth: 0.4 }, // Silver
  { email: `rider@${DEMO_DOMAIN}`, guild: 'malolos', target: 240, lastMonth: 0.5 }, // Bronze
  { email: `carla@${DEMO_DOMAIN}`, displayName: 'Carla Mendoza', dateOfBirth: '07/30/1996', interests: ['Road Trip', 'Food Trip'], role: 'traveler', city: 'Malolos', guild: 'malolos', target: 3200, lastMonth: 0.55 }, // Legend
  { email: `jun@${DEMO_DOMAIN}`, displayName: 'Jun dela Cruz', dateOfBirth: '02/14/1995', interests: ['Mountain', 'Hiking'], role: 'traveler', city: 'Norzagaray', guild: 'biak', target: 1100, lastMonth: 0.65 }, // Gold
  { email: `trisha@${DEMO_DOMAIN}`, displayName: 'Trisha Reyes', dateOfBirth: '09/03/1999', interests: ['Hiking', 'Photography'], role: 'traveler', city: 'San Ildefonso', guild: 'biak', target: 560, lastMonth: 0.3 }, // Silver II
  { email: `ramon@${DEMO_DOMAIN}`, displayName: 'Ramon Bautista', dateOfBirth: '12/19/1992', interests: ['Camping'], role: 'traveler', city: 'San Rafael', guild: 'biak', target: 130, lastMonth: 0.5 }, // Bronze I
  { email: `enzo@${DEMO_DOMAIN}`, displayName: 'Enzo Villanueva', dateOfBirth: '04/27/1997', interests: ['River', 'Food Trip'], role: 'traveler', city: 'Paombong', guild: 'hagonoy', target: 450, lastMonth: 0.45 }, // Silver
  { email: `lia@${DEMO_DOMAIN}`, displayName: 'Lia Navarro', dateOfBirth: '06/11/2000', interests: ['Beach'], role: 'traveler', city: 'Calumpit', guild: 'hagonoy', target: 70, lastMonth: 0 }, // Rookie
  { email: `kim@${DEMO_DOMAIN}`, displayName: 'Kim Aquino', dateOfBirth: '10/05/1998', interests: ['Beach', 'Road Trip'], role: 'traveler', city: 'Meycauayan', guild: null, target: 60, lastMonth: 0 }, // Rookie, no guild
];

// Seeded random so every reseed produces the same boards.
let randomState = 20261001;
function random() {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}

function monthWindows() {
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { last: [lastMonth, thisMonth], current: [thisMonth, now] };
}

function randomTimeIn([start, end]) {
  return new Date(start.getTime() + random() * Math.max(1, end.getTime() - start.getTime() - 60_000)).toISOString();
}

// The same point values the DB triggers award, so badges and the "How to
// earn" guide stay believable.
function buildPointEvents(account, userId, guildId) {
  const windows = monthWindows();
  const events = [];
  let total = 0;
  const add = (reason, amount, when, note = null) => {
    events.push({ user_id: userId, guild_id: guildId, amount, reason, source_key: `seed:${reason}:${events.length}`, note, created_at: when });
    total += amount;
  };

  // One-time awards land early last month (or this month for brand-new users).
  const early = account.lastMonth > 0 ? windows.last : windows.current;
  if (account.leader) {
    add('guild_founded', 50, randomTimeIn(early), GUILDS.find((g) => g.key === account.guild)?.name);
  } else {
    add('id_verified', 50, randomTimeIn(early), 'Welcome to PartyUp');
    if (guildId) add('guild_joined', 10, randomTimeIn(early), GUILDS.find((g) => g.key === account.guild)?.name);
  }

  const repeatable = account.leader
    ? [
        ['id_review', 10],
        ['vehicle_review', 10],
        ['guild_trip_bonus', 5],
      ]
    : [
        ['trip_completed', 20],
        ['trip_completed', 20],
        ['trip_hosted', 30],
      ];
  const lastMonthGoal = account.target * account.lastMonth;
  while (total < account.target) {
    const [reason, amount] = repeatable[Math.floor(random() * repeatable.length)];
    add(reason, amount, randomTimeIn(total < lastMonthGoal ? windows.last : windows.current));
  }
  return events;
}

async function createGuildData(userIds) {
  const guildIds = {};
  for (const guild of GUILDS) {
    const leader = GUILD_ACCOUNTS.find((account) => account.leader && account.guild === guild.key);
    const { data, error } = await admin
      .from('guilds')
      .insert({ name: guild.name, tagline: guild.tagline, emblem: guild.emblem, color: guild.color, join_policy: guild.joinPolicy, leader_id: userIds[leader.email] })
      .select('id')
      .single();
    if (error) {
      console.error(`Failed to create guild ${guild.name}: ${error.message}`);
      continue;
    }
    guildIds[guild.key] = data.id;
  }

  const members = GUILD_ACCOUNTS.filter((account) => account.guild && guildIds[account.guild] && userIds[account.email]).map((account) => ({
    user_id: userIds[account.email],
    guild_id: guildIds[account.guild],
  }));
  const { error: memberError } = await admin.from('guild_members').insert(members);
  if (memberError) console.error(`Failed to add guild members: ${memberError.message}`);

  // Leadership demo: Jun is an officer of Biak, Malolos has a pinned
  // announcement, and Carla (Legend) has applied to found her own guild.
  const junId = userIds[`jun@${DEMO_DOMAIN}`];
  const carlaId = userIds[`carla@${DEMO_DOMAIN}`];
  if (junId) await admin.from('guild_members').update({ role: 'officer' }).eq('user_id', junId);
  if (guildIds.malolos) {
    await admin
      .from('guilds')
      .update({
        announcement: 'Heritage walk this Saturday: Barasoain Church at 7AM, then pancit at Bistro Maloleño. Bring water!',
        announcement_at: new Date().toISOString(),
        announcement_by: userIds[`reviewer@${DEMO_DOMAIN}`] ?? null,
      })
      .eq('id', guildIds.malolos);
  }
  if (carlaId) {
    const { error: applicationError } = await admin.from('guild_leader_applications').insert({
      user_id: carlaId,
      guild_name: 'Pulilan Pathfinders',
      pitch: 'I have done 130+ trips around Bulacan and want to lead weekend food and heritage runs out of Pulilan, with a buddy system for first-timers.',
    });
    if (applicationError) console.warn(`Leader application not seeded: ${applicationError.message} (apply migration 202610010006?)`);
    else console.log('Leader application: carla -> Pulilan Pathfinders (pending)');
  }

  // Kim (no guild) has asked to join Malolos, so Ana has a request to accept.
  const kimId = userIds[`kim@${DEMO_DOMAIN}`];
  if (kimId && guildIds.malolos) {
    const { error: requestError } = await admin.from('guild_join_requests').insert({ guild_id: guildIds.malolos, user_id: kimId });
    if (requestError) console.warn(`Join request not seeded: ${requestError.message} (apply migration 202610010004?)`);
    else console.log('Join request: kim -> Malolos Wanderers (pending)');
  }

  let eventCount = 0;
  for (const account of GUILD_ACCOUNTS) {
    const userId = userIds[account.email];
    if (!userId) continue;
    const events = buildPointEvents(account, userId, account.guild ? (guildIds[account.guild] ?? null) : null);
    const { error } = await admin.from('guild_point_events').insert(events);
    if (error) {
      console.error(`Failed to add points for ${account.email}: ${error.message}`);
      continue;
    }
    eventCount += events.length;
    console.log(`Points: ${account.email.padEnd(24)} ${String(events.reduce((sum, e) => sum + e.amount, 0)).padStart(5)} pts${account.guild ? `  (${account.guild}${account.leader ? ', leader' : ''})` : '  (no guild)'}`);
  }

  // Award last month's season medals now instead of waiting for the 1st.
  const { data: awarded, error: awardError } = await admin.rpc('award_season_medals');
  if (awardError) console.warn(`Season medals not awarded: ${awardError.message} (apply migration 202610010003?)`);
  else console.log(`Season medals awarded for last month: ${awarded}`);

  console.log(`Guilds: ${Object.keys(guildIds).length}, point events: ${eventCount}`);
}

async function createUser(account) {
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: account.displayName,
      date_of_birth: account.dateOfBirth,
      interests: account.interests,
    },
  });
  if (error || !data.user) {
    console.error(`Failed to create ${account.email}: ${error?.message}`);
    return null;
  }
  const { error: profileError } = await admin
    .from('profiles')
    // Approval is rejected without a Bulacan municipality, so set city in the same update.
    .update({ role: account.role, city: account.city, verification_status: account.verificationStatus ?? 'approved' })
    .eq('id', data.user.id);
  if (profileError) {
    console.error(`Failed to finish setting up ${account.email}: ${profileError.message}`);
    return null;
  }
  console.log(`Ready: ${account.email} / ${DEMO_PASSWORD}  (role=${account.role})`);
  return data.user.id;
}

async function listDemoUsers() {
  const matches = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    matches.push(...data.users.filter((user) => user.email?.endsWith(`@${DEMO_DOMAIN}`)));
    if (data.users.length < 200) break;
    page += 1;
  }
  return matches;
}

async function deleteDemoUsers() {
  const users = await listDemoUsers();
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.warn(`Failed to delete ${user.email}: ${error.message}`);
    } else {
      console.log(`Deleted ${user.email}`);
    }
  }
  return users.length;
}

// The on_auth_user_created trigger makes each profiles row from
// user_metadata; createUser() then sets role + verification, which it can't
// know about. Returns email -> user id.
async function createFixedAccounts({ withGuilds }) {
  const userIds = {};
  const accounts = withGuilds ? [...FIXED_ACCOUNTS, ...GUILD_ACCOUNTS.filter((a) => a.displayName)] : FIXED_ACCOUNTS;
  for (const account of accounts) {
    const id = await createUser(account);
    if (id) userIds[account.email] = id;
  }
  return userIds;
}

const mode = process.argv[2];

if (mode === 'reset') {
  const count = await deleteDemoUsers();
  console.log(`\nRemoved ${count} account(s) under @${DEMO_DOMAIN}.`);
} else if (mode === 'seed') {
  const withGuilds = !process.argv.includes('--no-guilds');
  await deleteDemoUsers();
  const userIds = await createFixedAccounts({ withGuilds });
  if (withGuilds) {
    console.log('');
    await createGuildData(userIds);
  }
  console.log(`\nLog in as the reviewer to approve/reject, or as the rider to join a trip as a second traveler.`);
  if (withGuilds) {
    console.log(`Ana leads Malolos Wanderers (approval) and has kim@${DEMO_DOMAIN}'s join request waiting.`);
    console.log(`Biak-na-Bato is open (instant Join); Malolos and Hagonoy need approval.`);
  }
  console.log(`Register your own presenter account live in the app for the register -> verify parts of the demo.`);
} else {
  console.log('Usage: node scripts/demo-seed.mjs <seed [--no-guilds]|reset>');
  process.exit(1);
}
