// ID verification: a staff queue with every AI outcome, rejected history, a
// resubmission, and a few approved records. Each insert here sends one real
// status email (to the SEED_GMAIL_BASE inbox), so approved history is kept
// to a handful of people.

import { displayName, person } from './accounts.mjs';
import { admin, hoursAgo, ok, run } from './lib.mjs';
import { idBack, idFront, selfie, upload } from './images.mjs';

const ACCENTS = { national_id: [37, 99, 235], driver_license: [22, 101, 52], passport: [127, 29, 29], other: [107, 33, 168] };
const SHIRTS = [[37, 99, 235], [5, 150, 105], [220, 38, 38], [124, 58, 237], [234, 88, 12], [15, 118, 110]];
const HAIR = [[41, 37, 36], [68, 64, 60], [87, 56, 34], [23, 23, 23]];
const TONES = [[233, 185, 140], [222, 170, 125], [241, 200, 160], [205, 150, 110], [228, 178, 132]];
const DOC_LABEL ={ national_id: 'NATIONAL ID', driver_license: "DRIVER'S LICENSE", passport: 'PASSPORT', other: 'POSTAL ID' };

const PENDING = [
  { key: 'nico', doc: 'national_id', hoursAgo: 30, ai: { ai_similarity_score: 94, ai_flag: 'high_confidence', ai_age_low: 24, ai_age_high: 30, ai_address_flag: 'match', ai_detected_municipality: 'Guiguinto' } },
  { key: 'sofia', doc: 'driver_license', hoursAgo: 20, ai: { ai_similarity_score: 71, ai_flag: 'needs_review', ai_age_low: 22, ai_age_high: 28, ai_address_flag: 'other_bulacan_town', ai_detected_municipality: 'Marilao', ai_detected_license: true } },
  { key: 'andrea', doc: 'national_id', hoursAgo: 14, ai: { ai_similarity_score: 38, ai_flag: 'low_similarity', ai_age_low: 27, ai_age_high: 35, ai_address_flag: 'match', ai_detected_municipality: 'Pulilan' } },
  { key: 'gabby', doc: 'other', hoursAgo: 9, ai: { ai_similarity_score: 88, ai_flag: 'needs_review', ai_age_low: 15, ai_age_high: 17, ai_underage_flag: true, ai_address_flag: 'match', ai_detected_municipality: 'Bustos' } },
  { key: 'luis', doc: 'passport', hoursAgo: 5, ai: { ai_similarity_score: 90, ai_flag: 'high_confidence', ai_age_low: 28, ai_age_high: 36, ai_address_flag: 'not_bulacan', ai_detected_municipality: 'Quezon City' } },
  { key: 'ella', doc: 'national_id', hoursAgo: 2, ai: { ai_similarity_score: 86, ai_flag: 'high_confidence', ai_age_low: 25, ai_age_high: 31, ai_address_flag: 'match', ai_detected_municipality: 'Obando' } },
];

const REJECTED = [
  { key: 'pia', doc: 'national_id', hoursAgo: 72, notes: 'The ID photo is too blurry to read your name and birthday. Please retake it in good light, flat on a table.', ai: { ai_similarity_score: 52, ai_flag: 'needs_review' } },
  { key: 'mark', doc: 'driver_license', hoursAgo: 96, notes: 'The name on the ID (Marcus Valdes) does not match your account name. Update your legal name or upload the matching ID.', ai: { ai_similarity_score: 81, ai_flag: 'needs_review' } },
];

const APPROVED_HISTORY = ['ana', 'carla', 'miggy', 'trisha'];

function idNumber(key, salt = 0) {
  let n = 0;
  for (const ch of key) n = (n * 31 + ch.charCodeAt(0) + salt) % 1_000_000_007;
  const digits = String(n).padStart(12, '0').slice(-12);
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

async function uploadIdImages(userId, key, doc, tag) {
  const p = person(key);
  const name = displayName(key);
  const number = idNumber(key, tag.length);
  const front = await upload('id-verifications', userId, `${tag}-front`, idFront({ name, dob: p.dob, idNumber: number, city: p.city, accent: ACCENTS[doc], docLabel: DOC_LABEL[doc] }));
  const back = doc === 'passport' ? null : await upload('id-verifications', userId, `${tag}-back`, idBack({ idNumber: number }));
  const look = [...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const face = await upload('id-verifications', userId, `${tag}-selfie`, selfie({
    name,
    shirt: SHIRTS[look % SHIRTS.length],
    hair: HAIR[look % HAIR.length],
    tone: TONES[look % TONES.length],
  }));
  return { front_image_path: front, back_image_path: back, selfie_image_path: face, document_last4: number.slice(-4) };
}

export async function seedVerification(ids) {
  const reviewer = ids.admin;
  const at = (h) => hoursAgo(h);

  for (const entry of PENDING) {
    const userId = ids[entry.key];
    if (!userId) continue;

    // Ella's earlier attempt was rejected and replaced by today's resubmission.
    if (entry.key === 'ella') {
      const old = await uploadIdImages(userId, 'ella', 'national_id', 'first');
      await run('ella earlier ID', admin.from('id_verifications').insert({
        user_id: userId, submitted_by: userId, document_type: 'national_id', document_country: 'Philippines', ...old,
        status: 'resubmitted', reviewer_id: reviewer, reviewed_at: at(50), submitted_at: at(60),
        reviewer_notes: 'Selfie is cut off at the forehead. Please retake it with your whole face and the ID visible.',
        ai_similarity_score: 44, ai_flag: 'low_similarity', ai_processed_at: at(60),
      }));
    }

    const images = await uploadIdImages(userId, entry.key, entry.doc, 'id');
    // status 'pending' -> mark_profile_verification_pending flips the profile.
    await run(`${entry.key} pending ID`, admin.from('id_verifications').insert({
      user_id: userId, submitted_by: userId, document_type: entry.doc, document_country: 'Philippines', ...images,
      status: 'pending', submitted_at: at(entry.hoursAgo), ai_processed_at: at(entry.hoursAgo - 0.1), ...entry.ai,
    }));
  }

  for (const entry of REJECTED) {
    const userId = ids[entry.key];
    if (!userId) continue;
    const images = await uploadIdImages(userId, entry.key, entry.doc, 'id');
    await run(`${entry.key} rejected ID`, admin.from('id_verifications').insert({
      user_id: userId, submitted_by: userId, document_type: entry.doc, document_country: 'Philippines', ...images,
      status: 'rejected', submitted_at: at(entry.hoursAgo), reviewer_id: reviewer, reviewed_at: at(entry.hoursAgo - 6),
      reviewer_notes: entry.notes, ai_processed_at: at(entry.hoursAgo), ...entry.ai,
    }));
    await run(`${entry.key} profile rejected`, admin.from('profiles').update({ verification_status: 'rejected' }).eq('id', userId));
  }

  for (const key of APPROVED_HISTORY) {
    const userId = ids[key];
    if (!userId) continue;
    const images = await uploadIdImages(userId, key, 'national_id', 'id');
    await run(`${key} approved ID`, admin.from('id_verifications').insert({
      user_id: userId, submitted_by: userId, document_type: 'national_id', document_country: 'Philippines', ...images,
      status: 'approved', submitted_at: at(24 * 40), reviewer_id: reviewer, reviewed_at: at(24 * 40 - 3),
      ai_similarity_score: 92, ai_flag: 'high_confidence', ai_address_flag: 'match', ai_detected_municipality: person(key).city, ai_processed_at: at(24 * 40),
    }));
  }

  ok(`ID verifications: ${PENDING.length} pending, ${REJECTED.length} rejected, 1 resubmitted, ${APPROVED_HISTORY.length} approved`);
}
