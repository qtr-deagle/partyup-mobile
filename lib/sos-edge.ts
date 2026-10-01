import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// Device-local settings for the SOS edge tab: whether it shows, and where the
// user last dragged it (which screen edge, and how far down as a 0-1 fraction
// so it survives rotation and different screen heights).
export type SosEdgeSide = 'left' | 'right';

export type SosEdgeState = {
  enabled: boolean;
  side: SosEdgeSide;
  offset: number;
};

const STORAGE_KEY = 'partyup:sos-edge';
const DEFAULT_STATE: SosEdgeState = { enabled: false, side: 'right', offset: 0.55 };

let state = DEFAULT_STATE;
const listeners = new Set<() => void>();

function update(next: Partial<SosEdgeState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

void AsyncStorage.getItem(STORAGE_KEY)
  .then((value) => {
    if (!value) {
      return;
    }
    const saved = JSON.parse(value) as Partial<SosEdgeState>;
    state = {
      enabled: saved.enabled === true,
      side: saved.side === 'left' ? 'left' : 'right',
      offset: typeof saved.offset === 'number' ? Math.min(1, Math.max(0, saved.offset)) : DEFAULT_STATE.offset,
    };
    listeners.forEach((listener) => listener());
  })
  .catch(() => {});

export function setSosEdgeEnabled(enabled: boolean) {
  update({ enabled });
}

export function setSosEdgePosition(side: SosEdgeSide, offset: number) {
  update({ side, offset: Math.min(1, Math.max(0, offset)) });
}

export function useSosEdge() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
