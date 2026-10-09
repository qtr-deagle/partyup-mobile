// PartyUp Terms & Conditions and Privacy Policy.
//
// The website keeps an identical copy at PartyUp-main/client/src/content/legal.ts
// (served at /terms and /privacy). Change both together and bump
// LEGAL_LAST_UPDATED.

export type LegalSection = { heading: string; body: string };

export const LEGAL_LAST_UPDATED = 'October 8, 2026';
export const LEGAL_CONTACT_EMAIL = 'partyup.demo.bulacan@gmail.com';
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Acceptance of Terms',
    body: 'PartyUp is a travel-companion and carpool app operated by the PartyUp team, a student project based in Bulacan, Philippines ("PartyUp", "we", "us"). By creating an account or using the PartyUp app or website, you agree to these Terms & Conditions and to our Privacy Policy. If you do not agree, do not create an account or use PartyUp.',
  },
  {
    heading: '2. Eligibility',
    body: 'You must be at least 18 years old to use PartyUp. You sign up with a Google (Gmail) email address, and you may hold only one account. PartyUp currently serves travelers who live in Bulacan, so your stated city must be a Bulacan municipality.',
  },
  {
    heading: '3. Your Account and Verification',
    body: 'You must give accurate information, including your legal name and date of birth, and keep your password private. Some features require verification: a government ID and selfie to verify your identity, and a valid driver\'s license and vehicle documents before you can drive for a carpool. Verification uses automated checks and review by PartyUp admins. We may refuse or revoke verification if documents are unclear, expired, do not match, or appear fraudulent. You are responsible for everything done through your account.',
  },
  {
    heading: '4. Trips, Carpools and Fuel Sharing',
    body: 'PartyUp helps travelers find each other and share trips. Carpools on PartyUp are cost-sharing arrangements between private individuals, not for-hire transport: drivers may only ask riders to contribute toward fuel and trip costs, not to make a profit. Drivers are responsible for holding a valid license, a roadworthy and registered vehicle, and any insurance the law requires. PartyUp adds a 2% platform fee to contributions paid through the app. All payments are made in the app through PayMongo (GCash or PayMaya). Payments that are not completed within 24 hours are cancelled, and you can pay again. Arrangements made outside the app are between you and the other user, and PartyUp cannot help with them. Completed payments are not refunded by PartyUp; payment problems can be raised through the in-app Report and Support tools, and we will help where we can.',
  },
  {
    heading: '5. Guilds, Ranks and Rewards',
    body: 'Guild points, ranks, missions, medals, cosmetics and rewards are part of the PartyUp experience. They have no cash value, cannot be sold or transferred, and may be adjusted if earned through cheating or abuse. Guild Leaders must manage their guild fairly and follow these terms. Points, ranks and rewards are forfeited when an account is deleted.',
  },
  {
    heading: '6. User Conduct and Content',
    body: 'You agree not to harass, threaten, discriminate against, scam or endanger other users; not to impersonate anyone or submit false documents; not to use PartyUp to arrange unsafe or illegal transport; and not to post unlawful, sexual, hateful or violent content. You keep ownership of the messages, photos and reviews you post, and you give PartyUp permission to store and display them as needed to run the service. You are responsible for your own conduct during trips and meetups arranged through PartyUp.',
  },
  {
    heading: '7. Safety Disclaimer',
    body: 'PartyUp helps travelers connect but does not own, operate or guarantee the safety of any vehicle, driver or trip. You take part in shared trips and travel arrangements at your own risk. Trust scores, verification badges, Warning Mode, SOS alerts and trusted-contact features are best-effort safety aids, not a guarantee of safety. In an emergency, contact local authorities (911) first.',
  },
  {
    heading: '8. Reports, Moderation and Suspension',
    body: 'You can report users, trips, guilds and payment problems in the app. PartyUp admins review reports and may warn users, remove content, disband guilds, or suspend or terminate accounts that break these terms, commit fraud, or put other users at risk. We keep records of moderation actions.',
  },
  {
    heading: '9. Deleting Your Account',
    body: `You can delete your account at any time from Settings in the app. If you can't use the app, email ${LEGAL_CONTACT_EMAIL} from the address on your account and we'll do it for you. Before you can delete it, you must first finish or cancel trips you host, finish trips in progress, hand over a guild you lead that still has members, and wait for pending payments to complete. Your account is then deactivated right away and permanently deleted after 30 days. Signing back in during those 30 days lets you restore it. After deletion you forfeit your guild points, ranks, cosmetics and rewards, and completed payments are not refunded. See "Account Deletion" in the Privacy Policy for what is deleted and what is kept.`,
  },
  {
    heading: '10. Disclaimer and Limitation of Liability',
    body: 'PartyUp is provided "as is" and "as available". As a student project, we do not promise that it will be uninterrupted or error-free. To the fullest extent allowed by law, PartyUp and its team are not liable for any indirect or consequential loss, or for injury, loss or damage arising from trips, meetups, payments or other dealings between users.',
  },
  {
    heading: '11. Governing Law',
    body: 'These terms are governed by the laws of the Republic of the Philippines. Any dispute will be brought before the proper courts of Bulacan, unless the law requires otherwise.',
  },
  {
    heading: '12. Changes to These Terms',
    body: 'We may update these terms as PartyUp changes. We will show the date of the latest update at the top and let you know in the app about important changes. Continuing to use PartyUp after an update means you accept the updated terms.',
  },
  {
    heading: '13. Contact',
    body: `Questions about these terms can be sent to ${LEGAL_CONTACT_EMAIL}.`,
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Who We Are',
    body: `PartyUp is a travel-companion and carpool app operated by the PartyUp team, a student project based in Bulacan, Philippines. We control the personal information described in this policy and handle it in line with the Data Privacy Act of 2012 (Republic Act No. 10173). You can reach us at ${LEGAL_CONTACT_EMAIL}.`,
  },
  {
    heading: '2. Information We Collect',
    body: 'Account: your email address, legal name, display name, date of birth, phone number, city, bio, interests and profile photo.\n\nVerification: photos of your government ID (front and back), a selfie, the ID type and last digits, and the results of automated checks (face match score, estimated age range, detected address). If you drive: your driver\'s license photos, license number, expiry date, restriction codes and QR data, and your vehicle\'s make, model, year, color, plate number and ownership documents.\n\nLocation: your location while you use the map, nearby-traveler and trip features; live location shared during trips, Warning Mode or SOS alerts; location history used for safety features; and trip origins, destinations, meetup and pickup points.\n\nTrips and payments: trips you create or join, travel plans and preferences (including gender preferences you choose to set), contributions, platform fees, payment status and references, and the GCash or PayMaya handle you add.\n\nCommunication: chat messages, photos, reactions and read receipts; support tickets; reports you file, with any evidence photos.\n\nCommunity: ratings and reviews, trust score, friends, trusted contacts (including names and phone numbers you add for them), blocked users, and guild activity such as points, ranks, missions and rewards.\n\nDevice: push notification tokens and the device platform.',
  },
  {
    heading: '3. How We Use Your Information',
    body: 'We use your information to create and secure your account; verify identities, ages, licenses and vehicles; match you with trips and travelers; run chats, notifications, guilds and rewards; process contributions and payments; power safety features such as Warning Mode, SOS alerts and trusted contacts; review reports and keep the community safe; answer support requests; and fix problems and improve PartyUp. We do not sell your personal information, and we do not use it for third-party advertising.',
  },
  {
    heading: '4. What Other Users Can See',
    body: 'Other users can see your display name, profile photo, city, bio, interests, verification badge, trust score, ratings and guild details. Trip members can see the trips you join, your messages in trip chats, and your meetup or pickup point. Your live location is shared only with the people you share it with (trip members during a trip, or your trusted contacts during Warning Mode or an SOS alert). Your ID and license images are never shown to other users.',
  },
  {
    heading: '5. Service Providers',
    body: 'We use these providers to run PartyUp, and they process data only on our behalf: Supabase (database, login and file storage); Amazon Web Services Rekognition (face matching and text reading for ID and license checks); PayMongo (online payments); Brevo (verification emails); Expo (push notifications); and Esri, OpenStreetMap and Apple Maps (map tiles). Some of these providers store data outside the Philippines. We may also share information when the law requires it, or to protect someone\'s safety in an emergency.',
  },
  {
    heading: '6. How Long We Keep It',
    body: 'We keep your information for as long as your account exists. Location history is kept only as long as needed for safety features. When your account is deleted, your personal information is removed as described below.',
  },
  {
    heading: '7. Account Deletion',
    body: `You can delete your account from Settings in the app, or by emailing ${LEGAL_CONTACT_EMAIL} from the address on your account if you can't use the app. Your account is deactivated immediately and hidden from other users, and it is permanently deleted after 30 days. Signing back in before then lets you restore it. We email you when deletion is scheduled, 3 days before it happens, and once it is done.\n\nWhen it is deleted, we remove your profile, verification documents, license and vehicle records, location data, trips you created, trip memberships, chat messages and photos you sent, ratings and reviews you wrote, friends and trusted contacts, guild progress and rewards, support tickets, reports you filed, payment records and push tokens. Admin audit records are kept with your identity removed, and reports others filed about you may be kept, without your account details, to protect the community.`,
  },
  {
    heading: '8. Your Rights',
    body: `Under the Data Privacy Act you have the right to be informed, to access your data, to correct it, to object to its processing, to have it erased or blocked, to data portability, and to claim damages. You can update most of your information in the app, delete your account at any time, or email ${LEGAL_CONTACT_EMAIL} for anything else. If you believe we have mishandled your data, you can file a complaint with the National Privacy Commission (privacy.gov.ph).`,
  },
  {
    heading: '9. Security',
    body: 'We use encrypted connections, access rules that limit each user to their own data, private storage for ID, license and vehicle documents, and admin-only review tools. No system is perfectly secure, so please use a strong password and keep it private.',
  },
  {
    heading: '10. Age Requirement',
    body: 'PartyUp is only for adults aged 18 and over. We do not knowingly collect information from minors; if we learn that a minor has created an account, we will delete it.',
  },
  {
    heading: '11. Changes to This Policy',
    body: 'We may update this policy as PartyUp changes. We will show the date of the latest update at the top and let you know in the app about important changes.',
  },
  {
    heading: '12. Contact',
    body: `For privacy questions or requests, email ${LEGAL_CONTACT_EMAIL}.`,
  },
];
