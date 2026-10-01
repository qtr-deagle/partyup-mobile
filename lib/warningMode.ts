import { cancelSafetySession, escalateSafetySession, type SafetySession, type SosAlert } from '@/lib/safety';

// App-wide state of the running Warning Mode timer, shared by
// WarningModeModal (full screen) and WarningModeBanner (the bar that stays up
// while the user keeps using the app).

export type WarningModeState = {
  session: SafetySession | null;
  // Local clock deadline; the countdown is computed from this.
  deadlineMs: number;
  modalOpen: boolean;
};

let state: WarningModeState = { session: null, deadlineMs: 0, modalOpen: false };
const listeners = new Set<(next: WarningModeState) => void>();

function setState(patch: Partial<WarningModeState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

export function getWarningModeState() {
  return state;
}

export function onWarningModeChange(listener: (next: WarningModeState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setWarningSession(session: SafetySession | null, deadlineMs = 0) {
  setState({ session, deadlineMs });
}

export function setWarningModalOpen(modalOpen: boolean) {
  setState({ modalOpen });
}

// The modal and the banner can both hit zero at the same moment; sharing one
// request per session keeps the trusted circle from being pushed twice.
const escalations = new Map<string, Promise<{ data: SosAlert | null; error: Error | null }>>();

export function escalateWarningSession(sessionId: string) {
  let pending = escalations.get(sessionId);
  if (!pending) {
    pending = escalateSafetySession(sessionId)
      .catch((caught: Error) => ({ data: null, error: caught }))
      .then((result) => {
        if (result.error) {
          escalations.delete(sessionId);
        } else if (state.session?.id === sessionId) {
          setWarningSession(null);
        }
        return result;
      });
    escalations.set(sessionId, pending);
  }
  return pending;
}

export async function cancelWarningSession(sessionId: string) {
  const { error } = await cancelSafetySession(sessionId).catch((caught: Error) => ({ error: caught }));
  if (!error && state.session?.id === sessionId) {
    setWarningSession(null);
  }
  return { error: error as Error | null };
}
