const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit']);
const FALLBACK_WAIT_SECONDS = 60;

// Seconds to wait before retrying a rate-limited Supabase auth call, or null
// if the error isn't a rate limit. Supabase's resend limit says how long is
// left ("...you can only request this after 42 seconds."); other limits
// don't, so they fall back to a minute.
export function rateLimitWaitSeconds(error: { code?: string; message: string }): number | null {
  if (!error.code || !RATE_LIMIT_CODES.has(error.code)) {
    return null;
  }
  const match = /after (\d+) seconds?/i.exec(error.message);
  return match ? Math.max(1, Number(match[1])) : FALLBACK_WAIT_SECONDS;
}

export function formatWait(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
