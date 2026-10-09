import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showAlert } from '@/lib/dialog';
import { clearDraft, loadDraft, saveDraft, type StoredDraft } from '@/lib/drafts';

type GuardCopy = { title?: string; message?: string };

const DEFAULT_TITLE = 'Discard changes?';
const DEFAULT_MESSAGE = "You have unsaved changes. If you leave now, what you typed won't be saved.";

/**
 * For RN <Modal> sheets: closes right away when nothing changed, otherwise
 * asks first. Route every dismiss path (×, Cancel, backdrop, Android back)
 * through it.
 */
export function confirmDiscard(dirty: boolean, onDiscard: () => void, copy: GuardCopy = {}) {
  if (!dirty) {
    onDiscard();
    return;
  }
  showAlert(copy.title ?? DEFAULT_TITLE, copy.message ?? DEFAULT_MESSAGE, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}

/**
 * For full screens: catches the header back, Android back, swipe-back and any
 * router.back() while `dirty`. Call allowLeave() right before navigating away
 * after a successful submit so a finished form never prompts.
 */
export function useUnsavedChangesGuard(dirty: boolean, copy: GuardCopy & { onDiscard?: () => void } = {}) {
  const navigation = useNavigation();
  const [allowed, setAllowed] = useState(false);
  // A ref too, so a navigation fired in the same tick as allowLeave() passes.
  const allowedRef = useRef(false);
  const onDiscardRef = useRef(copy.onDiscard);
  onDiscardRef.current = copy.onDiscard;

  usePreventRemove(dirty && !allowed, ({ data }) => {
    if (allowedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    showAlert(copy.title ?? DEFAULT_TITLE, copy.message ?? DEFAULT_MESSAGE, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          onDiscardRef.current?.();
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  /** Call before router.back()/replace() after a successful submit. */
  const allowLeave = useCallback(() => {
    allowedRef.current = true;
    setAllowed(true);
  }, []);

  return { allowLeave };
}

/**
 * A text box whose unsent text is kept per `key` (e.g. per chat thread), so
 * leaving a chat and coming back keeps the half-typed message. Drop-in for
 * useState(''); setting '' clears the saved draft.
 */
export function usePersistentText(key: string | null): [string, (next: string) => void] {
  const [text, setText] = useState(() => (key ? (loadDraft<string>(key)?.value ?? '') : ''));
  const keyRef = useRef(key);

  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setText(key ? (loadDraft<string>(key)?.value ?? '') : '');
  }, [key]);

  const update = useCallback(
    (next: string) => {
      setText(next);
      if (!key) return;
      if (next.trim()) saveDraft(key, next);
      else clearDraft(key);
    },
    [key]
  );

  return [text, update];
}

/**
 * Autosaves `value` as a draft while `enabled`, and offers the saved one back
 * once on open. `isEmpty` decides when there's nothing worth saving.
 */
export function useDraft<T>(key: string | null, value: T, { enabled = true, isEmpty }: { enabled?: boolean; isEmpty: (value: T) => boolean }) {
  const [offer, setOffer] = useState<StoredDraft<T> | null>(() => (key ? loadDraft<T>(key) : null));
  // Don't overwrite the stored draft with the empty form before the user has
  // answered the "Continue your draft?" banner.
  const decided = useRef(offer === null);

  useEffect(() => {
    if (!key) return;
    const stored = loadDraft<T>(key);
    setOffer(stored);
    decided.current = stored === null;
  }, [key]);

  useEffect(() => {
    if (!key || !enabled || !decided.current) return;
    const timer = setTimeout(() => {
      if (isEmpty(value)) clearDraft(key);
      else saveDraft(key, value);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, value]);

  const restore = useCallback(() => {
    decided.current = true;
    const value = offer?.value ?? null;
    setOffer(null);
    return value;
  }, [offer]);

  const dismiss = useCallback(() => {
    decided.current = true;
    if (key) clearDraft(key);
    setOffer(null);
  }, [key]);

  const clear = useCallback(() => {
    decided.current = true;
    if (key) clearDraft(key);
    setOffer(null);
  }, [key]);

  return { offer, restore, dismiss, clear };
}
