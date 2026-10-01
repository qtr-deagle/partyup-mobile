// Supabase Edge Function: send-verification-email
//
// Called by the database via pg_net when a verification changes status:
//   { id }                   -> id_verifications row (enqueue_verification_email)
//   { id, kind: 'vehicle' }  -> vehicles row (enqueue_vehicle_verification_email)
// It re-reads the row with the service role and emails the user an update
// that matches the row's current status: received, approved or rejected.
//
// Sent through Brevo's transactional API (free tier: 300 emails/day), the
// same provider that sends the auth OTP emails. Secrets:
//   supabase secrets set BREVO_API_KEY=xkeysib-...           (Brevo > SMTP & API > API Keys)
//   supabase secrets set EMAIL_SENDER_ADDRESS=you@example.com (a sender verified in Brevo)
//   supabase secrets set EMAIL_SENDER_NAME=PartyUp            (optional)
// PUSH_WEBHOOK_SECRET is shared with dispatch-push.
//
// Auth: the caller must send PUSH_WEBHOOK_SECRET in x-push-secret
// (verify_jwt is off in config.toml since the database has no user JWT).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const DOCUMENT_LABELS: Record<string, string> = {
  passport: 'Passport',
  driver_license: "Driver's License",
  national_id: 'National ID (PhilSys)',
  other: 'Other Government ID',
};

type Status = 'received' | 'approved' | 'rejected';
type Kind = 'id' | 'vehicle';

type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

// Everything that differs between an ID email and a vehicle email.
type EmailCopy = {
  subject: string;
  heading: string;
  intro: string;
  next: string[];
  details: [string, string][];
  footer: string;
};

const STATUS_STYLE: Record<Status, { label: string; color: string; background: string }> = {
  received: { label: 'Pending review', color: '#8A5A00', background: '#FFF4DB' },
  approved: { label: 'Approved', color: '#0F7B4B', background: '#E3F6EC' },
  rejected: { label: 'Not approved', color: '#B3261E', background: '#FDECEC' },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatManilaTime(iso: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function toStatus(rowStatus: string): Status | null {
  if (rowStatus === 'pending' || rowStatus === 'resubmitted') return 'received';
  if (rowStatus === 'approved' || rowStatus === 'rejected') return rowStatus;
  return null;
}

function idCopy(data: {
  status: Status;
  legalName: string | null;
  documentLabel: string;
  submittedAt: string;
  reviewedAt: string | null;
}): EmailCopy {
  const details: [string, string][] = [
    ['Status', STATUS_STYLE[data.status].label],
    ...(data.legalName ? [['Name on file', data.legalName] as [string, string]] : []),
    ['Document', data.documentLabel],
    ['Submitted', data.submittedAt],
    ...(data.reviewedAt && data.status !== 'received' ? [['Reviewed', data.reviewedAt] as [string, string]] : []),
  ];
  const footer =
    "You're receiving this because an ID verification was submitted for your PartyUp account. Your documents are only visible to PartyUp staff. If this wasn't you, reply to this email right away.";

  switch (data.status) {
    case 'received':
      return {
        subject: 'We received your ID. Verification pending',
        heading: 'We received your ID',
        intro: 'Thanks for submitting your ID. Our team is reviewing your documents, which usually takes up to 24 hours.',
        next: [
          "You don't need to do anything right now.",
          "We'll email you again, and notify you in the app, as soon as the review is done.",
          'Some features, such as creating and joining trips, unlock once you are verified.',
        ],
        details,
        footer,
      };
    case 'approved':
      return {
        subject: "You're verified on PartyUp",
        heading: "You're verified!",
        intro: 'Good news: your identity has been verified. Your account now has full access to PartyUp.',
        next: ['Create or join carpools and tours.', 'Add friends and set up your trusted circle.', 'Travel safe, and have fun!'],
        details,
        footer,
      };
    case 'rejected':
      return {
        subject: 'Action needed: your PartyUp ID verification',
        heading: "We couldn't verify your ID",
        intro: "Our team reviewed your documents but couldn't verify your identity this time.",
        next: [
          'Open the PartyUp app and go to Verify Your Identity.',
          'Check that your legal name matches your ID exactly.',
          'Retake the photos in good lighting, with all four corners of the ID visible and no glare.',
          'Use an ID that shows your address in Bulacan (a passport alone cannot confirm residency).',
        ],
        details,
        footer,
      };
  }
}

function vehicleCopy(data: {
  status: Status;
  vehicleName: string;
  plateNumber: string | null;
  borrowed: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
}): EmailCopy {
  const details: [string, string][] = [
    ['Status', STATUS_STYLE[data.status].label],
    ['Vehicle', data.vehicleName],
    ...(data.plateNumber ? [['Plate number', data.plateNumber] as [string, string]] : []),
    ['Ownership', data.borrowed ? 'Borrowed' : 'Owned'],
    ...(data.submittedAt ? [['Submitted', data.submittedAt] as [string, string]] : []),
    ...(data.reviewedAt && data.status !== 'received' ? [['Reviewed', data.reviewedAt] as [string, string]] : []),
  ];
  const footer =
    "You're receiving this because vehicle documents were submitted for your PartyUp account. Your documents are only visible to PartyUp staff. If this wasn't you, reply to this email right away.";

  switch (data.status) {
    case 'received':
      return {
        subject: `We received your vehicle documents: ${data.vehicleName}`,
        heading: 'We received your vehicle documents',
        intro: `Thanks for submitting your ${data.vehicleName} for verification. Our team is reviewing your documents, which usually takes up to 24 hours.`,
        next: [
          "You don't need to do anything right now.",
          "We'll email you again, and notify you in the app, as soon as the review is done.",
          "Your vehicle's details are locked while the review is in progress.",
        ],
        details,
        footer,
      };
    case 'approved':
      return {
        subject: `Your ${data.vehicleName} is verified on PartyUp`,
        heading: 'Your vehicle is verified!',
        intro: `Good news: your ${data.vehicleName} has been verified. You can now use it to host carpool trips.`,
        next: ['Create a carpool trip and pick this vehicle.', 'Keep your OR/CR up to date.', 'Drive safe, and have fun!'],
        details,
        footer,
      };
    case 'rejected':
      return {
        subject: 'Action needed: your PartyUp vehicle verification',
        heading: "We couldn't verify your vehicle",
        intro: `Our team reviewed the documents for your ${data.vehicleName} but couldn't verify it this time.`,
        next: [
          'Open the PartyUp app, go to My Vehicles and tap Resubmit Documents.',
          'Make sure the plate number and vehicle details match your OR/CR.',
          'Retake the photos in good lighting, with the whole document visible and no glare.',
          ...(data.borrowed
            ? ["For a borrowed vehicle, include the signed letter of authorization, both sides of the owner's valid ID, and the owner's 3 signatures."]
            : []),
        ],
        details,
        footer,
      };
  }
}

function buildEmail(status: Status, firstName: string, copy: EmailCopy, reviewerNotes: string | null): EmailContent {
  const style = STATUS_STYLE[status];

  const detailRows = copy.details
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#6B7590;font-size:14px;width:130px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#17233F;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  const notesBlock =
    status === 'rejected' && reviewerNotes
      ? `
        <tr><td style="padding:0 32px 8px;">
          <div style="border-left:4px solid #B3261E;background:#FDECEC;border-radius:8px;padding:12px 16px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:#B3261E;text-transform:uppercase;">Reason from our team</div>
            <div style="margin-top:4px;font-size:14px;line-height:20px;color:#5C1A15;">${escapeHtml(reviewerNotes)}</div>
          </div>
        </td></tr>`
      : '';

  const nextItems = copy.next.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join('');

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#2445B8;padding:20px 32px;">
          <span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:8px;background:#FFFFFF;color:#2445B8;font-weight:900;font-size:18px;vertical-align:middle;">P</span>
          <span style="margin-left:10px;color:#FFFFFF;font-size:20px;font-weight:700;vertical-align:middle;">PartyUp</span>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${style.background};color:${style.color};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${style.label}</span>
          <h1 style="margin:14px 0 8px;font-size:22px;line-height:28px;color:#17233F;">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0;font-size:15px;line-height:22px;color:#3B4660;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:8px 0 0;font-size:15px;line-height:22px;color:#3B4660;">${escapeHtml(copy.intro)}</p>
        </td></tr>
        ${notesBlock}
        <tr><td style="padding:16px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E6EAF2;border-bottom:1px solid #E6EAF2;">
            ${detailRows}
          </table>
        </td></tr>
        <tr><td style="padding:4px 32px 28px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;color:#6B7590;text-transform:uppercase;">What's next</div>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:21px;color:#3B4660;">${nextItems}</ul>
        </td></tr>
        <tr><td style="background:#F7F8FC;padding:16px 32px;font-size:12px;line-height:18px;color:#8A93A8;">
          ${escapeHtml(copy.footer)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    copy.heading,
    '',
    `Hi ${firstName},`,
    copy.intro,
    ...(status === 'rejected' && reviewerNotes ? ['', `Reason from our team: ${reviewerNotes}`] : []),
    '',
    ...copy.details.map(([label, value]) => `${label}: ${value}`),
    '',
    "What's next:",
    ...copy.next.map((item) => `- ${item}`),
    '',
    copy.footer,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

// What the email needs from a verification row, whichever table it came from.
type LoadedVerification = {
  userId: string;
  status: Status;
  reviewerNotes: string | null;
  copyFor: (legalName: string | null) => EmailCopy;
};

async function loadIdVerification(admin: SupabaseClient, id: string): Promise<LoadedVerification | Response> {
  const { data: row, error } = await admin
    .from('id_verifications')
    .select('id, user_id, status, document_type, submitted_at, reviewed_at, reviewer_notes')
    .eq('id', id)
    .maybeSingle();
  if (error || !row) {
    return jsonResponse({ error: 'Verification not found' }, 404);
  }
  const status = toStatus(row.status);
  if (!status) {
    return jsonResponse({ skipped: `No email for status ${row.status}` });
  }
  return {
    userId: row.user_id,
    status,
    reviewerNotes: row.reviewer_notes,
    copyFor: (legalName) =>
      idCopy({
        status,
        legalName,
        documentLabel: DOCUMENT_LABELS[row.document_type] ?? 'Government ID',
        submittedAt: formatManilaTime(row.submitted_at),
        reviewedAt: row.reviewed_at ? formatManilaTime(row.reviewed_at) : null,
      }),
  };
}

async function loadVehicleVerification(admin: SupabaseClient, id: string): Promise<LoadedVerification | Response> {
  const { data: row, error } = await admin
    .from('vehicles')
    .select('id, user_id, verification_status, make, model, year, plate_number, ownership_type, submitted_at, reviewed_at, reviewer_notes')
    .eq('id', id)
    .maybeSingle();
  if (error || !row) {
    return jsonResponse({ error: 'Vehicle not found' }, 404);
  }
  const status = toStatus(row.verification_status);
  if (!status) {
    return jsonResponse({ skipped: `No email for status ${row.verification_status}` });
  }
  const vehicleName = [row.year, row.make, row.model].filter(Boolean).join(' ') || 'vehicle';
  return {
    userId: row.user_id,
    status,
    reviewerNotes: row.reviewer_notes,
    copyFor: () =>
      vehicleCopy({
        status,
        vehicleName,
        plateNumber: row.plate_number,
        borrowed: row.ownership_type === 'borrowed',
        submittedAt: row.submitted_at ? formatManilaTime(row.submitted_at) : null,
        reviewedAt: row.reviewed_at ? formatManilaTime(row.reviewed_at) : null,
      }),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const senderAddress = Deno.env.get('EMAIL_SENDER_ADDRESS');
  if (!brevoKey || !senderAddress) {
    console.error('[send-verification-email] BREVO_API_KEY or EMAIL_SENDER_ADDRESS is not set');
    return jsonResponse({ error: 'Email is not configured' }, 500);
  }

  const { id, kind = 'id' } = (await req.json().catch(() => ({}))) as { id?: string; kind?: Kind };
  if (!id) {
    return jsonResponse({ error: 'Missing id' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const loaded = kind === 'vehicle' ? await loadVehicleVerification(admin, id) : await loadIdVerification(admin, id);
  if (loaded instanceof Response) {
    return loaded;
  }
  const { userId, status, reviewerNotes } = loaded;

  const { data: profile } = await admin
    .from('profiles')
    .select('email, display_name, first_name, middle_name, last_name, name_suffix')
    .eq('id', userId)
    .maybeSingle();

  let email = profile?.email as string | null | undefined;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser.user?.email;
  }
  if (!email) {
    return jsonResponse({ skipped: 'User has no email address' });
  }

  const legalName =
    profile?.first_name && profile?.last_name
      ? `${String(profile.last_name).toUpperCase()}, ${[profile.first_name, profile.middle_name, profile.name_suffix].filter(Boolean).join(' ')}`
      : null;
  const firstName = profile?.first_name || String(profile?.display_name ?? '').split(' ')[0] || 'there';

  const content = buildEmail(status, firstName, loaded.copyFor(legalName), reviewerNotes);

  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderAddress, name: Deno.env.get('EMAIL_SENDER_NAME') ?? 'PartyUp' },
      to: [{ email, name: profile?.display_name ?? undefined }],
      subject: content.subject,
      htmlContent: content.html,
      textContent: content.text,
      tags: [kind === 'vehicle' ? 'vehicle-verification' : 'id-verification', status],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('[send-verification-email] Brevo rejected the email:', response.status, detail);
    return jsonResponse({ error: 'Email provider error', status: response.status }, 502);
  }

  return jsonResponse({ sent: status, kind });
});
