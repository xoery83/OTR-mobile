# Registered DEV QA Host Session

Host-only entry: `scripts/auth/registered-qa-host-session.ts`, export
`withRegisteredQaHostSession(action)`. It is not bundled into iOS. Use the Auth
worktree as cwd; import with Node/tsx, not the iPad runtime.

This registered case is Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1` and Trip
`eb3a3e70-fe4d-4cff-81f8-9945bc804f28`. Normal existing-account OTP uses the same
QA recipient recorded in the accepted Native proof. `allowRegistration:false`
sets Supabase `create_user:false`: a missing/retired Account cannot silently
be replaced. Trusted `/auth/v1/user` must independently match exact Account ID,
recipient, original creation time and nonanonymous classification before use.

Use the existing normal DEV public configuration. Set `OTR_QA_RESEND_SCOPE` to
`dedicated-qa-team`. Set `OTR_QA_DEV_BUSINESS_WINDOW=HELD` only after
coordinating the actual business window; the flag itself grants no permission.
Use the independent Receiving credential in `OTR_QA_RESEND_API_KEY` or exact
Keychain service `OTR_QA_RESEND_API_KEY`, account `resend`, label `OTR-QA-Inbound`.
No SMTP credential or iPad Session/Keychain is read.

```ts
const { withRegisteredQaHostSession } = await import(absoluteHostToolUrl);
const result = await withRegisteredQaHostSession(async (context) => {
  const session = await context.readSession();
  // Use the existing normal Backend client for this Account/Trip.
  // Await all work. Record only operation/receipt IDs and business assertions.
  // Never print/persist the Session, headers, OTP, or refresh credentials.
});
// result contains only status, Account/Trip, cleanup status and host journal path.
```

The action receives `accountId`, `tripId` and `readSession()`, valid only during
that callback. The normal Session repository is memory-backed. Do not refresh,
replace or logout credentials inside the action; the helper owns final cleanup.
It calls only the existing local-scope logout, then requires the Host refresh
credential to be invalid. It never uses global logout or iPad credentials.
No callback result is printed or serialized. The caller must keep its own safe
business receipt evidence.

There is one Account-scoped lock and at least60seconds between sends. Each run
sends once, verifies once and consumes one original in-memory Receiving lease;
no old Native claim is removed. Receiving keeps exact recipient/sender/subject,
request time and message ID binding,12 newest-page polls/120seconds and no history
paging. No automatic send, verification, cleanup or business retry occurs after
UNKNOWN. Unresolved identity or cleanup retains the lock; a proven local revoke
allows another deliberate run after cooldown. An uncertain business operation
still requires its original owning receipt readback, never a new operation ID.

Direct4 suites83 PASS; independent4 suites80 PASS before three additional
nullable/late-read tests; types/lint PASS. Source Review NO_BLOCKER.
No live login was performed while preparing this tool. A real Host login/action/
local cleanup receipt must be recorded by the authorized consumer separately.
