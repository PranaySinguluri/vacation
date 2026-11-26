# Shared expenses: seven-traveler QA and Firebase security review

Updated: 2026-11-26

## Current verification status

The Vacation app stores shared expenses in Firestore `trips/main/expenses/{expenseId}`, per-expense actions in `trips/main/log/{logId}`, and deletion markers in `trips/main/deleted/{expenseId}`. The client submits these through a Firestore write batch and listens to live expense/log snapshots.

**Verified in GitHub Actions**: application code and test double behavior for the expense form, all seven traveler personas, each of the 49 creator/editor and 49 creator/deleter combinations, input validation, audit messages, form repeat protection, client-side authentication gates, previous traveler attribution, splitting, and the existing regression suite.

**Not verified**: actual deployed Firestore Security Rules, Firebase Auth identities, live Firestore permissions, cross-device ordering or offline conflict resolution. The repo does **not** contain `firestore.rules` or `firebase.json`, and a real Firebase emulator/deployed rules evaluation was not possible. Passing UI tests is **not** proof that a malicious caller cannot bypass browser checks.

## Intended product behavior (review/confirm)

- All **seven signed-in travelers** can view the same group expenses, add charges, select who paid, choose the people sharing a charge, and edit or delete **any** existing group expense.
- Every successful add/edit/delete carries the identity of the **actor** (not necessarily the payer). The original creator is retained when a different person edits an item.
- All seven can see the expense activity log; deletions disappear from the active expense ledger, but their audit entries remain.
- The UI does not expose a settlement/debt screen; expenses are recorded in USD as exact cents.
- A payer may be excluded from the cost-sharing participant list. This represents “person A paid for people B and C” and is intentional.
- Changes require a known traveler identity when Firestore sharing is enabled. The device-only fallback is not proof of a verified user identity.

## Security Rules acceptance criteria to verify in Firebase Emulator

| Operation | Valid member (one of 7) | Signed-out user | Signed-in non-member | Malicious client input |
|---|---|---|---|---|
| Read expenses | Allow | Deny | Deny | Do not expose trip records |
| Create expense | Allow valid record | Deny | Deny | Reject malformed amount, unsupported currency, fake creator, invalid IDs |
| Update expense | Allow; preserve creator, set editor | Deny | Deny | Reject forged editor and changes to immutable creation metadata |
| Delete expense | Allow; preserve audit trail | Deny | Deny | Prevent silent unaudited removal |
| Read expense activity | Allow | Deny | Deny | No access to internal log outside this trip |
| Create log | Append-only, authorized actor | Deny | Deny | Reject fabricated actor or deletion/edit of old log entries |
| Delete/update log | Deny (or admin-only controlled retention) | Deny | Deny | Cannot erase/forge audit history |
| Manage membership/admin | Admin-controlled only | Deny | Deny | Users cannot select or impersonate other identities |

Additional rule checks:
1. Use `request.auth.uid` and the canonical member document under `trips/main/members/{uid}`; **never trust client-supplied** `by`, `updatedBy`, `who`, or `paidBy` as proof of identity.
2. Check expense shapes and type constraints server-side: integer positive `amount` in cents, `currency == 'USD'`, allowed category, description length, valid payer/split IDs, non-empty unique participants, maximum participant count of seven, and acceptable date representation.
3. Reject updates that change existing creation metadata (`by`, `at`) and prevent users from changing historical log entries.
4. A random new log document written by the client in the same batch does **not by itself enforce** an audit trail. Security Rules must establish the invariant, or privileged backend logic should generate the audit entry as part of a server-controlled operation.
5. Test members in different browser sessions editing the same record, rapid edit/delete collisions, offline writes, permission-denied responses, and failed batches. The current client is optimistic and its last-write-wins behavior has **not been proven safe** for simultaneous conflicting edits.
6. Verify no cross-trip reads/writes and that members cannot change their claimed traveler identity through client payloads.
7. Review write/read quotas, batch size, log retention, and history completeness. The client currently reads up to 300 recent log records and has a 500-entry local cap; this is not indefinite audit retention.

## Test cases now included

1. Seven unique members each add their own record; every member sees all seven.
2. Each creator/editor combination (7×7): all edits retain original author, set the correct editor, update amount/payer/split/date/category, and save snapshots.
3. Each creator/deleter combination (7×7): each deletion removes the active expense while keeping actor/expense ID and a before-snapshot in history.
4. Exact cents, 1-cent expense, 3-way split of $10.01, and payer not included in the split.
5. Rejection of zero/negative, three decimals, scientific notation, malformed and overflowing amounts.
6. Rejection of nonexistent dates and support for leap days/cross-year dates.
7. Rejection of unknown category, unknown payer, empty or duplicate splits, and unrecognized travelers.
8. A corrected invalid form can be submitted; a double-tapped valid form cannot save twice.
9. A remotely deleted expense cannot be resurrected by an open stale edit; a closed detached form cannot submit.
10. Canceling deletion does not change the ledger or audit.
11. Audit snapshots remain immutable after later edits/deletions; non-expense changes stay out of the expense-only log.
12. Signed-in users who have not selected a recognized trip identity, loading users, and other client-disallowed states cannot edit shared expenses.
13. Existing itinerary, maps, photos, and other tabs run in the full regression workflow.

## Remaining release gate

Before relying on the app for real shared expenses, export and evaluate the **currently deployed** Firebase Rules in an emulator against real authenticated member and outsider test fixtures. Do not claim the Firestore backend is authorized merely because client tests pass. In particular, decide whether all members should truly be able to delete another member's charge and how the server enforces immutable audit entries.
