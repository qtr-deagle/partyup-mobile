// Guilds: three guilds with members across every rank, points over last
// month and this month (leaderboards + season medals), a join request, a
// leader application, guild chat, PartyUp outings and guild reports.

import { admin, daysFromNow, hoursAgo, ok, random, run, warn } from './lib.mjs';

const GUILDS = [
  {
    key: 'malolos', leader: 'ana', name: 'Malolos Wanderers', tagline: 'Heritage towns, good food, better company', emblem: 'shield', color: '#2563EB', joinPolicy: 'approval',
    description: 'Weekend heritage walks and food trips around the capital. First-timers welcome, buddy system on every outing.', focus: ['tours', 'food', 'city'], areas: ['Malolos', 'Bulakan', 'Guiguinto'],
  },
  {
    key: 'biak', leader: 'paolo', name: 'Biak-na-Bato Trailblazers', tagline: 'Every trail in Bulacan, one weekend at a time', emblem: 'mountain', color: '#059669', joinPolicy: 'open',
    description: 'Hikes, caves and river crossings in San Miguel, DRT and Norzagaray. We carpool from Baliwag and Norzagaray.', focus: ['mountains', 'camping', 'carpool'], areas: ['San Miguel', 'Norzagaray', 'Doña Remedios Trinidad', 'San Ildefonso'],
  },
  {
    key: 'hagonoy', leader: 'bea', name: 'Hagonoy River Riders', tagline: 'Rivers, rafts and roadside seafood', emblem: 'wave', color: '#0891B2', joinPolicy: 'approval',
    description: 'Bangka rides, fish ports and the best seafood along the western coast of Bulacan.', focus: ['beaches', 'food', 'tours'], areas: ['Hagonoy', 'Paombong', 'Calumpit'],
  },
];

// target = lifetime points (rank in the comment); lastMonth = share earned
// last month so season medals have something to award.
const MEMBERS = [
  { key: 'ana', guild: 'malolos', leader: true, target: 820, lastMonth: 0.5 }, // Gold I
  { key: 'paolo', guild: 'biak', leader: true, target: 1650, lastMonth: 0.6 }, // Platinum
  { key: 'bea', guild: 'hagonoy', leader: true, target: 380, lastMonth: 0.4 }, // Silver
  { key: 'miggy', guild: 'malolos', target: 240, lastMonth: 0.5 }, // Bronze
  { key: 'carla', guild: 'malolos', target: 3200, lastMonth: 0.55 }, // Legend
  { key: 'jun', guild: 'biak', target: 1100, lastMonth: 0.65 }, // Gold
  { key: 'trisha', guild: 'biak', target: 560, lastMonth: 0.3 }, // Silver II
  { key: 'ramon', guild: 'biak', target: 130, lastMonth: 0.5 }, // Bronze I
  { key: 'enzo', guild: 'hagonoy', target: 450, lastMonth: 0.45 }, // Silver
  { key: 'lia', guild: 'hagonoy', target: 70, lastMonth: 0 }, // Rookie
  { key: 'kim', guild: null, target: 60, lastMonth: 0 }, // Rookie, no guild
  { key: 'marco', guild: null, target: 310, lastMonth: 0.5 }, // Bronze, no guild
];

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
function buildPointEvents(member, userId, guildId) {
  const windows = monthWindows();
  const guildName = GUILDS.find((g) => g.key === member.guild)?.name;
  const events = [];
  let total = 0;
  const add = (reason, amount, when, note = null) => {
    events.push({ user_id: userId, guild_id: guildId, amount, reason, source_key: `seed:${reason}:${events.length}`, note, created_at: when });
    total += amount;
  };

  const early = member.lastMonth > 0 ? windows.last : windows.current;
  if (member.leader) {
    add('guild_founded', 50, randomTimeIn(early), guildName);
  } else {
    add('id_verified', 50, randomTimeIn(early), 'Welcome to PartyUp');
    if (guildId) add('guild_joined', 10, randomTimeIn(early), guildName);
  }

  const repeatable = member.leader
    ? [['id_review', 10], ['vehicle_review', 10], ['guild_trip_bonus', 5]]
    : [['trip_completed', 20], ['trip_completed', 20], ['trip_hosted', 30]];
  const lastMonthGoal = member.target * member.lastMonth;
  while (total < member.target) {
    const [reason, amount] = repeatable[Math.floor(random() * repeatable.length)];
    add(reason, amount, randomTimeIn(total < lastMonthGoal ? windows.last : windows.current));
  }
  return events;
}

const GUILD_CHAT = {
  malolos: [['ana', 'Welcome sa bagong members! Heritage walk this Saturday 🏛'], ['carla', 'Sasama ako! May car ako, 2 seats pa'], ['miggy', 'Pa-reserve po ng isa 🙋'], ['carla', 'Sige Miggy, pasok ka!']],
  biak: [['paolo', 'Trail update: Madlum river is passable again after the rains.'], ['jun', 'Nice! Angat sunrise drive sa Sabado, full na pero may tour pa si Paolo'], ['trisha', 'Ang ganda ng photos last week 📷'], ['ramon', 'Kailan next overnight?']],
  hagonoy: [['bea', 'Thanks sa lahat ng sumama sa river day! 🚤'], ['enzo', 'Sulit! Next time Paombong naman'], ['lia', 'Sali ako ulit 😊']],
};

const PARTYUPS = [
  { guild: 'malolos', by: 'ana', title: 'Barasoain heritage walk', place: 'Barasoain Church, Malolos', municipality: 'Malolos', lat: 14.8459, lng: 120.8125, days: 4, hour: 7, notes: 'Pancit after at Bistro Maloleño. Bring water!', members: ['carla', 'miggy'] },
  { guild: 'biak', by: 'paolo', title: 'Night trek practice', place: 'Norzagaray Town Plaza', municipality: 'Norzagaray', lat: 14.9115, lng: 121.0485, days: 9, hour: 18, notes: 'Headlamps required. Easy 5km loop.', members: ['jun', 'trisha', 'ramon'] },
];

export async function seedGuilds(ids) {
  const guildIds = {};
  for (const g of GUILDS) {
    const row = await run(`guild ${g.name}`, admin.from('guilds').insert({
      name: g.name, tagline: g.tagline, emblem: g.emblem, color: g.color, join_policy: g.joinPolicy, leader_id: ids[g.leader],
      description: g.description, focus: g.focus, areas: g.areas,
    }).select('id').single());
    if (row?.id) guildIds[g.key] = row.id;
  }

  const members = MEMBERS.filter((m) => m.guild && guildIds[m.guild] && ids[m.key]).map((m) => ({ user_id: ids[m.key], guild_id: guildIds[m.guild] }));
  await run('guild members', admin.from('guild_members').insert(members));

  if (guildIds.malolos) {
    await run('malolos announcement', admin.from('guilds').update({
      announcement: 'Heritage walk this Saturday: Barasoain Church at 7AM, then pancit at Bistro Maloleño. Bring water!',
      announcement_at: new Date().toISOString(), announcement_by: ids.ana ?? null,
    }).eq('id', guildIds.malolos));
  }

  if (ids.carla) {
    await run('leader application', admin.from('guild_leader_applications').insert({
      user_id: ids.carla, guild_name: 'Pulilan Pathfinders',
      pitch: 'I have done 130+ trips around Bulacan and want to lead weekend food and heritage runs out of Pulilan, with a buddy system for first-timers.',
    }));
  }
  if (ids.kim && guildIds.malolos) {
    await run('join request', admin.from('guild_join_requests').insert({ guild_id: guildIds.malolos, user_id: ids.kim }));
  }

  let eventCount = 0;
  for (const m of MEMBERS) {
    if (!ids[m.key]) continue;
    const events = buildPointEvents(m, ids[m.key], m.guild ? (guildIds[m.guild] ?? null) : null);
    if (await run(`points ${m.key}`, admin.from('guild_point_events').insert(events))) eventCount += events.length;
  }
  const medals = await run('season medals', admin.rpc('award_season_medals'));

  // Guild chat threads are created by sync_guild_chat_member.
  for (const [key, lines] of Object.entries(GUILD_CHAT)) {
    if (!guildIds[key]) continue;
    const { data: thread } = await admin.from('chat_threads').select('id').eq('guild_id', guildIds[key]).maybeSingle();
    if (!thread) {
      warn(`guild ${key}: no chat thread`);
      continue;
    }
    await run(`guild ${key} chat`, admin.from('chat_messages').insert(
      lines.filter(([who]) => ids[who]).map(([who, body], i) => ({ thread_id: thread.id, sender_id: ids[who], body, message_type: 'text', created_at: hoursAgo(30 - i * 3) })),
    ));
  }

  for (const p of PARTYUPS) {
    if (!guildIds[p.guild] || !ids[p.by]) continue;
    const row = await run(`partyup ${p.title}`, admin.from('guild_partyups').insert({
      guild_id: guildIds[p.guild], created_by: ids[p.by], title: p.title, place_label: p.place, place_municipality: p.municipality,
      place_lat: p.lat, place_lng: p.lng, meet_at: daysFromNow(p.days, p.hour), notes: p.notes,
    }).select('id').single());
    if (row?.id) {
      await run(`partyup ${p.title} members`, admin.from('guild_partyup_members').insert(
        [p.by, ...p.members].filter((key) => ids[key]).map((key) => ({ partyup_id: row.id, user_id: ids[key] })),
      ));
    }
  }

  // Guild reports: one open for Ana to handle, one Paolo already resolved.
  if (guildIds.malolos && ids.miggy && ids.carla) {
    await run('guild report open', admin.from('guild_reports').insert({
      guild_id: guildIds.malolos, reporter_id: ids.miggy, reported_user_id: ids.carla, category: 'spam',
      message_excerpt: 'Join my other group chat for cheap rides!! link sa bio', details: 'Posted the same promo three times today in the guild chat.',
      anonymous: true,
    }));
  }
  if (guildIds.biak && ids.trisha && ids.ramon) {
    await run('guild report resolved', admin.from('guild_reports').insert({
      guild_id: guildIds.biak, reporter_id: ids.trisha, reported_user_id: ids.ramon, category: 'behavior',
      details: 'Left the group behind on the trail without telling anyone.', status: 'resolved',
      handled_by: ids.paolo, handled_at: hoursAgo(48), resolution_note: 'Talked to Ramon; he apologized and will follow the buddy system.',
      created_at: hoursAgo(72),
    }));
  }

  ok(`Guilds: ${Object.keys(guildIds).length}, ${members.length} members, ${eventCount} point events, season medals: ${medals ?? 0}, ${PARTYUPS.length} PartyUps`);
  return guildIds;
}
