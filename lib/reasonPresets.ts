// Quick reasons for staff and Guild Leader decisions: short chip labels,
// full sentences sent. Rendered by components/ReasonChips.tsx.
// idReject and vehicleReject are copied from the website
// (PartyUp-main/client/src/lib/reasonPresets.ts) — keep the wording in sync.

export type ReasonPreset = { label: string; text: string };

export type ReasonValue = { selected: number[]; details: string };

export const EMPTY_REASON: ReasonValue = { selected: [], details: '' };

/** Picked sentences in tap order, then the typed details. */
export function composeReason(presets: ReasonPreset[], value: ReasonValue) {
  const parts = value.selected.map((index) => presets[index]?.text).filter(Boolean) as string[];
  const details = value.details.trim();
  if (details) parts.push(details);
  return parts.join(' ');
}

export const REASON_PRESETS = {
  idReject: [
    { label: 'Blurry photo', text: 'The ID photo is blurry or hard to read.' },
    { label: 'Face mismatch', text: "Your selfie doesn't match the photo on your ID." },
    { label: 'Expired / invalid ID', text: 'The ID is expired or not an accepted government ID.' },
    { label: 'Face or ID covered', text: 'Your face or part of the ID is covered or cut off.' },
    { label: 'Name mismatch', text: "The name on your ID doesn't match your profile name." },
    { label: 'Not from Bulacan', text: "Your ID address isn't in Bulacan. PartyUp is for Bulacan residents only." },
  ],
  vehicleReject: [
    { label: 'Poor image quality', text: 'The vehicle photos are blurry or too dark.' },
    { label: "Photos don't match", text: "The photos don't match the vehicle details you entered." },
    { label: 'Plate / OR-CR unreadable', text: "The plate number or OR/CR can't be read." },
    { label: 'Looks suspicious', text: 'The vehicle or documents look altered or suspicious.' },
    { label: 'Owner authorization', text: "The owner's authorization is missing or invalid." },
    { label: 'Registration date wrong', text: "The registration date you entered doesn't match your OR/CR." },
    { label: 'Registration expired', text: 'The OR/CR registration has expired. Please renew it first.' },
  ],
  guildReportResolve: [
    { label: 'Talked to them', text: 'I talked to the member about it.' },
    { label: 'Warning given', text: 'I gave the member a warning.' },
    { label: 'Removed member', text: 'I removed the member from the guild.' },
    { label: 'Message removed', text: 'I removed the reported message.' },
  ],
  guildReportDismiss: [
    { label: 'No rule broken', text: "This doesn't break our guild rules." },
    { label: 'Not enough info', text: "There isn't enough information to act on this." },
    { label: 'Already handled', text: 'This was already handled.' },
    { label: 'Misunderstanding', text: 'This looks like a misunderstanding that has been cleared up.' },
  ],
  guildReportEscalate: [
    { label: 'Safety concern', text: 'This is a safety concern.' },
    { label: 'Happened on a trip', text: 'This happened during a trip.' },
    { label: 'Repeat offender', text: 'This member has been reported before.' },
    { label: 'Outside my power', text: "This needs action I can't take as Guild Leader." },
  ],
} satisfies Record<string, ReasonPreset[]>;
