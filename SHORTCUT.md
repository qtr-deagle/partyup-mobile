-- replace with your actual user id or email
-- for deleting ID Verification
delete from public.id_verifications
where user_id = '<Enter User ID>';

update public.profiles
set verification_status = 'unverified'
where id = '<Enter User ID>';

----------------------------------------------------------

DEMO FLOW FOR PANELIST

Recommended live flow for the panel, now that both gaps are closed:

Register a fresh traveler account.
Submit ID verification (let the selfie quality-retry trigger once to show it's real).
Switch to your staff account → Settings → Review ID Verifications → Approve.
Back on the traveler account, create a carpool, share the invite code.
Second account joins, driver approves, rider pays (PayMongo sandbox is the more visual choice), driver confirms.
Driver taps Complete Trip.
Rate the other traveler from the now-completed trip.
Close with Report/Block as a quick safety-feature highlight.ewdscxz

Register your own presenter account live in the app (e.g. you@partyup.demo) for the register → verify beats, then run npm run demo:reset any time you want to wipe everything under @partyup.demo and start clean for the next rehearsal.

----------------------------------------------------------

Setup — do this once, before the panel sits down:


npm run demo:seed
This wipes any leftover @partyup.demo accounts and creates fresh reviewer@partyup.demo (staff) and rider@partyup.demo (pre-approved traveler), both password Demo1234!. Don't run demo:reset again until you're done presenting or rehearsing a new run-through.

Use two devices/emulators side by side — it removes every sign-out/sign-in gap from the live flow:

Device A ("Driver") — stays on this one account the whole demo. You'll register it live.
Device B ("Second traveler") — logs in as reviewer@partyup.demo first, then switches to rider@partyup.demo partway through.
LIVE DEMO SCRIPT

1. Register (Device A)

Sign-in screen → "Sign up" → Step 1: email you@partyup.demo (or anything), password, confirm → Step 2: full name, date of birth → Step 3: tap ≥1 interest → finish.
Say: "Registration is a 3-step wizard — credentials, identity basics, then interests we use for matching."
Lands straight in the app (no email confirmation needed on this project).
2. Submit ID verification (Device A)

Navigate to Verify ID (from profile/prompt) → pick document type (e.g. Driver's License) → tap the Front-of-ID tile → use the in-app camera with the guide rectangle, capture → Back-of-ID same way → Selfie tile → front camera opens with the circular face guide.
On the selfie, deliberately cover the lens or aim it too dark for one attempt so the auto-retry ("too dark, try again") fires once — proves it's a real on-device check, not decoration. Then capture properly and accept.
Submit. Say: "This upload also kicks off a background AWS Rekognition face-match and age check — advisory only, a human always makes the final call."
3. Approve it (Device B, as reviewer)

Sign in as reviewer@partyup.demo / Demo1234!.
Settings (profile → gear/Settings) → "Review ID Verifications".
Card for your Device A account appears with front/back/selfie photos + the AI match score. Tap Approve.
Say: "Staff sees the same photos plus the AI's advisory score, and makes the real decision."
4. Create a carpool (Device A)

Carpooling tab → make sure the Carpool switch (not Tours) is selected → tap the + FAB → fill title, origin, destination, date/time, seats, total cost, visibility public → create.
Opens the trip detail screen. Tap Share Invite Link to surface the invite code.
5. Join as the second traveler (Device B)

Sign out of the reviewer account → sign in as rider@partyup.demo / Demo1234! (already pre-approved, so no verification wait here — mention that out loud).
Carpooling tab → Carpool → enter the invite code in the manual join box → Join. Status goes to pending.
Back on Device A: trip detail screen shows the request under "Pending requests" → tap Accept.
6. Pay (Device B → Device A)

Device B (now an accepted rider): trip detail → "Pay Instantly (Sandbox)" → GCash or PayMaya → PayMongo sandbox checkout opens in-browser → complete the test payment → it flips to paid live via realtime, no manual refresh.
Say: "This is PayMongo test mode — no real money moves — but the webhook verification and realtime status flip are real."
7. Complete the trip (Device A)

Trip detail screen, driver view → tap the green "Complete Trip" button.
Say: "Marking a trip complete is what unlocks rating between travelers."
8. Rate (Device A or B)

Same trip detail screen now shows "Rate your travel companions" → tap Rate next to the other traveler → pick stars, optional comment → submit.
9. Close with safety features (either device)

Open the rated traveler's profile → show Report (type, details, evidence photo) and Block buttons briefly, and Settings → "Manage Blocked Users" to show the block list. Don't actually submit a report/block unless you want to reset again after — keep it to "here's the flow" without committing the action, or follow with npm run demo:reset afterward regardless.
After you're done (or before the next rehearsal):


npm run demo:reset
Wipes every @partyup.demo account clean, including whatever email you registered live on Device A, so the next run starts from zero.

Want this turned into a printable one-page cue card (artifact) you can glance at on a second screen while presenting?