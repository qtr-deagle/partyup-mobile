import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as AudioModule from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type SoundName = 'send' | 'receive' | 'notify' | 'success' | 'error';

const SOURCES: Record<SoundName, number> = {
  send: require('@/assets/sounds/send.wav'),
  receive: require('@/assets/sounds/receive.wav'),
  notify: require('@/assets/sounds/notify.wav'),
  success: require('@/assets/sounds/success.wav'),
  error: require('@/assets/sounds/error.wav'),
};

const SOUND_ENABLED_KEY = 'partyup:sound-enabled';

// expo-audio is a native module: a dev client built before it was added
// throws on import, so it is loaded lazily and sounds just stay silent there
// (haptics still fire) instead of crashing the app.
let audio: typeof AudioModule | null | undefined;
const players = new Map<SoundName, AudioModule.AudioPlayer>();

function getAudio() {
  if (audio === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, see above
      audio = Platform.OS === 'web' ? null : (require('expo-audio') as typeof AudioModule);
      // Mix with the user's music and respect the iOS silent switch -- these are
      // UI sounds, not media.
      void audio?.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    } catch {
      audio = null;
    }
  }
  return audio;
}

function getPlayer(name: SoundName) {
  const existing = players.get(name);
  if (existing) {
    return existing;
  }
  const module = getAudio();
  if (!module) {
    return null;
  }
  try {
    const player = module.createAudioPlayer(SOURCES[name]);
    player.volume = 0.6;
    players.set(name, player);
    return player;
  } catch {
    return null;
  }
}

// ---- sound on/off preference ----

let soundEnabled = true;
const listeners = new Set<() => void>();

void AsyncStorage.getItem(SOUND_ENABLED_KEY)
  .then((value) => {
    if (value === 'false') {
      soundEnabled = false;
      listeners.forEach((listener) => listener());
    }
  })
  .catch(() => {});

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(SOUND_ENABLED_KEY, String(enabled)).catch(() => {});
  if (enabled) {
    playSound('notify');
  }
}

export function useSoundEnabled() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => soundEnabled,
  );
}

// Loads every sound up front so the first play has no decode delay.
export function preloadSounds() {
  (Object.keys(SOURCES) as SoundName[]).forEach(getPlayer);
}

export function playSound(name: SoundName) {
  if (!soundEnabled) {
    return;
  }
  const player = getPlayer(name);
  if (!player) {
    return;
  }
  try {
    void player.seekTo(0);
    player.play();
  } catch {
    // A failed UI sound is never worth surfacing.
  }
}

// Sound + matching haptic for the app's key moments, so call sites stay one line.
export const feedback = {
  sent() {
    playSound('send');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  received() {
    playSound('receive');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  notify() {
    playSound('notify');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  success() {
    playSound('success');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  error() {
    playSound('error');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  select() {
    void Haptics.selectionAsync();
  },
};
