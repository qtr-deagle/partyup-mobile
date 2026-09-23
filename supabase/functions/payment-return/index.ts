// Supabase Edge Function: payment-return
//
// This is the return_url PayMongo redirects to after a gateway checkout.
// Its content is essentially irrelevant: expo-web-browser's
// openAuthSessionAsync (called from app/trip/[id].tsx) intercepts navigation
// to this exact URL and closes the in-app browser itself, before this page
// ever really loads. It only exists as a fallback in case interception
// doesn't fire on some platform/browser combination, so the user isn't left
// staring at a dead end.
//
// Note: Supabase's edge gateway forces every function response to
// Content-Type: text/plain with a locked-down sandboxed CSP, regardless of
// headers set here -- so this can never render as real interactive HTML
// (no scripts, no client-side redirect). Keep this plain-text only.
//
// No Supabase JWT is sent here (PayMongo just redirects the user's browser
// to it), so this must have verify_jwt = false in supabase/config.toml.

Deno.serve(() => {
  return new Response('Payment complete. You can close this tab and return to PartyUp.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});
