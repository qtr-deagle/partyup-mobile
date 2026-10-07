// Vehicles + driver's licenses: three ready drivers (carpools need an
// approved licence, enforced by require_driver_license_for_carpool), a
// pending queue covering owned / borrowed / AI-mismatch, and one rejection.
// Inserting vehicles with a status sends no email (that trigger is
// update-only), and the edit guard lets the service role through.

import { displayName } from './accounts.mjs';
import { admin, daysFromNow, hoursAgo, ok, run } from './lib.mjs';
import { carExterior, document, license, orcr, plate, upload, idFront } from './images.mjs';

export const VEHICLES = [
  { key: 'carla', make: 'Toyota', model: 'Vios', year: 2019, color: 'White', plate: 'NBC 1234', rgb: [226, 232, 240], status: 'approved', licence: 'approved' },
  { key: 'jun', make: 'Mitsubishi', model: 'Montero Sport', year: 2021, color: 'Black', plate: 'NAB 5678', rgb: [51, 65, 85], status: 'approved', licence: 'approved' },
  { key: 'marco', make: 'Honda', model: 'City', year: 2020, color: 'Red', plate: 'DAF 4321', rgb: [220, 38, 38], status: 'approved', licence: 'approved' },
  { key: 'rico', make: 'Toyota', model: 'Innova', year: 2018, color: 'Silver', plate: 'NDQ 2468', rgb: [148, 163, 184], status: 'pending', licence: 'pending', hoursAgo: 26, ai: { ai_plate_detected: 'NDQ 2468', ai_plate_match: true, ai_orcr_plate_match: true, ai_owner_match: true, ai_flag: 'passed' } },
  { key: 'joy', make: 'Suzuki', model: 'Ertiga', year: 2022, color: 'Blue', plate: 'NFT 1357', rgb: [37, 99, 235], status: 'pending', licence: 'pending', hoursAgo: 11, borrowed: { owner: 'Rodel Pascual', relation: 'father' }, ai: { ai_plate_detected: 'NFT 1357', ai_plate_match: true, ai_orcr_plate_match: true, ai_owner_match: false, ai_flag: 'needs_review' } },
  { key: 'dante', make: 'Nissan', model: 'Almera', year: 2017, color: 'Gray', plate: 'ZTR 9087', photoPlate: 'ZTR 9081', rgb: [100, 116, 139], status: 'pending', licence: 'pending', hoursAgo: 4, ai: { ai_plate_detected: 'ZTR 9081', ai_plate_match: false, ai_orcr_plate_match: true, ai_owner_match: true, ai_flag: 'mismatch' } },
  { key: 'vince', make: 'Hyundai', model: 'Accent', year: 2016, color: 'White', plate: 'WQK 5521', rgb: [241, 245, 249], status: 'rejected', licence: 'rejected', hoursAgo: 80, notes: 'The OR/CR photo is cropped and the plate number is unreadable. Please upload the full document.' },
];

function licenceNumber(key) {
  let n = 7;
  for (const ch of key) n = (n * 37 + ch.charCodeAt(0)) % 100_000_000;
  return `N03-${String(n % 100).padStart(2, '0')}-${String(n).padStart(6, '0').slice(-6)}`;
}

async function uploadVehicleImages(userId, v) {
  const label = `${v.make} ${v.model} ${v.year}`;
  const paths = {
    exterior_image_path: await upload('vehicle-verifications', userId, 'exterior', carExterior({ label, plate: v.photoPlate ?? v.plate, body: v.rgb })),
    orcr_image_path: await upload('vehicle-verifications', userId, 'orcr', orcr({ plate: v.plate, make: v.make, model: v.model, year: v.year, owner: v.borrowed?.owner ?? displayName(v.key) })),
    plate_image_path: await upload('vehicle-verifications', userId, 'plate', plate({ plate: v.photoPlate ?? v.plate })),
  };
  if (v.borrowed) {
    const owner = v.borrowed.owner;
    paths.authorization_letter_path = await upload('vehicle-verifications', userId, 'authorization', document({
      title: 'AUTHORIZATION LETTER',
      lines: ['TO WHOM IT MAY CONCERN:', '', `I, ${owner}, REGISTERED OWNER OF`, `${v.make} ${v.model} (${v.plate}),`, `AUTHORIZE MY ${v.borrowed.relation.toUpperCase()},`, `${displayName(v.key)},`, 'TO DRIVE THIS VEHICLE FOR', 'PARTYUP CARPOOL TRIPS.', '', `SIGNED: ${owner}`],
      stamp: 'SIGNED',
    }));
    paths.owner_id_front_path = await upload('vehicle-verifications', userId, 'owner-id-front', idFront({ name: owner, dob: '04/12/1968', idNumber: '7788-1200-4455', city: 'Plaridel' }));
    paths.owner_id_back_path = await upload('vehicle-verifications', userId, 'owner-id-back', document({ title: 'OWNER ID - BACK', lines: ['ID NO. 7788-1200-4455'] }));
    paths.owner_signatures_path = await upload('vehicle-verifications', userId, 'owner-signatures', document({ title: 'SPECIMEN SIGNATURES', lines: [`${owner}:`, '   R. PASCUAL  R. PASCUAL  R. PASCUAL'] }));
  }
  return paths;
}

// Returns key -> approved vehicle id (for carpools).
export async function seedVehicles(ids) {
  const approved = {};
  for (const v of VEHICLES) {
    const userId = ids[v.key];
    if (!userId) continue;
    const images = await uploadVehicleImages(userId, v);
    const reviewed = v.status === 'approved' || v.status === 'rejected';
    const submittedAt = hoursAgo(v.hoursAgo ?? 24 * 45);
    const row = await run(`${v.key} vehicle`, admin.from('vehicles').insert({
      user_id: userId, make: v.make, model: v.model, year: v.year, color: v.color, plate_number: v.plate, is_primary: true,
      ownership_type: v.borrowed ? 'borrowed' : 'owned', verification_status: v.status, submitted_at: submittedAt,
      reviewer_id: reviewed ? ids.admin : null, reviewed_at: reviewed ? hoursAgo((v.hoursAgo ?? 24 * 45) - 5) : null,
      reviewer_notes: v.notes ?? null, ai_checked_at: v.ai ? submittedAt : null, ...(v.ai ?? {}), ...images,
    }).select('id').single());
    if (row?.id && v.status === 'approved') approved[v.key] = row.id;

    const number = licenceNumber(v.key);
    const expiry = v.status === 'approved' ? daysFromNow(400).slice(0, 10) : daysFromNow(700).slice(0, 10);
    const front = await upload('vehicle-verifications', userId, 'license-front', license({ name: displayName(v.key), number, expiry }));
    await run(`${v.key} licence`, admin.from('driver_licenses').insert({
      user_id: userId, source: 'upload', front_image_path: front, status: v.licence, expiry_date: expiry,
      restriction_codes: ['A', 'B'], license_number: number, ai_name_match: v.key !== 'joy' ? true : null, ai_flag: v.ai?.ai_flag ?? 'passed',
      ai_checked_at: submittedAt, submitted_at: submittedAt,
      reviewer_id: v.licence === 'pending' ? null : ids.admin, reviewed_at: v.licence === 'pending' ? null : hoursAgo((v.hoursAgo ?? 24 * 45) - 5),
      reviewer_notes: v.licence === 'rejected' ? 'Rejected together with the vehicle submission.' : null,
    }));
  }
  ok(`Vehicles: ${Object.keys(approved).length} approved drivers, ${VEHICLES.filter((v) => v.status === 'pending').length} pending, ${VEHICLES.filter((v) => v.status === 'rejected').length} rejected`);
  return approved;
}
