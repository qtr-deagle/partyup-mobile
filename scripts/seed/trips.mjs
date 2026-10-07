// Trips: carpools in every state plus guided tours, with members, payments,
// trip chats and ratings. Raw inserts mirror create_trip(): the creator joins
// as driver/coordinator, and triggers handle seats, fares, started_at and the
// trip group chat (sync_trip_chat_member).

import { admin, daysFromNow, hoursAgo, ok, pick, random, run, warn } from './lib.mjs';

const PLACES = {
  maloloscrossing: { label: 'Malolos Crossing (Jollibee)', municipality: 'Malolos', lat: 14.8433, lng: 120.8114 },
  barasoain: { label: 'Barasoain Church', municipality: 'Malolos', lat: 14.8459, lng: 120.8125 },
  capitol: { label: 'Bulacan Provincial Capitol', municipality: 'Malolos', lat: 14.8527, lng: 120.816 },
  plaridel: { label: 'Plaridel Bypass Petron', municipality: 'Plaridel', lat: 14.8869, lng: 120.8573 },
  baliwag: { label: 'Baliwag Public Market', municipality: 'Baliwag', lat: 14.9548, lng: 120.8969 },
  biak: { label: 'Biak-na-Bato National Park', municipality: 'San Miguel', lat: 15.1078, lng: 121.0794 },
  norzagaray: { label: 'Norzagaray Town Plaza', municipality: 'Norzagaray', lat: 14.9115, lng: 121.0485 },
  angat: { label: 'Angat Dam Viewdeck', municipality: 'Norzagaray', lat: 14.9106, lng: 121.1661 },
  meycauayan: { label: 'Meycauayan Church', municipality: 'Meycauayan', lat: 14.7369, lng: 120.9606 },
  marilao: { label: 'SM City Marilao', municipality: 'Marilao', lat: 14.7577, lng: 120.9476 },
  obando: { label: 'Obando Church', municipality: 'Obando', lat: 14.7088, lng: 120.9369 },
  hagonoy: { label: 'Hagonoy Fish Port', municipality: 'Hagonoy', lat: 14.8347, lng: 120.7329 },
  paombong: { label: 'Paombong Vinegar Village', municipality: 'Paombong', lat: 14.8311, lng: 120.7889 },
  oceanpark: { label: 'Manila Ocean Park', municipality: null, lat: 14.5791, lng: 120.9724 },
};

// rider: [key, { status, payment, offer, pickup }]
// state: open | ongoing | completed | cancelled (full is computed by triggers)
const TRIPS = [
  {
    ref: 'carla-biak', creator: 'carla', type: 'carpool', state: 'open', start: 3, startHour: 5,
    title: 'Weekend Biak-na-Bato run', from: 'maloloscrossing', to: 'biak', stops: ['maloloscrossing', 'plaridel', 'baliwag'], seats: 3,
    notes: 'Leaving 5AM sharp. Bring water and a jacket, may ambon sa taas.',
    riders: [['miggy', { status: 'accepted', payment: 'paid', offer: 180, pickup: 'plaridel' }], ['enzo', { status: 'accepted', payment: 'unpaid', offer: 220, pickup: 'maloloscrossing' }], ['kim', { status: 'pending', offer: 160, pickup: 'baliwag' }]],
    chat: [['carla', 'Hi guys! 5AM tayo sa Malolos Crossing ha'], ['miggy', 'Noted! Sa Plaridel Petron ako sasakay'], ['enzo', 'G! Magdadala ako ng pandesal'], ['carla', 'Ayos 😄 see you!']],
  },
  {
    ref: 'jun-angat', creator: 'jun', type: 'carpool', state: 'open', start: 5, startHour: 4, guild: 'biak',
    title: 'Angat Dam sunrise drive', from: 'norzagaray', to: 'angat', stops: ['norzagaray'], seats: 2,
    notes: 'Guild trip! Sunrise at the viewdeck then lugaw sa bayan.',
    riders: [['trisha', { status: 'accepted', payment: 'paid', offer: 120, pickup: 'norzagaray' }], ['ramon', { status: 'accepted', payment: 'pending', offer: 120, pickup: 'norzagaray' }]],
    chat: [['jun', 'Full na tayo! 4AM sa plaza.'], ['trisha', 'Dala ako camera 📷'], ['ramon', 'Sent na GCash ko, pa-confirm na lang']],
  },
  {
    ref: 'marco-ocean', creator: 'marco', type: 'carpool', state: 'open', start: 8, startHour: 8,
    title: 'Meycauayan to Manila Ocean Park', from: 'meycauayan', to: 'oceanpark', stops: ['meycauayan', 'marilao'], seats: 4,
    notes: 'Family-friendly trip. NLEX toll is shared in the contribution.',
    riders: [['lia', { status: 'accepted', payment: 'unpaid', offer: 250, pickup: 'meycauayan' }], ['miggy', { status: 'pending', offer: 230, pickup: 'marilao' }]],
    chat: [['marco', 'Welcome Lia! 8AM sa simbahan ng Meycauayan'], ['lia', 'Thank you po!']],
  },
  {
    ref: 'carla-hagonoy', creator: 'carla', type: 'carpool', state: 'ongoing', start: 0, startHour: null, startHoursAgo: 1,
    title: 'Hagonoy seafood lunch', from: 'capitol', to: 'hagonoy', stops: ['capitol', 'paombong'], seats: 3,
    riders: [['miggy', { status: 'accepted', payment: 'paid', offer: 140, pickup: 'capitol' }], ['trisha', { status: 'accepted', payment: 'paid', offer: 120, pickup: 'paombong' }]],
    chat: [['carla', 'On the way na tayo!'], ['trisha', 'Nasa Paombong na ako, sa may vinegar sign'], ['carla', '5 mins!']],
  },
  {
    ref: 'carla-baliwag', creator: 'carla', type: 'carpool', state: 'completed', start: -10, startHour: 10,
    title: 'Baliwag food crawl', from: 'maloloscrossing', to: 'baliwag', stops: ['maloloscrossing', 'plaridel'], seats: 3,
    riders: [['miggy', { status: 'accepted', payment: 'paid', offer: 150, pickup: 'maloloscrossing' }], ['enzo', { status: 'accepted', payment: 'paid', offer: 150, pickup: 'plaridel' }]],
    chat: [['carla', 'Salamat sa sama guys! Sulit yung chicharon 😆'], ['miggy', 'Next time ulit!']],
  },
  {
    ref: 'jun-biak', creator: 'jun', type: 'carpool', state: 'completed', start: -20, startHour: 5,
    title: 'Biak-na-Bato hike carpool', from: 'norzagaray', to: 'biak', stops: ['norzagaray', 'baliwag'], seats: 4,
    riders: [['trisha', { status: 'accepted', payment: 'paid', offer: 200, pickup: 'norzagaray' }], ['ramon', { status: 'accepted', payment: 'paid', offer: 200, pickup: 'norzagaray' }], ['miggy', { status: 'accepted', payment: 'paid', offer: 180, pickup: 'baliwag' }]],
    chat: [['jun', 'Ingat sa trail guys'], ['ramon', 'Ang ganda ng Aguinaldo Cave!']],
  },
  {
    ref: 'marco-marilao', creator: 'marco', type: 'carpool', state: 'completed', start: -6, startHour: 13,
    title: 'Meycauayan to SM Marilao', from: 'meycauayan', to: 'marilao', stops: ['meycauayan'], seats: 3,
    riders: [['lia', { status: 'accepted', payment: 'paid', offer: 80, pickup: 'meycauayan' }], ['enzo', { status: 'accepted', payment: 'pending', offer: 80, pickup: 'meycauayan' }]],
    chat: [['enzo', 'Sir na-send ko na po via GCash yung 88'], ['marco', 'Check ko mamaya'], ['enzo', 'Sir paki-confirm po, 4 days na']],
  },
  {
    ref: 'marco-obando', creator: 'marco', type: 'carpool', state: 'cancelled', start: -2, startHour: 7,
    title: 'Obando Fertility Dance festival', from: 'meycauayan', to: 'obando', stops: ['meycauayan'], seats: 3,
    notes: 'Cancelled: car is in the casa for repairs, sorry!',
    riders: [['kim', { status: 'left', offer: 60, pickup: 'meycauayan' }]],
  },
  {
    ref: 'paolo-biak-tour', creator: 'paolo', type: 'tour', state: 'open', start: 12, startHour: 6, days: 2, price: 1500, seats: 10, guild: 'biak',
    title: 'Biak-na-Bato 2D1N Trails & Caves', from: 'baliwag', to: 'biak', tags: ['Mountain & Hiking', 'Nature & Falls', 'Adventure'],
    notes: 'Includes guide fee, environmental fee, and one camp dinner. Beginner-friendly pace.',
    itinerary: ['Meet at Baliwag market 6AM, drive to San Miguel. Aguinaldo Cave and Bahay Paniki. Camp setup and boodle dinner.', 'Sunrise at Banal na Bundok, river crossing at Madlum, lunch and back to Baliwag by 4PM.'],
    riders: [['jun', { status: 'accepted', payment: 'paid' }], ['trisha', { status: 'accepted', payment: 'pending' }], ['kim', { status: 'pending' }]],
    chat: [['paolo', 'Welcome sa tour! Pack light, may river crossing sa Day 2.'], ['trisha', 'Pwede po bang magdala ng hammock?'], ['paolo', 'Pwede! Bring a dry bag too.']],
  },
  {
    ref: 'ana-heritage', creator: 'ana', type: 'tour', state: 'open', start: 6, startHour: 7, days: 1, price: 450, seats: 15, guild: 'malolos',
    title: 'Malolos Heritage & Kakanin Walk', from: 'barasoain', to: 'capitol', tags: ['Heritage & Churches', 'Food Trip', 'History'],
    notes: 'Walking tour. Wear comfy shoes; entrance fees and merienda included.',
    itinerary: ['Barasoain Church museum, Casa Real, Malolos Cathedral, kakanin tasting at the old market, merienda at Bistro Maloleño.'],
    riders: [['miggy', { status: 'accepted', payment: 'paid' }], ['carla', { status: 'accepted', payment: 'paid' }], ['lia', { status: 'accepted', payment: 'unpaid' }]],
    chat: [['ana', 'See you sa Barasoain 7AM! 🏛'], ['carla', 'Excited sa kakanin 😋']],
  },
  {
    ref: 'bea-river', creator: 'bea', type: 'tour', state: 'completed', start: -14, startHour: 8, days: 1, price: 650, seats: 8, guild: 'hagonoy',
    title: 'Hagonoy River & Seafood Day', from: 'hagonoy', to: 'paombong', tags: ['Food Trip', 'Nature & Falls'],
    itinerary: ['Bangka ride through the Hagonoy river villages, seafood lunch at the fish port, Paombong vinegar village stop.'],
    riders: [['enzo', { status: 'accepted', payment: 'paid' }], ['lia', { status: 'accepted', payment: 'paid' }]],
    chat: [['bea', 'Thanks for joining! Upload your photos here 📸'], ['lia', 'Sobrang sarap ng alimango!']],
  },
];

const REVIEW_COMMENTS = {
  5: ['Super safe driver and on time. Highly recommended!', 'Ang saya kasama! Will ride again.', 'Very organized, clear meetup instructions.', 'Malinis ang sasakyan at magaling mag-drive.'],
  4: ['Good trip, medyo late lang ng konti sa pickup.', 'Friendly and respectful. Thanks!', 'Smooth ride overall.'],
  3: ['Okay naman, pero sobrang lakas ng music 😅', 'Fine trip, communication could be better.'],
};

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

function startDate(trip) {
  if (trip.startHoursAgo) return hoursAgo(trip.startHoursAgo);
  return daysFromNow(trip.start, trip.startHour);
}

// Returns ref -> { id, ...trip }.
export async function seedTrips(ids, vehicleIds, guildIds = {}) {
  const trips = {};
  let feedbackCount = 0;

  for (const trip of TRIPS) {
    const creatorId = ids[trip.creator];
    if (!creatorId) continue;
    const from = PLACES[trip.from];
    const to = PLACES[trip.to];
    const startAt = startDate(trip);
    const isCarpool = trip.type === 'carpool';
    const endAt = new Date(new Date(startAt).getTime() + (isCarpool ? 4 : (trip.days ?? 1) * 24 - 14) * 3_600_000).toISOString();

    const inserted = await run(`trip ${trip.ref}`, admin.from('trips').insert({
      creator_id: creatorId, title: trip.title, trip_type: trip.type,
      origin: from.label, destination: to.label, origin_lat: from.lat, origin_lng: from.lng, destination_lat: to.lat, destination_lng: to.lng,
      meetup_municipality: from.municipality, meetup_landmark: from.label, meetup_lat: from.lat, meetup_lng: from.lng,
      start_at: startAt, end_at: trip.state === 'completed' ? endAt : isCarpool ? null : endAt,
      status: 'open', visibility: 'public', seats_total: trip.seats, seats_available: trip.seats,
      total_cost: isCarpool ? null : trip.price * trip.seats, price_per_person: isCarpool ? null : trip.price,
      invite_code: inviteCode(), notes: trip.notes ?? null, duration_days: isCarpool ? null : trip.days,
      interest_tags: trip.tags ?? [], vehicle_id: isCarpool ? (vehicleIds[trip.creator] ?? null) : null,
      route_stops: isCarpool ? (trip.stops ?? []).map((key) => PLACES[key]) : [],
      guild_id: trip.guild ? (guildIds[trip.guild] ?? null) : null,
      created_at: new Date(new Date(startAt).getTime() - 5 * 24 * 3_600_000).toISOString(),
    }).select('id').single());
    if (!inserted?.id) continue;
    const tripId = inserted.id;
    trips[trip.ref] = { id: tripId, ...trip };

    await run(`trip ${trip.ref} creator`, admin.from('trip_members').insert({
      trip_id: tripId, user_id: creatorId, member_role: isCarpool ? 'driver' : 'coordinator', status: 'accepted', joined_at: hoursAgo(24 * 6),
    }));

    if (trip.itinerary) {
      await run(`trip ${trip.ref} itinerary`, admin.from('trip_itinerary_days').insert(
        trip.itinerary.map((description, i) => ({ trip_id: tripId, day_number: i + 1, description })),
      ));
    }

    for (const [key, r] of trip.riders ?? []) {
      const userId = ids[key];
      if (!userId) continue;
      const pickup = r.pickup ? PLACES[r.pickup] : null;
      const fee = r.offer ? Math.round(r.offer * 0.1 * 100) / 100 : null;
      const amount = isCarpool ? (r.offer ? r.offer + fee : null) : trip.price;
      const accepted = r.status === 'accepted';
      const member = await run(`trip ${trip.ref} rider ${key}`, admin.from('trip_members').insert({
        trip_id: tripId, user_id: userId, member_role: 'member', status: r.status,
        joined_at: accepted || r.status === 'left' ? hoursAgo(24 * 4) : null,
        pickup_label: pickup?.label ?? null, pickup_lat: pickup?.lat ?? null, pickup_lng: pickup?.lng ?? null,
        offered_amount: isCarpool ? (r.offer ?? null) : null, platform_fee: isCarpool ? fee : null,
        payment_amount: accepted ? amount : null, payment_status: accepted ? (r.payment ?? 'unpaid') : 'unpaid',
        payment_reference: r.payment === 'paid' || r.payment === 'pending' ? `GCASH-${Math.floor(1e9 + random() * 9e9)}` : null,
        payment_reported_at: r.payment === 'paid' || r.payment === 'pending' ? hoursAgo(24 * 3) : null,
        payment_confirmed_at: r.payment === 'paid' ? hoursAgo(24 * 2) : null,
      }).select('id').single());

      if (member?.id && (r.payment === 'paid' || r.payment === 'pending')) {
        await run(`payment ${trip.ref} ${key}`, admin.from('payment_history').insert({
          user_id: userId, trip_id: tripId, trip_member_id: member.id, amount, currency: 'PHP', status: r.payment,
          reference: `GCASH-${Math.floor(1e9 + random() * 9e9)}`, gateway: 'manual',
          confirmed_by: r.payment === 'paid' ? creatorId : null, notes: `Contribution for ${trip.title}`,
        }));
      }
    }

    // Walk the trip through its lifecycle so started_at / end_at stay coherent.
    if (trip.state === 'ongoing' || trip.state === 'completed') {
      await run(`trip ${trip.ref} start`, admin.from('trips').update({ status: 'ongoing' }).eq('id', tripId));
    }
    if (trip.state === 'completed') {
      await run(`trip ${trip.ref} complete`, admin.from('trips').update({ status: 'completed', end_at: endAt }).eq('id', tripId));
    }
    if (trip.state === 'cancelled') {
      await run(`trip ${trip.ref} cancel`, admin.from('trips').update({ status: 'cancelled' }).eq('id', tripId));
    }

    if (trip.chat?.length) await seedTripChat(ids, tripId, trip, startAt);
    if (trip.state === 'completed') feedbackCount += await seedRatings(ids, tripId, trip);
  }

  await run('trip favorites', admin.from('trip_favorites').insert(
    [['kim', 'paolo-biak-tour'], ['miggy', 'ana-heritage'], ['lia', 'paolo-biak-tour'], ['enzo', 'carla-biak']]
      .filter(([key, ref]) => ids[key] && trips[ref])
      .map(([key, ref]) => ({ user_id: ids[key], trip_id: trips[ref].id })),
  ));

  const count = (state) => TRIPS.filter((t) => t.state === state).length;
  ok(`Trips: ${Object.keys(trips).length} (${count('open')} upcoming, ${count('ongoing')} ongoing, ${count('completed')} completed, ${count('cancelled')} cancelled), ${feedbackCount} ratings`);
  return trips;
}

async function seedTripChat(ids, tripId, trip, startAt) {
  const { data: thread } = await admin.from('chat_threads').select('id').eq('trip_id', tripId).maybeSingle();
  if (!thread) {
    warn(`trip ${trip.ref}: no trip chat thread (sync_trip_chat_member trigger missing?)`);
    return;
  }
  const base = Math.min(Date.now(), new Date(startAt).getTime()) - trip.chat.length * 40 * 60_000;
  await run(`trip ${trip.ref} chat`, admin.from('chat_messages').insert(
    trip.chat.filter(([key]) => ids[key]).map(([key, body], i) => ({
      thread_id: thread.id, sender_id: ids[key], body, message_type: 'text', created_at: new Date(base + i * 40 * 60_000).toISOString(),
    })),
  ));
}

async function seedRatings(ids, tripId, trip) {
  const people = [trip.creator, ...(trip.riders ?? []).filter(([, r]) => r.status === 'accepted').map(([key]) => key)].filter((key) => ids[key]);
  const rows = [];
  for (const author of people) {
    for (const target of people) {
      if (author === target || random() < 0.25) continue;
      const rating = random() < 0.65 ? 5 : random() < 0.75 ? 4 : 3;
      rows.push({
        author_id: ids[author], target_user_id: ids[target], trip_id: tripId, feedback_type: 'user', rating,
        comment: random() < 0.8 ? pick(REVIEW_COMMENTS[rating]) : null,
      });
    }
  }
  if (!rows.length) return 0;
  const result = await run(`ratings ${trip.ref}`, admin.from('feedback').insert(rows));
  return result ? rows.length : 0;
}
