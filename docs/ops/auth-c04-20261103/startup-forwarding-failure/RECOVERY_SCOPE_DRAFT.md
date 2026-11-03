# Original ISSUE recovery — scope draft, not execution authority

Fixed deployment receipt: main8c920f0f, SHA140279de280eabbe4f5d7a2b48830745e33fbef9157121a774ca863fc418df5f.
Root owns fresh Host CAS, finite selector and independent absolute close timer.
The previous713a7b92 window is consumed; deployment does not renew it.

Reuse the original A/B identities, Trip, Person, command and digest from
../hosted-ab-first-attempt/operations.jsonl. Do not rerun the old scenario entry:
it starts with execute(), whereas the retained original operation needs recovery first.

Next qualified execution must first read the original ISSUE receipt through the
existing repository recover() and independently bind actor/trip/person/op/digest.
A missing receipt / ABSENT_UNCONFIRMED stops without replay. An existing ISSUED
receipt must retain its actual invite identity and expiry; an expired invite cannot
be extended or substituted. Never infer permission from a missing SQL row.

Any proposed original-ID resubmission, new finite window, B Claim, or duplicate
requires its precise execution scope to be fixed and independently reviewed before
requesting the required authorization. No authorization is granted by this draft.
Reuse the normal Auth callbacks (one OTP challenge/account, quota failure stops),
existing receiver, retained command/digest and local-scope Session revocation.
No new retry engine, schema, role, GRANT, reset, replacement operation or copied Session.

Recovery-only entry is now implemented as scripts/auth/member-claim-qa-recovery.ts
(export recoverMemberClaimQaIssue), with eleven focused tests and independent
SCOPED_NO_BLOCKER_LOCAL_CANDIDATE review in RECOVERY_ENTRY_REVIEW.json.
It accepts only Owner Session (no B login), retained command+digest, existing
readReceipt, retain, fetch/signal/clock, and mandatory qualifyRecoveryWindow(qa).
Do not pass the existing readback.preflight: it requires zero original receipts
and is incompatible with confirmation of an existing receipt. The independent
readReceipt method remains reusable unchanged. Root must qualify the exact DEV
recovery scope, current fixed identities, installed authority, actual image/config
and finite timer without interpreting receipt presence as a reason to reset data.
Remaining preparation: bind the existing Root controller to this recovery-first
entry and its exact authorized outcomes, then pin the fresh plan/approval. No runtime activated.
Member Revoke and Native cold restore remain outside this recovery scope.
