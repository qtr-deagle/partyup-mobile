import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import { decode as decodeJpeg } from 'jpeg-js';

const SAMPLE_WIDTH = 120;
const MIN_BRIGHTNESS = 40;
const MAX_BRIGHTNESS = 235;
const MIN_SHARPNESS = 4;

export type QualityIssue = 'blurry' | 'dark' | 'bright';

export async function assessImageQuality(uri: string): Promise<{ ok: boolean; reason?: QualityIssue }> {
  const { base64 } = await manipulateAsync(uri, [{ resize: { width: SAMPLE_WIDTH } }], {
    base64: true,
    compress: 0.5,
    format: SaveFormat.JPEG,
  });

  if (!base64) {
    return { ok: true };
  }

  const { width, height, data } = decodeJpeg(toByteArray(base64), { useTArray: true });

  let brightnessSum = 0;
  let sharpnessSum = 0;
  let pixelCount = 0;
  let gradientCount = 0;
  let prevLuma = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const luma = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      brightnessSum += luma;
      pixelCount++;

      if (x > 0) {
        sharpnessSum += Math.abs(luma - prevLuma);
        gradientCount++;
      }
      prevLuma = luma;
    }
  }

  const brightness = brightnessSum / pixelCount;
  const sharpness = sharpnessSum / gradientCount;

  if (brightness < MIN_BRIGHTNESS) {
    return { ok: false, reason: 'dark' };
  }
  if (brightness > MAX_BRIGHTNESS) {
    return { ok: false, reason: 'bright' };
  }
  if (sharpness < MIN_SHARPNESS) {
    return { ok: false, reason: 'blurry' };
  }

  return { ok: true };
}

export function qualityIssueMessage(reason: QualityIssue): string {
  if (reason === 'dark') return 'Too dark — retrying…';
  if (reason === 'bright') return 'Too much glare — retrying…';
  return 'Blurry — hold steady, retrying…';
}
