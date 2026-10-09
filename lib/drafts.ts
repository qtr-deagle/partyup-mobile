import { supabase } from '@/lib/supabase';

// Unsent form drafts, kept on the device so an accidental back or an app
// restart doesn't lose what someone typed. Uses the synchronous localStorage
// that expo-sqlite installs (see lib/supabase.ts). Keys are per user.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredDraft<T> = { value: T; savedAt: string };

let cachedUserId: string | null = null;
void supabase.auth.getSession().then(({ data }) => {
  cachedUserId = data.session?.user.id ?? null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user.id ?? null;
});

function fullKey(key: string) {
  return `draft:${cachedUserId ?? 'anon'}:${key}`;
}

export function loadDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed?.savedAt || Date.now() - new Date(parsed.savedAt).getTime() > MAX_AGE_MS) {
      localStorage.removeItem(fullKey(key));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T) {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify({ value, savedAt: new Date().toISOString() } satisfies StoredDraft<T>));
  } catch {
    // Storage full or unavailable: drafts are best-effort.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    // ignore
  }
}
