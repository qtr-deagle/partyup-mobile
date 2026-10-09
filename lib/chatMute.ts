import { showAlert } from '@/lib/dialog';

// "Mute for how long?" for any chat, plus the "Muted until …" label.

const HOUR = 60 * 60 * 1000;

const OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'For 1 hour', ms: HOUR },
  { label: 'For 8 hours', ms: 8 * HOUR },
  { label: 'For 1 day', ms: 24 * HOUR },
  { label: 'For 1 week', ms: 7 * 24 * HOUR },
  { label: 'Until I turn it back on', ms: null },
];

/** Asks how long to mute, then calls `onPick` with the end time (null = indefinite). */
export function askMuteDuration(chatName: string, onPick: (until: Date | null) => void) {
  showAlert(
    `Mute ${chatName}?`,
    "You won't get notifications for new messages. You'll still see them when you open the chat.",
    [
      ...OPTIONS.map((option) => ({
        text: option.label,
        onPress: () => onPick(option.ms === null ? null : new Date(Date.now() + option.ms)),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
    { tone: 'info' }
  );
}

/** "Muted until 3:00 PM", "… tomorrow, 9:00 AM", "… Fri, Oct 10" or "Muted" (indefinite). */
export function mutedUntilLabel(mutedUntil: string | null | undefined) {
  if (!mutedUntil) return 'Muted';
  const until = new Date(mutedUntil);
  const now = new Date();
  const time = until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = until.toDateString() === now.toDateString();
  const tomorrow = until.toDateString() === new Date(now.getTime() + 24 * HOUR).toDateString();
  if (sameDay) return `Muted until ${time}`;
  if (tomorrow) return `Muted until tomorrow, ${time}`;
  return `Muted until ${until.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}
