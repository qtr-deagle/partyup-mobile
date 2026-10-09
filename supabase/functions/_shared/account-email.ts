// Account lifecycle emails (deletion scheduled / restored / reminder / deleted),
// shared by send-account-email and purge-deleted-accounts.
//
// Sent through Brevo like send-verification-email, with the same secrets:
// BREVO_API_KEY, EMAIL_SENDER_ADDRESS and optional EMAIL_SENDER_NAME.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
// PartyUp support inbox: named in every email and used as Reply-To, so replies
// reach support even if EMAIL_SENDER_ADDRESS is a different (no-reply) address.
const SUPPORT_EMAIL = 'partyup.demo.bulacan@gmail.com';

export type AccountEmailKind = 'deletion_scheduled' | 'deletion_cancelled' | 'deletion_reminder' | 'account_deleted';

export type AccountEmailData = {
  firstName: string;
  scheduledFor?: string | null;
  /** True when a PartyUp admin, not the user, scheduled the deletion. */
  byAdmin?: boolean;
};

type Copy = {
  subject: string;
  badge: { label: string; color: string; background: string };
  heading: string;
  intro: string;
  details: [string, string][];
  nextTitle: string;
  next: string[];
};

const RED = { color: '#B3261E', background: '#FDECEC' };
const AMBER = { color: '#8A5A00', background: '#FFF4DB' };
const GREEN = { color: '#0F7B4B', background: '#E3F6EC' };

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatManilaDate(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' }).format(new Date(iso));
}

function formatManilaTime(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(
    new Date(iso)
  );
}

function copyFor(kind: AccountEmailKind, data: AccountEmailData): Copy {
  const deleteOn = data.scheduledFor ? formatManilaDate(data.scheduledFor) : 'the scheduled date';
  const now = formatManilaTime(new Date().toISOString());

  switch (kind) {
    case 'deletion_scheduled':
      return {
        subject: `Your PartyUp account will be deleted on ${deleteOn}`,
        badge: { label: 'Deletion scheduled', ...RED },
        heading: 'Your account is scheduled for deletion',
        intro: data.byAdmin
          ? `A PartyUp admin has scheduled your account for deletion. It has been deactivated and will be permanently deleted on ${deleteOn}.`
          : `We received your request to delete your PartyUp account. It has been deactivated and will be permanently deleted on ${deleteOn}.`,
        details: [
          ['Requested', now],
          ['Deletion date', deleteOn],
        ],
        nextTitle: 'Changed your mind?',
        next: [
          `Sign in to the PartyUp app before ${deleteOn} and tap "Restore My Account". Everything will be just as you left it.`,
          "Until then, you're hidden from other travelers and can't join trips or chat.",
          "If you didn't ask for this, sign in now, restore your account, and change your password.",
        ],
      };
    case 'deletion_reminder':
      return {
        subject: 'Your PartyUp account will be deleted in 3 days',
        badge: { label: 'Final reminder', ...AMBER },
        heading: 'Your account will be deleted soon',
        intro: `This is a reminder that your PartyUp account will be permanently deleted on ${deleteOn}. After that, it can't be recovered.`,
        details: [['Deletion date', deleteOn]],
        nextTitle: 'What you can do',
        next: [
          `To keep your account, sign in to the PartyUp app before ${deleteOn} and tap "Restore My Account".`,
          "To let it go, you don't need to do anything.",
        ],
      };
    case 'deletion_cancelled':
      return {
        subject: 'Your PartyUp account has been restored',
        badge: { label: 'Restored', ...GREEN },
        heading: 'Welcome back!',
        intro: 'The deletion of your PartyUp account was cancelled, and your account is active again.',
        details: [['Restored', now]],
        nextTitle: "What's next",
        next: [
          'Your profile, trips, chats and guild progress are just as you left them.',
          "If you didn't restore your account yourself, change your password right away.",
        ],
      };
    case 'account_deleted':
      return {
        subject: 'Your PartyUp account has been deleted',
        badge: { label: 'Deleted', ...RED },
        heading: 'Your account has been deleted',
        intro:
          'Your PartyUp account and its personal data have now been permanently deleted. Thank you for traveling with us.',
        details: [['Deleted', now]],
        nextTitle: 'What this means',
        next: [
          'Your profile, verification documents, location data, trips, chats, ratings and guild progress have been removed.',
          'Admin audit records are kept with your identity removed, as described in our Privacy Policy.',
          'You can sign up again with this email at any time, but you will start over and need to verify again.',
        ],
      };
  }
}

export function buildAccountEmail(kind: AccountEmailKind, data: AccountEmailData) {
  const copy = copyFor(kind, data);
  const footer = `You're receiving this because of a change to your PartyUp account. Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`;

  const detailRows = copy.details
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#6B7590;font-size:14px;width:130px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#17233F;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');
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
          <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${copy.badge.background};color:${copy.badge.color};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(copy.badge.label)}</span>
          <h1 style="margin:14px 0 8px;font-size:22px;line-height:28px;color:#17233F;">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0;font-size:15px;line-height:22px;color:#3B4660;">Hi ${escapeHtml(data.firstName)},</p>
          <p style="margin:8px 0 0;font-size:15px;line-height:22px;color:#3B4660;">${escapeHtml(copy.intro)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E6EAF2;border-bottom:1px solid #E6EAF2;">
            ${detailRows}
          </table>
        </td></tr>
        <tr><td style="padding:4px 32px 28px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;color:#6B7590;text-transform:uppercase;">${escapeHtml(copy.nextTitle)}</div>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:21px;color:#3B4660;">${nextItems}</ul>
        </td></tr>
        <tr><td style="background:#F7F8FC;padding:16px 32px;font-size:12px;line-height:18px;color:#8A93A8;">
          ${escapeHtml(footer)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    copy.heading,
    '',
    `Hi ${data.firstName},`,
    copy.intro,
    '',
    ...copy.details.map(([label, value]) => `${label}: ${value}`),
    '',
    `${copy.nextTitle}:`,
    ...copy.next.map((item) => `- ${item}`),
    '',
    footer,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

export function firstNameOf(profile: { first_name?: string | null; display_name?: string | null } | null | undefined) {
  return profile?.first_name || String(profile?.display_name ?? '').split(' ')[0] || 'there';
}

/** Sends one account email. Returns an error message instead of throwing. */
export async function sendAccountEmail(
  kind: AccountEmailKind,
  to: { email: string; name?: string | null },
  data: AccountEmailData
): Promise<string | null> {
  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const senderAddress = Deno.env.get('EMAIL_SENDER_ADDRESS');
  if (!brevoKey || !senderAddress) {
    return 'BREVO_API_KEY or EMAIL_SENDER_ADDRESS is not set';
  }

  const content = buildAccountEmail(kind, data);
  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderAddress, name: Deno.env.get('EMAIL_SENDER_NAME') ?? 'PartyUp' },
      to: [{ email: to.email, name: to.name ?? undefined }],
      replyTo: { email: SUPPORT_EMAIL, name: 'PartyUp Support' },
      subject: content.subject,
      htmlContent: content.html,
      textContent: content.text,
      tags: ['account', kind],
    }),
  });
  if (!response.ok) {
    return `Brevo ${response.status}: ${await response.text()}`;
  }
  return null;
}
