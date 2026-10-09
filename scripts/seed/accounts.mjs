// The cast: every seeded person, the state they exist to demo, and the
// account creation itself. Other sections refer to people by `key`.

import { admin, DEMO_PASSWORD, isSeedEmail, ok, seedEmail, warn } from './lib.mjs';

// verification: 'approved' is set here; 'pending' / 'rejected' / 'unverified'
// people get their ID rows from verification.mjs.
// interests come from INTEREST_OPTIONS in lib/interests.ts.
export const PEOPLE = [
  // Staff
  { key: 'admin', first: 'Grace', last: 'Lim', dob: '02/09/1988', city: 'Malolos', role: 'admin', verification: 'approved', gender: 'female', interests: ['Cultural', 'Food'], demos: 'Admin: website staff dashboard, all review queues' },
  { key: 'ana', first: 'Ana', last: 'Reyes', dob: '01/01/1990', city: 'Malolos', role: 'guild_leader', verification: 'approved', gender: 'female', interests: ['Beach', 'Food'], demos: 'Guild leader of Malolos Wanderers, has a join request + guild report to handle' },
  { key: 'paolo', first: 'Paolo', last: 'Santos', dob: '03/22/1991', city: 'San Miguel', role: 'guild_leader', verification: 'approved', gender: 'male', interests: ['Hiking', 'Adventure'], demos: 'Guild leader of Biak-na-Bato Trailblazers (Platinum), hosts the Biak tour' },
  { key: 'bea', first: 'Bea', last: 'Cruz', dob: '11/08/1993', city: 'Hagonoy', role: 'guild_leader', verification: 'approved', gender: 'female', interests: ['Beach', 'Photography'], demos: 'Guild leader of Hagonoy River Riders, resolved an SOS' },

  // Drivers: approved ID + approved vehicle + approved license
  { key: 'carla', first: 'Carla', last: 'Mendoza', dob: '07/30/1996', city: 'Malolos', role: 'traveler', verification: 'approved', gender: 'female', interests: ['Food', 'City'], demos: 'Driver (Legend rank), upcoming/ongoing/completed carpools, pending leader application' },
  { key: 'jun', first: 'Jun', last: 'dela Cruz', dob: '02/14/1995', city: 'Norzagaray', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Hiking', 'Adventure'], demos: 'Driver with a pending join request to accept, full carpool' },
  { key: 'marco', first: 'Marco', last: 'Ramos', dob: '08/17/1994', city: 'Meycauayan', role: 'traveler', verification: 'approved', gender: 'male', interests: ['City', 'Nightlife'], demos: 'Driver, completed + cancelled carpools, gets payment report' },

  // Riders / everyday travelers
  { key: 'miggy', first: 'Miggy', last: 'Villareal', dob: '05/15/1998', city: 'Bulakan', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Hiking', 'Budget'], demos: 'Rider: unread DMs, star reviews, trip chats, a pending ride request' },
  { key: 'trisha', first: 'Trisha', last: 'Reyes', dob: '09/03/1999', city: 'San Ildefonso', role: 'traveler', verification: 'approved', gender: 'female', interests: ['Hiking', 'Photography'], demos: 'Safety demo: trusted circle, resolved SOS, warning-mode history' },
  { key: 'ramon', first: 'Ramon', last: 'Bautista', dob: '12/19/1992', city: 'San Rafael', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Adventure', 'Budget'], demos: 'Rider, reported for behavior' },
  { key: 'enzo', first: 'Enzo', last: 'Villanueva', dob: '04/27/1997', city: 'Paombong', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Food', 'Beach'], demos: 'Rider, filed a payment report' },
  { key: 'lia', first: 'Lia', last: 'Navarro', dob: '06/11/2000', city: 'Calumpit', role: 'traveler', verification: 'approved', gender: 'female', interests: ['Beach', 'Wellness'], demos: 'New rider (Rookie), open support ticket' },
  { key: 'kim', first: 'Kim', last: 'Aquino', dob: '10/05/1998', city: 'Meycauayan', role: 'traveler', verification: 'approved', gender: 'female', interests: ['Beach', 'Backpacking'], noPhone: true, demos: 'No guild yet, pending request to join Malolos; no mobile number yet (sees the add-number prompt, trips blocked)' },

  // Vehicle review queue: approved people with a vehicle waiting
  { key: 'rico', first: 'Rico', last: 'Galang', dob: '01/23/1990', city: 'Baliwag', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Adventure', 'City'], demos: 'Vehicle queue: owned car, AI passed, pending license' },
  { key: 'joy', first: 'Joy', last: 'Pascual', dob: '03/30/1997', city: 'Plaridel', role: 'traveler', verification: 'approved', gender: 'female', interests: ['Food', 'Cultural'], demos: 'Vehicle queue: BORROWED car with authorization letter + owner ID' },
  { key: 'dante', first: 'Dante', last: 'Lopez', dob: '09/12/1985', city: 'Santa Maria', role: 'traveler', verification: 'approved', gender: 'male', interests: ['Budget', 'Backpacking'], demos: 'Vehicle queue: AI plate mismatch' },
  { key: 'vince', first: 'Vince', last: 'Tan', dob: '05/05/1993', city: 'Marilao', role: 'traveler', verification: 'approved', gender: 'male', interests: ['City', 'Nightlife'], demos: 'Vehicle rejected (blurry OR/CR), can resubmit' },

  // ID review queue
  { key: 'nico', first: 'Nico', last: 'Serrano', dob: '07/07/1999', city: 'Guiguinto', role: 'traveler', verification: 'pending', gender: 'male', interests: ['Hiking', 'Food'], demos: 'ID queue: AI high confidence, easy approve' },
  { key: 'sofia', first: 'Sofia', last: 'Castro', dob: '12/01/2001', city: 'Bocaue', role: 'traveler', verification: 'pending', gender: 'female', interests: ['Beach', 'Photography'], demos: 'ID queue: AI needs review' },
  { key: 'andrea', first: 'Andrea', last: 'Morales', dob: '04/18/1996', city: 'Pulilan', role: 'traveler', verification: 'pending', gender: 'female', interests: ['Cultural', 'Wellness'], demos: 'ID queue: low selfie similarity, likely reject' },
  { key: 'gabby', first: 'Gabby', last: 'Flores', dob: '08/21/2008', city: 'Bustos', role: 'traveler', verification: 'pending', gender: 'female', interests: ['Food', 'City'], demos: 'ID queue: AI flags as possibly underage' },
  { key: 'luis', first: 'Luis', last: 'Domingo', dob: '11/11/1994', city: 'San Jose del Monte', role: 'traveler', verification: 'pending', gender: 'male', interests: ['Adventure', 'Budget'], demos: 'ID queue: address on ID is outside Bulacan' },
  { key: 'ella', first: 'Ella', last: 'Mercado', dob: '02/28/1997', city: 'Obando', role: 'traveler', verification: 'pending', gender: 'female', interests: ['Beach', 'Food'], demos: 'ID queue: resubmitted after an earlier rejection' },
  { key: 'pia', first: 'Pia', last: 'Ocampo', dob: '06/06/2000', city: 'Balagtas', role: 'traveler', verification: 'rejected', gender: 'female', interests: ['Photography'], demos: 'ID rejected (blurry photo), sees resubmit prompt' },
  { key: 'mark', first: 'Mark', last: 'Valdez', dob: '10/10/1995', city: 'Pandi', role: 'traveler', verification: 'rejected', gender: 'male', interests: ['Nightlife', 'City'], demos: 'ID rejected (name mismatch)' },
  { key: 'tomas', first: 'Tomas', last: 'Aguilar', dob: '03/03/1992', city: 'Angat', role: 'traveler', verification: 'unverified', gender: 'male', interests: ['Hiking'], demos: 'Signed up, never submitted an ID (onboarding gate)' },
];

export function person(key) {
  const found = PEOPLE.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown seed person "${key}"`);
  return found;
}

export function displayName(key) {
  const p = person(key);
  return `${p.first} ${p.last}`;
}

async function createPerson(p) {
  const email = seedEmail(p.key);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: `${p.first} ${p.last}`,
      first_name: p.first,
      last_name: p.last,
      date_of_birth: p.dob,
      interests: p.interests,
      municipality: p.city,
    },
  });
  if (error || !data.user) {
    warn(`create ${email}: ${error?.message}`);
    return null;
  }

  // handle_new_user built the profile from metadata. Role, terms and
  // approval aren't in metadata; approval needs city, so set them together.
  const handle = `09${String(170000000 + Math.abs(hash(p.key)) % 9999999).padStart(9, '0')}`;
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      role: p.role,
      city: p.city,
      country: 'Philippines',
      terms_accepted_at: new Date().toISOString(),
      gcash_handle: p.verification === 'approved' ? handle : null,
      // Mobile numbers are required for trips (202610090005); same fake number as the handle.
      phone: p.noPhone ? null : handle,
      ...(p.verification === 'approved' ? { verification_status: 'approved' } : {}),
    })
    .eq('id', data.user.id);
  if (profileError) {
    warn(`profile ${email}: ${profileError.message}`);
    return null;
  }
  return data.user.id;
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

// Returns key -> user id.
export async function createPeople() {
  const ids = {};
  for (const p of PEOPLE) {
    const id = await createPerson(p);
    if (id) ids[p.key] = id;
  }
  ok(`${Object.keys(ids).length}/${PEOPLE.length} accounts created`);
  return ids;
}

export async function listSeedUsers() {
  const matches = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    // Also sweep up accounts from the old @partyup.demo seed.
    matches.push(...data.users.filter((user) => isSeedEmail(user.email) || user.email?.endsWith('@partyup.demo')));
    if (data.users.length < 200) break;
    page += 1;
  }
  return matches;
}

// Loads ids for an already-seeded cast (for --only runs).
export async function existingIds() {
  const ids = {};
  for (const user of await listSeedUsers()) {
    const p = PEOPLE.find((candidate) => seedEmail(candidate.key) === user.email.toLowerCase());
    if (p) ids[p.key] = user.id;
  }
  return ids;
}

const BUCKETS = ['id-verifications', 'vehicle-verifications', 'report-evidence', 'avatars'];

export async function deleteSeedUsers() {
  const users = await listSeedUsers();
  for (const user of users) {
    // Storage objects aren't cascaded, so clear each user's folders first.
    for (const bucket of BUCKETS) {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) warn(`delete ${user.email}: ${error.message}`);
    else console.log(`  deleted ${user.email}`);
  }
  return users.length;
}
