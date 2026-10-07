// Obviously-fake placeholder documents (IDs, selfies, OR/CR, plates...) drawn
// with pngjs and a 5x7 pixel font, so the review queues have real images to
// open without shipping anyone's actual documents.

import { PNG } from 'pngjs';
import { admin, warn } from './lib.mjs';

// prettier-ignore
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], ':': [0, 12, 12, 0, 12, 12, 0],
  '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '#': [10, 10, 31, 10, 31, 10, 10],
  "'": [4, 4, 8, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], ' ': [0, 0, 0, 0, 0, 0, 0],
};

const WHITE = [255, 255, 255];
const INK = [30, 41, 59];
const MUTED = [100, 116, 139];
const RED = [220, 38, 38];

class Canvas {
  constructor(width, height, background = WHITE) {
    this.png = new PNG({ width, height });
    this.width = width;
    this.height = height;
    this.rect(0, 0, width, height, background);
  }

  pixel(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (this.width * y + x) << 2;
    this.png.data[i] = r;
    this.png.data[i + 1] = g;
    this.png.data[i + 2] = b;
    this.png.data[i + 3] = 255;
  }

  rect(x, y, w, h, color) {
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) this.pixel(xx, yy, color);
    }
  }

  outline(x, y, w, h, color, t = 2) {
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }

  circle(cx, cy, r, color) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.pixel(cx + x, cy + y, color);
    }
  }

  text(x, y, value, scale = 2, color = INK) {
    const chars = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    let cx = x;
    for (const ch of chars) {
      const glyph = FONT[ch] ?? FONT['?'];
      glyph.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) {
          if (row & (1 << (4 - rx))) this.rect(cx + rx * scale, y + ry * scale, scale, scale, color);
        }
      });
      cx += 6 * scale;
    }
  }

  // Diagonal "SAMPLE" stripes so nobody mistakes these for real documents.
  watermark(label = 'SAMPLE') {
    for (let y = 30; y < this.height; y += 120) this.text(10 + (y % 60), y, `${label}  ${label}  ${label}  ${label}`, 3, [254, 202, 202]);
  }

  toBuffer() {
    return PNG.sync.write(this.png);
  }
}

function personSilhouette(c, cx, top, size, color) {
  c.circle(cx, Math.round(top + size * 0.35), Math.round(size * 0.3), color);
  c.circle(cx, Math.round(top + size * 1.25), Math.round(size * 0.6), color);
}

export function idFront({ name, dob, idNumber, city, accent = [37, 99, 235], docLabel = 'NATIONAL ID' }) {
  const c = new Canvas(640, 400, [241, 245, 249]);
  c.watermark();
  c.rect(0, 0, 640, 64, accent);
  c.text(20, 24, `REPUBLIKA NG PILIPINAS - ${docLabel}`, 2, WHITE);
  c.rect(24, 92, 160, 200, [203, 213, 225]);
  personSilhouette(c, 104, 115, 90, MUTED);
  c.text(210, 96, 'APELYIDO, PANGALAN / NAME', 2, MUTED);
  c.text(210, 120, name, 3, INK);
  c.text(210, 166, 'PETSA NG KAPANGANAKAN / DOB', 2, MUTED);
  c.text(210, 190, dob, 3, INK);
  c.text(210, 236, 'TIRAHAN / ADDRESS', 2, MUTED);
  c.text(210, 260, `${city}, BULACAN`, 3, INK);
  c.text(24, 330, `ID NO. ${idNumber}`, 3, INK);
  c.text(24, 368, 'SAMPLE ONLY - NOT A REAL DOCUMENT', 2, RED);
  return c.toBuffer();
}

export function idBack({ idNumber }) {
  const c = new Canvas(640, 400, [241, 245, 249]);
  c.watermark();
  c.rect(40, 60, 560, 70, INK);
  for (let x = 60; x < 580; x += 9) c.rect(x, 170, (x * 7) % 5 + 2, 80, INK);
  c.text(40, 280, idNumber, 4, INK);
  c.text(40, 340, 'SAMPLE ONLY - NOT A REAL DOCUMENT', 2, RED);
  return c.toBuffer();
}

// Face-only selfie, like the app's selfie step (no ID in frame).
export function selfie({ name, tone = [233, 185, 140], shirt = [37, 99, 235], hair = [41, 37, 36] }) {
  const c = new Canvas(480, 600, [226, 232, 240]);
  c.watermark('SELFIE');
  c.circle(240, 640, 220, shirt); // shoulders
  c.rect(205, 330, 70, 110, tone); // neck
  c.circle(240, 225, 125, hair); // hair, peeking out above the face
  c.circle(240, 255, 115, tone); // face
  c.rect(130, 140, 220, 60, hair); // fringe
  c.circle(240, 172, 110, hair);
  c.circle(240, 262, 108, tone);
  c.circle(200, 250, 11, INK); // eyes
  c.circle(280, 250, 11, INK);
  c.rect(232, 268, 16, 30, [214, 160, 118]); // nose
  c.rect(210, 318, 60, 8, [190, 90, 90]); // smile
  c.rect(0, 525, 480, 75, [226, 232, 240]);
  c.text(20, 540, name, 3, INK);
  c.text(20, 570, 'SAMPLE SELFIE', 2, RED);
  return c.toBuffer();
}

export function carExterior({ label, plate, body = [37, 99, 235] }) {
  const c = new Canvas(640, 400, [186, 230, 253]);
  c.rect(0, 300, 640, 100, [148, 163, 184]);
  c.rect(110, 150, 300, 70, body);
  c.rect(60, 210, 520, 90, body);
  c.rect(150, 165, 110, 50, [224, 242, 254]);
  c.rect(275, 165, 110, 50, [224, 242, 254]);
  c.circle(170, 305, 42, INK);
  c.circle(470, 305, 42, INK);
  c.circle(170, 305, 18, MUTED);
  c.circle(470, 305, 18, MUTED);
  c.rect(240, 255, 160, 36, WHITE);
  c.text(248, 262, plate, 3, INK);
  c.text(20, 20, label, 3, INK);
  c.text(20, 370, 'SAMPLE VEHICLE PHOTO', 2, RED);
  return c.toBuffer();
}

export function plate({ plate: plateNumber }) {
  const c = new Canvas(520, 180, [203, 213, 225]);
  c.rect(20, 20, 480, 140, WHITE);
  c.outline(20, 20, 480, 140, INK, 6);
  c.text(150, 34, 'PILIPINAS', 2, [22, 101, 52]);
  c.text(70, 70, plateNumber, 7, INK);
  c.text(150, 140, 'SAMPLE PLATE', 2, RED);
  return c.toBuffer();
}

export function document({ title, lines, stamp = null }) {
  const c = new Canvas(600, 800, [254, 252, 232]);
  c.watermark();
  c.rect(0, 0, 600, 70, [30, 64, 175]);
  c.text(24, 24, title, 3, WHITE);
  lines.forEach((line, i) => c.text(30, 110 + i * 40, line, 2, INK));
  if (stamp) {
    c.outline(360, 640, 210, 80, RED, 5);
    c.text(375, 670, stamp, 3, RED);
  }
  c.text(30, 760, 'SAMPLE ONLY - NOT A REAL DOCUMENT', 2, RED);
  return c.toBuffer();
}

export function orcr({ plate: plateNumber, make, model, year, owner }) {
  return document({
    title: 'LTO OR/CR - CERTIFICATE OF REGISTRATION',
    lines: [`PLATE NO: ${plateNumber}`, `MAKE: ${make}`, `MODEL: ${model}`, `YEAR: ${year}`, `REGISTERED OWNER: ${owner}`, 'MV FILE NO: 0304-0000123456', 'CHASSIS: SAMPLE-CHS-0001', 'ENGINE: SAMPLE-ENG-0001', '', 'OFFICIAL RECEIPT NO. 00000000'],
    stamp: 'PAID',
  });
}

export function license({ name, number, expiry }) {
  const c = new Canvas(640, 400, [236, 253, 245]);
  c.watermark();
  c.rect(0, 0, 640, 64, [22, 101, 52]);
  c.text(20, 18, "LTO DRIVER'S LICENSE", 4, WHITE);
  c.rect(24, 92, 160, 200, [203, 213, 225]);
  personSilhouette(c, 104, 115, 90, MUTED);
  c.text(210, 96, 'NAME', 2, MUTED);
  c.text(210, 120, name, 3, INK);
  c.text(210, 166, 'LICENSE NO.', 2, MUTED);
  c.text(210, 190, number, 3, INK);
  c.text(210, 236, 'EXPIRATION', 2, MUTED);
  c.text(210, 260, expiry, 3, INK);
  c.text(24, 330, 'RESTRICTIONS: A, B', 3, INK);
  c.text(24, 368, 'SAMPLE ONLY - NOT A REAL DOCUMENT', 2, RED);
  return c.toBuffer();
}

export function chatScreenshot({ title, lines }) {
  const c = new Canvas(480, 800, [248, 250, 252]);
  c.rect(0, 0, 480, 70, [37, 99, 235]);
  c.text(20, 26, title, 3, WHITE);
  lines.forEach(([mine, text], i) => {
    const y = 100 + i * 90;
    const width = Math.min(400, text.length * 12 + 30);
    const x = mine ? 460 - width : 20;
    c.rect(x, y, width, 60, mine ? [191, 219, 254] : [226, 232, 240]);
    c.text(x + 14, y + 22, text, 2, INK);
  });
  c.text(20, 760, 'SAMPLE EVIDENCE SCREENSHOT', 2, RED);
  return c.toBuffer();
}

// Uploads to `${userId}/seed-${label}.png`, the same per-user folder layout
// the app uses so storage policies and signed URLs behave normally.
export async function upload(bucket, userId, label, buffer) {
  const path = `${userId}/seed-${label}.png`;
  const { error } = await admin.storage.from(bucket).upload(path, buffer, { contentType: 'image/png', upsert: true });
  if (error) {
    warn(`upload ${bucket}/${path}: ${error.message}`);
    return null;
  }
  return path;
}
