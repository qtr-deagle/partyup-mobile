// One-off (2026-10-10): give every profile without a mobile number a made-up
// one, since numbers became required for trips (migration 202610090005).
// Real people's numbers are never touched: only rows with no phone are
// filled, and the accounts listed in KEEP_EMPTY are skipped so they add
// their real number in the app. Numbers saved as +639... (the first format)
// are rewritten as 09... (same number), the format the apps now use.
//
//   node scripts/fill-demo-phones.mjs           # dry run: lists what would change
//   node scripts/fill-demo-phones.mjs --apply   # writes the numbers

import { admin } from './seed/lib.mjs';

const KEEP_EMPTY = new Set([
  'altquinn07@gmail.com', // YeQiu Detaro
  'cjalamares05@gmail.com', // Christian Joshua Alamares
  'elbonhanz@gmail.com', // Hanz Noble
  'janpaolodevillena@gmail.com', // Jan Paolo Manuel
]);

const apply = process.argv.includes('--apply');

// Stable per user, so re-running gives the same number: 0917 XXX XXXX.
function madeUpPhone(id, taken) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  let n = Math.abs(h) % 10_000_000;
  let phone;
  do {
    phone = `0917${String(n).padStart(7, '0')}`;
    n = (n + 1) % 10_000_000;
  } while (taken.has(phone));
  taken.add(phone);
  return phone;
}

const { data: profiles, error } = await admin.from('profiles').select('id, display_name, email, phone, role').order('display_name');
if (error) {
  console.error('Could not read profiles:', error.message);
  process.exit(1);
}

// +639171234567 / 639171234567 -> 09171234567
function toLocalFormat(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('63') ? `0${digits.slice(2)}` : null;
}

const toConvert = profiles.filter((p) => p.phone && toLocalFormat(p.phone));
console.log(`${apply ? 'Converting' : 'Would convert'} +63 -> 09: ${toConvert.length}`);
let convertFailed = 0;
for (const p of toConvert) {
  const local = toLocalFormat(p.phone);
  if (!apply) continue;
  const { error: convertError } = await admin.from('profiles').update({ phone: local }).eq('id', p.id).eq('phone', p.phone);
  if (convertError) {
    convertFailed += 1;
    console.error(`  failed for ${p.display_name}: ${convertError.message}`);
  } else {
    p.phone = local;
  }
}
if (apply && toConvert.length) console.log(`  ${toConvert.length - convertFailed} converted, ${convertFailed} failed`);

const taken = new Set(profiles.map((p) => p.phone).filter(Boolean));
const missing = profiles.filter((p) => !p.phone || !p.phone.trim());
const skipped = missing.filter((p) => KEEP_EMPTY.has((p.email ?? '').toLowerCase()));
const toFill = missing.filter((p) => !KEEP_EMPTY.has((p.email ?? '').toLowerCase()));

console.log(`${profiles.length} profiles · ${profiles.length - missing.length} already have a number · ${missing.length} without`);
console.log(`\nSkipped (left empty on purpose): ${skipped.length}`);
for (const p of skipped) console.log(`  - ${p.display_name} <${p.email}>`);
const notFound = [...KEEP_EMPTY].filter((email) => !profiles.some((p) => (p.email ?? '').toLowerCase() === email));
if (notFound.length) console.log(`  (no profile found for: ${notFound.join(', ')})`);

console.log(`\n${apply ? 'Filling' : 'Would fill'}: ${toFill.length}`);
let failed = 0;
for (const p of toFill) {
  const phone = madeUpPhone(p.id, taken);
  console.log(`  ${phone}  ${p.display_name} <${p.email}> (${p.role})`);
  if (!apply) continue;
  const { error: updateError } = await admin.from('profiles').update({ phone }).eq('id', p.id).or('phone.is.null,phone.eq.');
  if (updateError) {
    failed += 1;
    console.error(`    failed: ${updateError.message}`);
  }
}

if (!apply) console.log('\nDry run. Re-run with --apply to write these numbers.');
else console.log(`\nDone: ${toFill.length - failed} filled, ${failed} failed.`);
