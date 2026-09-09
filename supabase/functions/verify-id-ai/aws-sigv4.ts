// Minimal, dependency-free AWS Signature Version 4 signer + a thin
// Rekognition JSON-RPC helper, written for Deno's Web Crypto API.
//
// We hand-roll this instead of pulling in @aws-sdk/client-rekognition because
// the full SDK drags in a large @smithy/* dependency graph through Deno's npm
// compatibility layer, which is exactly the kind of surface that has a history
// of resolution/cold-start issues on Supabase's edge runtime. Rekognition's
// CompareFaces/DetectFaces are both a single signed POST to a fixed regional
// endpoint, so SigV4 for this one case is a small, auditable amount of code.

const SERVICE = 'rekognition';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function getAmzDate(): { amzDate: string; dateStamp: string } {
  // "2026-09-06T12:34:56.789Z" -> "20260906T123456Z"
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

async function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string): Promise<Uint8Array> {
  const kDate = await hmac(new TextEncoder().encode('AWS4' + secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

/**
 * Signs and sends a Rekognition JSON-RPC action (e.g. "CompareFaces",
 * "DetectFaces") and returns the parsed JSON response body.
 * Throws an Error (with an `awsErrorType` property) on any non-2xx response.
 */
export async function rekognitionRequest(
  action: string,
  creds: AwsCredentials,
  body: Record<string, unknown>
): Promise<any> {
  const host = `rekognition.${creds.region}.amazonaws.com`;
  const target = `RekognitionService.${action}`;
  const bodyStr = JSON.stringify(body);
  const { amzDate, dateStamp } = getAmzDate();

  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  const payloadHash = await sha256Hex(bodyStr);

  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${creds.region}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const signingKey = await deriveSigningKey(creds.secretAccessKey, dateStamp, creds.region);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Date': amzDate,
      'X-Amz-Target': target,
      Authorization: authorization,
    },
    body: bodyStr,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const awsErrorType: string = json.__type ?? json.Code ?? 'UnknownError';
    const message: string = json.Message ?? json.message ?? `Rekognition ${action} failed with status ${res.status}`;
    const err = new Error(message) as Error & { awsErrorType?: string };
    err.awsErrorType = awsErrorType;
    throw err;
  }

  return json;
}

export async function compareFaces(creds: AwsCredentials, sourceImageBase64: string, targetImageBase64: string) {
  return rekognitionRequest('CompareFaces', creds, {
    SourceImage: { Bytes: sourceImageBase64 },
    TargetImage: { Bytes: targetImageBase64 },
    SimilarityThreshold: 0,
  });
}

export async function detectFaceAgeRange(creds: AwsCredentials, imageBase64: string) {
  return rekognitionRequest('DetectFaces', creds, {
    Image: { Bytes: imageBase64 },
    Attributes: ['AGE_RANGE'],
  });
}
