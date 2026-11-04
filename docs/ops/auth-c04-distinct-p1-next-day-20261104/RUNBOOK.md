# AUTH-C04 distinct shared P1 — next-day packet

Preparation only. No OTP or Hosted/business command was sent. The overtime authorization covers this local preparation, not execution.

This is a separate **6 November shoreline safety briefing** with substantive safety/buddy-check content, not a replacement of the 4 November smoke fixture. Existing Trip `fb2f0820…`, A/Owner `26876e6e…`, B/member `1f3d7935…` and their Person bindings are historical qualified inputs. They must be revalidated for actual execution. Original `f5e…` and `4028…` remain UNKNOWN and never appear on this case's allowed POST/receipt list.

## Fixed artifacts

- `CASE.json`: independent purpose, exact Account/Person/Trip/Item/Operation.
- `COMMAND.json`: canonical validated Core command, including the canonical date-only boundary.
- `WIRE_BODY.json`: exact `JSON.stringify(validateCoreCommand(...))` bytes, without a trailing newline. It is not the sorted canonical JSON used for intent hashing.
- `PLAN.json`: normal A write → Receipt → independent A collection → own cleanup → normal B read → own cleanup; recovery and truthful assertions.
- `PERMISSION_DELTA.json`: no SQL/RLS/GRANT/role changes. The only missing Gate is current exact business execution qualification for this new intent. Approval/runtime/clock references remain unset.
- `MANIFEST.json`: fixed artifact and runner/dependency hashes; no credentials.

From the Auth worktree, the following is executable **without credentials or network**:

```sh
node --import tsx scripts/auth/distinct-shared-p1-next-day.ts --check
```

The module exports `runDistinctSharedP1NextDay(input)`. This is the runnable next-day composition over the existing `runItemFixtureProbe`, normal registered-session driver and Core transport. The CLI deliberately has no live execute option. An existing authorized host operator imports the function and supplies its existing normal ports; no new Auth or Sync implementation is needed:

```ts
import { runDistinctSharedP1NextDay } from "./scripts/auth/distinct-shared-p1-next-day";
await runDistinctSharedP1NextDay({
  receivers: { A: existingExactAReceiver, B: existingExactBReceiver },
  publicOptions: existingValidatedDevPublicOptions,
  qualify: assertCurrentExactApprovedExecutionBinding,
  noteAuth: retainSanitizedAuthMetadata,
  noteCore: retainSanitizedCoreMetadata,
});
```

These are required *current owning operator inputs*, not permissive flags or new authority. `qualify` must prove the exact approved manifest/intent, target, resources and clock bounds using the current owning execution record. An empty callback, local JSON label, preparation approval or old installation receipt cannot grant permission. No current input binding is supplied or assumed in this packet. It fails before any Session when the required qualifier is absent. Current A capabilities and A/B binding/read checks still run normally.

The driver uses the existing receiver and `runRegisteredQaHostSession`: no registration fallback (`create_user:false`), exact normal `/user`, memory-only own Session, local-scope logout and refresh rejection. At most one OTP per account; receiver retries are bounded and never resend the email. Use only the dedicated QA Receiving credential through the established secure local channel, not SMTP. Never inject host Sessions into Native.

The fixed driver durably creates exclusive `ATTEMPT.json` and fsyncs it before any POST. Do not create that file during preparation, delete it after cleanup, or treat it as proof of commit. A crash after reservation leaves a conservative uncertainty record; a second reservation fails. The transport also prevents a second physical POST, including a 401 retry. The qualifier is checked again immediately before the wire. Keep the server's receipt semantics and existing permission checks unchanged.

If the POST response is lost, only the same **new** operation may be queried. Null, STATUS_ONLY, 404 or an Item without a qualified FULL receipt remains UNKNOWN. No new ID, alternate body, automatic retry or old intent substitution is allowed. Independent read-only recovery uses the existing `readOriginalFixtureOutcome(transport, AContext, distinctSharedP1CaseId)` with only `receipt` and `collection` methods. Its default two-argument form still binds the historical original case and is not used for the new case.

A successful packet run requires exact shared Item ID, A owner, GROUP visibility, P1 family, title/description/date/whole-group participation and matching A/B revision. GROUP visibility is not a new Everyone permission. No private fixture is created, so an empty/private-fixture-absent result is not private-isolation PASS. Native cold restore, Revoke, Profile Cloud and Owner UX remain outside this one operation.

## Remaining Gate

`CURRENT_EXACT_BUSINESS_EXECUTION_QUALIFICATION_FOR_THIS_DISTINCT_CASE` binds the reviewed candidate + manifest, exact single command, normal A/B identities and current resource/clock/read-retention qualification. Owner approval is required if not already precisely covered. No such business approval is claimed here; `d136` needs no repeat approval or installation. No other Lane is contacted for this overtime task.
