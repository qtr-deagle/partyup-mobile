#!/usr/bin/env node
// Seeds/resets fixed demo accounts for rehearsing the register -> verify ->
// carpool -> complete -> rate panel demo, so you don't have to re-type
// signup + wait for staff approval on the "other rider" every run.
//
// Usage:
//   node scripts/demo-seed.mjs seed    Recreate the staff reviewer + pre-approved rider accounts
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
    role: 'staff',
    verificationStatus: 'approved',
  },
  {
    email: `rider@${DEMO_DOMAIN}`,
    displayName: 'Miggy Rider',
    dateOfBirth: '05/15/1998',
    interests: ['Mountain', 'Road Trip'],
    role: 'traveler',
    verificationStatus: 'approved',
  },
];

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

async function createFixedAccounts() {
  for (const account of FIXED_ACCOUNTS) {
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
      continue;
    }

    // The on_auth_user_created trigger already made the profiles row from
    // user_metadata; this just sets the two fields it can't know about.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ role: account.role, verification_status: account.verificationStatus })
      .eq('id', data.user.id);
    if (profileError) {
      console.error(`Failed to finish setting up ${account.email}: ${profileError.message}`);
      continue;
    }
    console.log(`Ready: ${account.email} / ${DEMO_PASSWORD}  (role=${account.role}, verification=${account.verificationStatus})`);
  }
}

const mode = process.argv[2];

if (mode === 'reset') {
  const count = await deleteDemoUsers();
  console.log(`\nRemoved ${count} account(s) under @${DEMO_DOMAIN}.`);
} else if (mode === 'seed') {
  await deleteDemoUsers();
  await createFixedAccounts();
  console.log(`\nLog in as the reviewer to approve/reject, or as the rider to join a trip as a second traveler.`);
  console.log(`Register your own presenter account live in the app for the register -> verify parts of the demo.`);
} else {
  console.log('Usage: node scripts/demo-seed.mjs <seed|reset>');
  process.exit(1);
}
