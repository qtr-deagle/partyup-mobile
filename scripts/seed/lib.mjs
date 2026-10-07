// Shared plumbing for the seed sections: env, service-role client, seeded
// random, date helpers and logging.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const path = fileURLToPath(new URL('../../.env', import.meta.url));
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
const GMAIL_BASE = process.env.SEED_GMAIL_BASE?.toLowerCase();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY=<service_role secret> to .env');
  console.error('(Supabase Dashboard -> Project Settings -> API -> service_role secret).');
  process.exit(1);
}

// Sign-up only accepts Gmail (202610030007), and status changes send real
// emails, so every seeded account is a +alias of a mailbox the team owns.
if (!GMAIL_BASE || !/^[a-z0-9.]+@(gmail|googlemail)\.com$/.test(GMAIL_BASE)) {
  console.error('Missing or invalid SEED_GMAIL_BASE.');
  console.error('Add SEED_GMAIL_BASE=<a Gmail address your team owns> to .env');
  console.error('Seed accounts become <name>+pu-<who>@gmail.com, so any emails land in that inbox.');
  process.exit(1);
}

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const DEMO_PASSWORD = 'Demo1234!';

const [gmailLocal, gmailDomain] = GMAIL_BASE.split('@');
const SEED_PREFIX = `${gmailLocal}+pu-`;

export function seedEmail(key) {
  return `${SEED_PREFIX}${key}@${gmailDomain}`;
}

export function isSeedEmail(email) {
  return Boolean(email?.toLowerCase().startsWith(SEED_PREFIX) && email.toLowerCase().endsWith(`@${gmailDomain}`));
}

// Seeded random so every reseed produces the same data.
let randomState = 20261001;
export function random() {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}

export function pick(list) {
  return list[Math.floor(random() * list.length)];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Dates relative to now so a reseed always looks fresh.
export function daysFromNow(days, hour = null) {
  const date = new Date(Date.now() + days * DAY);
  if (hour !== null) date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function hoursAgo(hours) {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

export function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

let warnings = 0;

export function ok(message) {
  console.log(`  ✔ ${message}`);
}

export function warn(message) {
  warnings += 1;
  console.warn(`  ⚠ ${message}`);
}

export function warningCount() {
  return warnings;
}

// Runs an insert/update/rpc and warns instead of throwing, so one bad
// section doesn't stop the rest of the seed.
export async function run(label, query) {
  const { data, error } = await query;
  if (error) {
    warn(`${label}: ${error.message}`);
    return null;
  }
  return data ?? true;
}
