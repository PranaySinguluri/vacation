# Security hardening deployment checklist

This change is staged in PR #74. **Do not merge it or deploy the new client until owner setup and Firestore Security Rules are deployed together.** The new client denies shared access until it can read the owner configuration and an approved member UID.

## What the new client protects

- No real flight itineraries or booking details are included in the current public HTML. Traveler flight records come only from `trips/main/flights/{personId}` for approved accounts.
- Every approved traveler is mapped to a specific Firebase Auth UID in `trips/main/members/{uid}`. Names or email substrings are **not** proof of identity.
- The site no longer contains or accepts the admin PIN; admin operations use the authenticated owner UID defined in the Firestore configuration.
- Shared expense create/edit/delete operations send an immutable, deterministic audit record and sequential revision. Rules reject missing audits, forged actors, stale revisions and unauthorized access. Existing older expenses can acquire revision 1 when an approved member first edits them.
- Firestore uses in-memory caching on the current client; legacy browser flight-cache keys are removed. Older IndexedDB caches may remain from old app versions until browser site data is cleared.

## Step 1 — Back up production data

In the Firebase/GCP Console for project `vacation-fa517`, back up/export the Firestore data **before** altering rules. Confirm the actual Firebase Authentication UIDs for the seven travelers. No personal UID, service-account key, password or API secret should be committed to GitHub.

## Step 2 — Review and bootstrap the owner

From Firebase Console → Authentication → Users, find the real UID of the trip owner, then in Firestore create the document:

```text
trips/main/config/security
  ownerUid: "<actual Firebase Auth UID of the owner>"
```

Using the **Firestore Console / privileged Admin SDK**, verify that the owner is approved in:

```text
trips/main/members/<ownerUid>
  person: "P"
  approvedBy: "<ownerUid>"
```

Do not use the example UID text literally. The `ownerUid` security document is intentionally **not writable from the browser**. An owner with an incorrect or missing UID will be unable to use the app. Review all existing `members/{uid}` documents and revoke any unknown or incorrectly assigned accounts before relying on the new rules. Previously self-selected memberships may be untrustworthy.

## Step 3 — Validate and deploy the rules

The GitHub Actions `security-rules` job runs a real Firestore emulator against `firestore.rules`, including stranger denial, restricted flight updates, immutable audit logs, stale expense revision rejection, and member approval. These tests only prove behavior for the reviewed proposed rules, not the rules currently deployed in production.

After confirming the owner configuration and backup, deploy the rules to the correct Firebase project:

```bash
npm install
npx firebase login
npx firebase use --add
npx firebase deploy --only firestore:rules --project vacation-fa517
```

Review the actual existing Firestore rules before replacement, because custom app integrations outside the Vacation repository may rely on them. Do not use `--force` without an explicit review.

## Step 4 — Verify real accounts before publishing the client

Use separate Google accounts or browsers:
1. Owner opens the trip successfully and sees the owner-only pending-access approval panel.
2. One approved member opens places, expenses and flight cards; an unapproved account cannot read them.
3. A new member signs in and requests access; owner verifies their **actual Google email** and approves the appropriate traveler; they can then open the trip.
4. An approved traveler cannot change a different traveler's flight record; owner can.
5. An approved traveler can add, edit and delete shared expenses; the correct real actor UID, `rev` and immutable log entry are written atomically.
6. Two members editing the same expense with the same revision: the stale second write must be rejected, rather than silently overwrite the first. Both should refresh before retrying.
7. An outsider cannot read or delete expenses, payments, flights, logs or membership records.
8. Sign out and reload; private flight data must not be shown until a new approved sign-in.
9. Verify old Firefox/Chrome/iOS Safari caches are cleared as needed if a previous version stored sensitive trip data on the device.

## Step 5 — Migrate existing travelers' flight schedules safely

Previous app versions included flight schedules **directly in public HTML**. The new public site intentionally has no such defaults. Flights already saved in protected `trips/main/flights` are retained. If that collection was empty, the flight panels will be blank until approved travelers or the owner re-enter their itineraries using the secured flight editor / screenshots.

**Do not recreate the original itineraries as a public JSON file, GitHub fixture, test, PR description or HTML fallback.** Do not commit booking confirmation numbers.

## Step 6 — Address historical disclosures

Removing data from the latest HTML does **not** erase it from public Git history, GitHub Pages build caches, third-party mirrors, or previous downloads. The repository owner must consider making the repository private if possible, or performing a reviewed history rewrite / repository migration, with GitHub's sensitive-data-removal process where appropriate. GitHub connector tools available to this assistant cannot rewrite published history or change repository visibility.

## Known limits / follow-up

- Production deployment and owner UID bootstrap require Firebase project authorization. They have **not** occurred merely because GitHub tests pass.
- Rules enforce per-expense version checks and paired immutable audit entries; they do not guarantee unlimited historical log retention, prevent a malicious approved traveler from creating an intentionally inaccurate expense, or prevent approved group members from editing other approved members' expenses. Those last actions are currently intentional group policy.
- Security Rules are not a substitute for server-side alerting, rate limits/quotas, Firebase App Check, account MFA/Google account protection, or monitoring.
- Non-expense itinerary actions still use ordinary client-generated log entries. The expense-only audit is the part hardened by the new rules.
- The Firebase client SDK configuration key is public by design; access control belongs in Auth + Rules, not secrecy of that key.

**Release order:** owner UID + membership review → back up → deploy and validate rules → merge PR #74 → validate live GitHub Pages + all seven travelers.
