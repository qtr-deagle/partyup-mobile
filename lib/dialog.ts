import { useSyncExternalStore, type ReactNode } from 'react';

// Drop-in replacement for Alert.alert that renders the app's styled dialog
// (components/ui/DialogHost.tsx, mounted once in app/_layout.tsx). Same
// arguments, so `Alert.alert(title, message, buttons)` becomes
// `showAlert(title, message, buttons)`. Works outside components too.

export type DialogButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: (value?: string) => unknown;
};

export type DialogTone = 'danger' | 'error' | 'success' | 'info';

export type DialogOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
  /** Overrides the tone guessed from the title and buttons. */
  tone?: DialogTone;
  /** Replaces the tone's icon circle, e.g. with an avatar. */
  hero?: ReactNode;
};

export type DialogEntry = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options: DialogOptions;
  tone: DialogTone;
};

const ERROR_TITLE = /\b(unable|could ?n[o']t|can[' ]?no?t|failed|error|not allowed|invalid|problem|denied|too many|expired|missing|required|needed|unavailable|not found|offline|wrong|disabled)\b/i;
const SUCCESS_TITLE = /\b(sent|success|saved|done|submitted|friends|complete|completed|approved|thanks|thank you|welcome|joined|added|redeemed|claimed|unlocked|updated|created|restored|copied)\b|🎉/i;

function guessTone(title: string, buttons: DialogButton[]): DialogTone {
  if (buttons.some((button) => button.style === 'destructive')) return 'danger';
  if (ERROR_TITLE.test(title)) return 'error';
  if (SUCCESS_TITLE.test(title)) return 'success';
  return 'info';
}

let queue: DialogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function showAlert(title: string, message?: string, buttons?: DialogButton[], options: DialogOptions = {}) {
  const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  queue = [...queue, { id: nextId++, title, message, buttons: list, options, tone: options.tone ?? guessTone(title, list) }];
  emit();
}

/** Closes the current dialog, then runs the pressed button's handler (which may open the next one). */
export function pressDialogButton(entry: DialogEntry, button: DialogButton | null) {
  queue = queue.filter((item) => item.id !== entry.id);
  emit();
  if (button) {
    void button.onPress?.();
  } else {
    entry.options.onDismiss?.();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The dialog on screen now (first in line), or null. */
export function useCurrentDialog() {
  return useSyncExternalStore(subscribe, () => queue[0] ?? null, () => null);
}
