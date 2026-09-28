// Generates the app's UI sounds as small WAV files in assets/sounds/.
//
// The tones are synthesized here rather than downloaded, so they carry no
// licensing terms and cost nothing. Re-run after tweaking a sound:
//   node ./scripts/generate-sounds.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

// A soft bell: a sine plus a quiet octave partial, a 5 ms attack and an
// exponential decay. `glideTo` bends the pitch over the note's length.
function note({ freq, start, duration, gain = 0.5, decay = 6, glideTo, bright = 0.18 }) {
  return { freq, start, duration, gain, decay, glideTo: glideTo ?? freq, bright };
}

function render(notes, totalSeconds) {
  const length = Math.ceil(totalSeconds * SAMPLE_RATE);
  const samples = new Float32Array(length);
  for (const n of notes) {
    const startIndex = Math.floor(n.start * SAMPLE_RATE);
    const count = Math.floor(n.duration * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < count && startIndex + i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const progress = i / count;
      const freq = n.freq + (n.glideTo - n.freq) * progress;
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      const attack = Math.min(1, t / 0.005);
      // Fade the last 10 ms so notes never end on a click.
      const release = Math.min(1, (count - i) / (0.01 * SAMPLE_RATE));
      const envelope = attack * release * Math.exp(-n.decay * t);
      const wave = Math.sin(phase) + n.bright * Math.sin(2 * phase);
      samples[startIndex + i] += wave * envelope * n.gain;
    }
  }
  return samples;
}

function toWav(samples) {
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const scale = Math.min(1, 0.8 / peak);
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((value, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * scale)) * 32767), 44 + index * 2);
  });
  return buffer;
}

const sounds = {
  // Quick upward flick when you send a message.
  send: render([note({ freq: 620, glideTo: 1040, start: 0, duration: 0.12, decay: 18, gain: 0.45, bright: 0.1 })], 0.14),
  // Two-note chime for an incoming message.
  receive: render(
    [
      note({ freq: 880, start: 0, duration: 0.25, decay: 12 }),
      note({ freq: 1318.5, start: 0.09, duration: 0.35, decay: 9 }),
    ],
    0.46,
  ),
  // Gentle bell for general notifications.
  notify: render(
    [
      note({ freq: 1046.5, start: 0, duration: 0.6, decay: 6, gain: 0.5 }),
      note({ freq: 1568, start: 0, duration: 0.5, decay: 8, gain: 0.22 }),
    ],
    0.62,
  ),
  // Rising major arpeggio for joins, bookings and approvals.
  success: render(
    [
      note({ freq: 523.25, start: 0, duration: 0.3, decay: 10 }),
      note({ freq: 659.25, start: 0.07, duration: 0.3, decay: 10 }),
      note({ freq: 783.99, start: 0.14, duration: 0.3, decay: 10 }),
      note({ freq: 1046.5, start: 0.21, duration: 0.5, decay: 6, gain: 0.55 }),
    ],
    0.72,
  ),
  // Soft falling pair for failures; kept dull so it never sounds alarming.
  error: render(
    [
      note({ freq: 392, start: 0, duration: 0.18, decay: 14, bright: 0.05 }),
      note({ freq: 311.13, start: 0.12, duration: 0.3, decay: 10, bright: 0.05 }),
    ],
    0.44,
  ),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const file = join(OUT_DIR, `${name}.wav`);
  writeFileSync(file, toWav(samples));
  console.log(`wrote ${file}`);
}
