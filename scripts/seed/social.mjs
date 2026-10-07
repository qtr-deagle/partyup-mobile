// Social graph and messaging: friends, pending requests, a block, DMs with
// unread messages / replies / reactions, trusted circles, notifications,
// and live map positions.

import { admin, hoursAgo, minutesAgo, ok, run, warn } from './lib.mjs';

const FRIENDS = [
  ['miggy', 'carla'], ['miggy', 'enzo'], ['miggy', 'trisha'], ['miggy', 'jun'], ['miggy', 'lia'],
  ['carla', 'ana'], ['carla', 'lia'], ['carla', 'rico'], ['jun', 'trisha'], ['jun', 'paolo'],
  ['trisha', 'ramon'], ['trisha', 'paolo'], ['trisha', 'kim'], ['trisha', 'bea'], ['enzo', 'bea'],
  ['enzo', 'lia'], ['lia', 'bea'], ['kim', 'lia'], ['marco', 'lia'], ['marco', 'enzo'],
  ['ana', 'paolo'], ['ana', 'bea'], ['joy', 'ana'], ['dante', 'marco'],
];

// [from, to]: Miggy has one incoming and one outgoing request.
const PENDING_REQUESTS = [['kim', 'miggy'], ['miggy', 'marco'], ['ramon', 'carla'], ['vince', 'jun']];

const TRUSTED = [
  { owner: 'trisha', contact: 'jun', relationship: 'Friend', status: 'accepted' },
  { owner: 'trisha', contact: 'paolo', relationship: 'Friend', status: 'accepted' },
  { owner: 'trisha', contact: 'bea', relationship: 'Friend', status: 'accepted' },
  { owner: 'trisha', contact: 'kim', relationship: 'Friend', status: 'pending' },
  { owner: 'miggy', contact: 'carla', relationship: 'Friend', status: 'accepted' },
  { owner: 'miggy', contact: 'trisha', relationship: 'Friend', status: 'accepted' },
  { owner: 'lia', contact: 'bea', relationship: 'Friend', status: 'accepted' },
];

// Each message: [sender, body, minutesAgo, extras]. `read` = minutes ago
// each person last read the thread (null = never), so some threads show unread.
const DMS = [
  {
    people: ['miggy', 'carla'], read: { carla: 5, miggy: 200 },
    messages: [
      ['carla', 'Uy Miggy, sama ka sa Biak run this weekend?', 600],
      ['miggy', 'G ako! Saan pickup?', 590],
      ['carla', 'Plaridel Petron, 5:20AM', 585, { replyTo: 1 }],
      ['miggy', 'Sige sige 👍', 580, { reactions: { carla: '❤️' } }],
      ['carla', 'Sent ko na sa group chat yung route', 30],
      ['carla', 'Pa-confirm na lang ng GCash mo para ma-mark ko as paid', 12],
    ],
  },
  {
    people: ['miggy', 'trisha'], read: { miggy: 1, trisha: 1 },
    messages: [
      ['trisha', 'Ang ganda ng shots mo sa Biak!', 1500],
      ['miggy', 'Salamat! Ikaw nag-turo sakin eh 😆', 1490, { reactions: { trisha: '😆' } }],
      ['trisha', 'Hahaha next hike, Mt. Manalmon?', 1480],
      ['miggy', 'Game!', 1470],
    ],
  },
  {
    people: ['miggy', 'enzo'], read: { enzo: 2, miggy: 400 },
    messages: [
      ['enzo', 'Bro, pahiram ng headlamp sa Sabado?', 180],
      ['enzo', 'Yung sa Biak run 🙏', 178],
    ],
  },
  {
    people: ['trisha', 'kim'], read: { trisha: 10, kim: 10 },
    messages: [
      ['kim', 'Hi Trisha! Pwede ba ako sumali sa guild niyo?', 2900],
      ['trisha', 'Open guild kami! Just tap Join sa Biak-na-Bato Trailblazers', 2880],
      ['kim', 'Uy salamat, nag-request din ako sa Malolos 😅', 2870],
      ['trisha', 'Pwede naman both i-try hehe', 2860],
    ],
  },
  {
    people: ['lia', 'bea'], read: { bea: 60, lia: 60 },
    messages: [
      ['bea', 'Lia, salamat sa pagsama sa river day!', 9000],
      ['lia', 'Thank you din ate Bea! Super saya', 8990, { reactions: { bea: '❤️' } }],
    ],
  },
  {
    people: ['ana', 'carla'], read: { ana: 300, carla: 2 },
    messages: [
      ['carla', 'Ate Ana, nag-apply ako as guild leader for Pulilan', 120],
      ['carla', 'Sana okay lang 🙏', 118],
    ],
  },
];

const NOTIFICATIONS = [
  { to: 'miggy', type: 'trip', title: 'Ride confirmed', message: 'Carla accepted you on "Weekend Biak-na-Bato run".', trip: 'carla-biak', read: true, hours: 50 },
  { to: 'miggy', type: 'message', title: 'Carla Mendoza', message: 'Pa-confirm na lang ng GCash mo para ma-mark ko as paid', thread: ['miggy', 'carla'], read: false, hours: 0.2 },
  { to: 'miggy', type: 'system', title: 'Friend request', message: 'Kim Aquino wants to be friends.', route: '/friends', read: false, hours: 6 },
  { to: 'miggy', type: 'match', title: 'Travel buddy nearby', message: 'Trisha Reyes is less than 1 km away.', read: true, hours: 30 },
  { to: 'carla', type: 'trip', title: 'New ride request', message: 'Kim Aquino asked to join "Weekend Biak-na-Bato run" (₱176).', trip: 'carla-biak', read: false, hours: 3 },
  { to: 'carla', type: 'trip', title: 'Payment received', message: 'Miggy Villareal reported a ₱198 GCash payment.', trip: 'carla-biak', read: true, hours: 40 },
  { to: 'jun', type: 'trip', title: 'Trip is full', message: '"Angat Dam sunrise drive" has no seats left.', trip: 'jun-angat', read: false, hours: 20 },
  { to: 'marco', type: 'trip', title: 'New ride request', message: 'Miggy Villareal asked to join "Meycauayan to Manila Ocean Park".', trip: 'marco-ocean', read: false, hours: 5 },
  { to: 'enzo', type: 'system', title: 'Report received', message: 'We got your payment report and a staff member will look into it.', read: false, hours: 26 },
  { to: 'kim', type: 'system', title: 'Join request sent', message: 'Malolos Wanderers will review your request.', route: '/guild', read: true, hours: 70 },
  { to: 'paolo', type: 'trip', title: 'New tour booking', message: 'Kim Aquino wants to join "Biak-na-Bato 2D1N Trails & Caves".', trip: 'paolo-biak-tour', read: false, hours: 8 },
  { to: 'trisha', type: 'system', title: 'Trusted circle', message: 'Jun dela Cruz accepted your trusted contact invite.', route: '/trusted-circle', read: true, hours: 100 },
];

// Around Malolos / Meycauayan so the Map and Nearby tabs have people on them.
export const LOCATIONS = [
  ['miggy', 14.8437, 120.8121], ['carla', 14.8471, 120.8172], ['trisha', 14.8512, 120.8095], ['enzo', 14.8402, 120.8203],
  ['lia', 14.8389, 120.8061], ['kim', 14.7392, 120.9588], ['marco', 14.7351, 120.9632], ['jun', 14.8455, 120.8245],
  ['ana', 14.8526, 120.8161], ['ramon', 14.8551, 120.8139], ['paolo', 14.8303, 120.8124], ['bea', 14.8366, 120.7999],
];

function directKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export async function seedLocations(ids) {
  const rows = LOCATIONS.filter(([key]) => ids[key]).map(([key, latitude, longitude]) => ({
    user_id: ids[key], latitude, longitude, accuracy_m: 30, is_visible: true, updated_at: new Date().toISOString(),
  }));
  await run('current locations', admin.from('current_locations').upsert(rows));
  ok(`Map: ${rows.length} live positions (they hide from Nearby after 5 min idle; run npm run demo:locations right before a demo)`);
}

export async function seedSocial(ids, trips = {}) {
  const friendRows = FRIENDS.filter(([a, b]) => ids[a] && ids[b]).map(([a, b]) => ({
    requester_id: ids[a], recipient_id: ids[b], status: 'accepted', responded_at: hoursAgo(24 * 20), created_at: hoursAgo(24 * 21),
  }));
  await run('friends', admin.from('friend_requests').insert(friendRows));
  await run('pending friend requests', admin.from('friend_requests').insert(
    PENDING_REQUESTS.filter(([a, b]) => ids[a] && ids[b]).map(([a, b]) => ({ requester_id: ids[a], recipient_id: ids[b], status: 'pending', created_at: hoursAgo(6) })),
  ));
  if (ids.lia && ids.vince) await run('block', admin.from('blocked_users').insert({ blocker_id: ids.lia, blocked_id: ids.vince }));

  let messageCount = 0;
  const threads = {};
  for (const dm of DMS) {
    const [a, b] = dm.people;
    if (!ids[a] || !ids[b]) continue;
    const thread = await run(`dm ${a}-${b}`, admin.from('chat_threads').insert({
      created_by: ids[dm.messages[0][0]], thread_type: 'direct', direct_key: directKey(ids[a], ids[b]),
    }).select('id').single());
    if (!thread?.id) continue;
    threads[`${a}:${b}`] = thread.id;

    await run(`dm ${a}-${b} participants`, admin.from('chat_participants').insert(
      dm.people.map((key) => ({
        thread_id: thread.id, user_id: ids[key],
        last_read_at: dm.read[key] == null ? null : minutesAgo(dm.read[key]),
        last_delivered_at: minutesAgo(Math.min(dm.read[key] ?? 1, 1)),
      })),
    ));

    // Insert one by one so replies can point at earlier message ids.
    const messageIds = [];
    for (const [sender, body, ago, extra = {}] of dm.messages) {
      const message = await run(`dm ${a}-${b} message`, admin.from('chat_messages').insert({
        thread_id: thread.id, sender_id: ids[sender], body, message_type: 'text', created_at: minutesAgo(ago),
        reply_to_id: extra.replyTo != null ? (messageIds[extra.replyTo] ?? null) : null,
      }).select('id').single());
      messageIds.push(message?.id ?? null);
      if (message?.id) messageCount += 1;
      for (const [who, emoji] of Object.entries(extra.reactions ?? {})) {
        if (message?.id) await run('reaction', admin.from('chat_message_reactions').insert({ message_id: message.id, user_id: ids[who], emoji, thread_id: thread.id }));
      }
    }
  }

  await run('trusted contacts', admin.from('trusted_contacts').insert(
    TRUSTED.filter((t) => ids[t.owner] && ids[t.contact]).map((t) => ({
      user_id: ids[t.owner], contact_user_id: ids[t.contact], relationship: t.relationship, status: t.status, alerts_enabled: true,
    })),
  ));

  const notificationRows = NOTIFICATIONS.filter((n) => ids[n.to]).map((n) => {
    const data = { type: n.type };
    if (n.trip && trips[n.trip]) data.trip_id = trips[n.trip].id;
    if (n.thread) data.thread_id = threads[n.thread.join(':')];
    if (n.route) data.route = n.route;
    return { user_id: ids[n.to], type: n.type, title: n.title, message: n.message, read: n.read, data, created_at: hoursAgo(n.hours) };
  });
  await run('notifications', admin.from('notifications').insert(notificationRows));

  await seedLocations(ids);
  if (!Object.keys(threads).length) warn('no DM threads created');
  ok(`Social: ${friendRows.length} friendships, ${PENDING_REQUESTS.length} pending requests, ${Object.keys(threads).length} DMs (${messageCount} messages), ${TRUSTED.length} trusted contacts, ${notificationRows.length} notifications`);
}
