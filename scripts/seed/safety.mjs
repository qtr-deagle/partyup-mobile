// Safety + moderation: warning-mode history, resolved SOS alerts (plus an
// optional live one), user reports with evidence (each auto-creates its
// support ticket via report_to_ticket), and standalone support tickets.
//
// Never seed a 'monitoring' safety session: the escalation cron turns it
// into a real SOS within a minute.

import { admin, hoursAgo, minutesAgo, ok, run } from './lib.mjs';
import { chatScreenshot, upload } from './images.mjs';

const REPORTS = [
  {
    reporter: 'enzo', reported: 'marco', type: 'payment', trip: 'marco-marilao', status: 'open', hours: 26,
    details: 'I paid ₱89.60 with GCash in the app for the Meycauayan to SM Marilao ride, but it still says Processing after 4 days. GCash shows the money left my account.',
    evidence: { title: 'GCASH RECEIPT', lines: [[true, 'SENT P88.00 TO MARCO R.'], [true, 'REF 4471029381'], [false, 'CHECK KO MAMAYA'], [true, 'SIR PAKI-CONFIRM PO']] },
  },
  {
    reporter: 'lia', reported: 'vince', type: 'safety', status: 'reviewing', hours: 50, reviewer: 'admin',
    details: 'He kept messaging me late at night asking where I live after I declined his ride. I have blocked him.',
    evidence: { title: 'VINCE TAN', lines: [[false, 'SAAN KA NAKATIRA?'], [false, 'HATID NA KITA'], [true, 'NO THANKS PO'], [false, 'BAKIT AYAW MO?']] },
  },
  {
    reporter: 'kim', reported: 'marco', type: 'behavior', trip: 'marco-obando', status: 'resolved', hours: 40, reviewer: 'admin',
    details: 'Driver cancelled the Obando trip the night before, after I had already paid for a non-refundable festival slot.',
    resolution: 'Driver had a documented breakdown. Reminded him to cancel earlier; no penalty this time.',
  },
  {
    reporter: 'miggy', type: 'feedback', status: 'dismissed', hours: 120, reviewer: 'admin',
    details: 'Sana may dark mode yung map tab, ang liwanag pag gabi.',
    resolution: 'Thanks! Logged as a feature request; this is not a safety issue.',
  },
];

const TICKETS = [
  {
    user: 'lia', category: 'account', subject: 'Can I change my municipality?', status: 'open', hours: 3,
    messages: [[false, 'I moved from Calumpit to Malolos last month. How do I update my municipality? The field is greyed out.', 3]],
  },
  {
    user: 'dante', category: 'bug', subject: 'Plate photo upload keeps failing', status: 'answered', hours: 30, unread: true,
    messages: [
      [false, 'Every time I upload the plate photo the app says "upload failed". I tried 3 times on mobile data.', 30],
      [true, 'Hi Dante! Your photos came through on the latest try, and your vehicle is now in the review queue. If it fails again, try on Wi-Fi.', 4],
    ],
  },
  {
    user: 'pia', category: 'account', subject: 'Why was my ID rejected?', status: 'closed', hours: 70,
    messages: [
      [false, 'My ID got rejected, what did I do wrong?', 70],
      [true, 'The photo was too blurry to read. Please retake it flat on a table in good light and resubmit from Profile > Verify ID.', 66],
      [false, 'Okay, thank you!', 65],
    ],
  },
];

export async function seedSafety(ids, trips = {}, { liveSos = false } = {}) {
  // Warning mode history: one cancelled check-in, one that escalated.
  let escalatedSession = null;
  if (ids.trisha) {
    await run('safety session cancelled', admin.from('safety_sessions').insert({
      user_id: ids.trisha, status: 'cancelled', started_at: hoursAgo(80), expires_at: hoursAgo(79.5), resolved_at: hoursAgo(79.7),
    }));
  }
  if (ids.miggy) {
    escalatedSession = await run('safety session escalated', admin.from('safety_sessions').insert({
      user_id: ids.miggy, status: 'escalated', started_at: hoursAgo(200), expires_at: hoursAgo(199.75), resolved_at: hoursAgo(199.74),
    }).select('id').single());
  }

  const sos = [];
  if (ids.trisha) {
    sos.push({
      user_id: ids.trisha, trigger_reason: 'manual', status: 'resolved', latitude: 15.1069, longitude: 121.0781, accuracy_m: 18, recipient_count: 3,
      resolved_by: ids.bea ?? null, resolved_at: hoursAgo(95), resolution_notes: 'Twisted ankle on the Biak trail. Guide reached her in 20 minutes; she was driven home safely.',
      created_at: hoursAgo(96),
    });
  }
  if (ids.miggy) {
    sos.push({
      user_id: ids.miggy, trigger_reason: 'auto_escalation', status: 'resolved', latitude: 14.8437, longitude: 120.8121, accuracy_m: 25, recipient_count: 2,
      safety_session_id: escalatedSession?.id ?? null, resolved_by: ids.miggy, resolved_at: hoursAgo(199.5),
      resolution_notes: 'False alarm: phone died during the check-in timer. Called his trusted contacts right after.', created_at: hoursAgo(199.74),
    });
  }
  if (liveSos && ids.kim) {
    // Shows on the website SOS panel and pops the overlay for any trusted contacts.
    sos.push({ user_id: ids.kim, trigger_reason: 'manual', status: 'active', latitude: 14.7392, longitude: 120.9588, accuracy_m: 12, recipient_count: 0, created_at: minutesAgo(3) });
  }
  if (sos.length) await run('sos alerts', admin.from('sos_alerts').insert(sos));

  let reportCount = 0;
  for (const r of REPORTS) {
    if (!ids[r.reporter]) continue;
    const evidence = r.evidence ? await upload('report-evidence', ids[r.reporter], `report-${r.type}`, chatScreenshot(r.evidence)) : null;
    const reviewed = r.status !== 'open';
    const row = await run(`report ${r.type}`, admin.from('reports').insert({
      reporter_id: ids[r.reporter], reported_user_id: r.reported ? ids[r.reported] : null, trip_id: r.trip ? (trips[r.trip]?.id ?? null) : null,
      report_type: r.type, details: r.details, status: r.status, evidence_paths: evidence ? [evidence] : [],
      reviewed_by: reviewed && r.reviewer ? ids[r.reviewer] : null, reviewed_at: reviewed ? hoursAgo(r.hours - 4) : null,
      resolution_notes: r.resolution ?? null, created_at: hoursAgo(r.hours),
    }));
    if (row) reportCount += 1;
  }

  let ticketCount = 0;
  for (const t of TICKETS) {
    if (!ids[t.user]) continue;
    const last = t.messages[t.messages.length - 1][2];
    const ticket = await run(`ticket ${t.subject}`, admin.from('support_tickets').insert({
      user_id: ids[t.user], category: t.category, subject: t.subject, status: t.status, user_unread: Boolean(t.unread),
      created_at: hoursAgo(t.hours), last_message_at: hoursAgo(last),
    }).select('id').single());
    if (!ticket?.id) continue;
    ticketCount += 1;
    await run(`ticket ${t.subject} messages`, admin.from('support_ticket_messages').insert(
      t.messages.map(([fromStaff, body, hours]) => ({
        ticket_id: ticket.id, sender_id: fromStaff ? (ids.admin ?? null) : ids[t.user], from_staff: fromStaff, body, created_at: hoursAgo(hours),
      })),
    ));
  }

  ok(`Safety: ${sos.length} SOS alerts${liveSos ? ' (1 LIVE)' : ''}, ${reportCount} reports (+ auto tickets), ${ticketCount} support tickets`);
}
