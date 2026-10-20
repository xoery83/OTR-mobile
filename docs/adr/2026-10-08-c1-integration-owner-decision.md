# C1 canonical integration Owner decision

Date: 2026-10-08 (Pacific/Auckland).
Status: Owner accepted contract; integration preparation authorized; independent review pending.

## Decision and authority

The current Owner message, “OWNER REVIEW PASS — AUTHORIZE C1 CANONICAL
INTEGRATION BUILDER”, authorizes an isolated two-parent no-ff/no-commit merge of
Platform `a817e8e881e2fa2e094696b13bc4df2eca7e2db2` and Capture
`79237cbd993792100ed51468e31671e4a2b59888`. It explicitly directs recording
joint P1 ↔ C2 Revision 1 acceptance and final naming
`continuesFromInputId` / `continues_from_input_id` as an Owner decision.
This record documents that current decision; it is not historical acceptance evidence.

Explicit same-Account continuation lineage is separate from byte equality,
replacement, Trip assignment and authorization. Revision 1 retains stable frozen
submission/Batch/Job/context/Input/replay identities, separate Batch/Job UUIDs with
a C2 1:1 shared header, atomic roster registration, factual `allInputsAccepted`,
always-available Hide/Close without cancellation, and invocation-time action
reauthorization. C2 is authenticated only; P5 remains deferred to C4.

## Evidence provenance

External inputs remain outside the merge; repository adoption is not authorized:

- Preflight: `/Users/xoery/.codex/worktrees/c1-canonical-preflight/otr-mobile-canonical/docs/architecture/OTR_CAPTURE_C1_CANONICAL_INTEGRATION_PREFLIGHT.md`.
- Original handshake: `/Users/xoery/.codex/worktrees/p1-c2-contract-handshake/otr-mobile-canonical/docs/architecture/OTR_PLATFORM_P1_CAPTURE_C2_CONTRACT_HANDSHAKE.md`.
  SHA-256: `53f4be37231957fceb4e366b24780c373a77b06645587403bef5e3899aa644af`.
- Supplied amendment: `/Users/xoery/Downloads/OTR_P1_C2_CONTRACT_REVISION_1.md`.
  SHA-256: `8f794199088863b7fe280de818e7ac068076984a3476e21a2b26770d67f293b3`.

The older PROPOSED/pending-name wording is superseded by the current Owner
instruction. No separate historical final Capture acceptance artifact is supplied,
created or claimed. C1 device/review acceptance and Platform final CP15B/LIVE-W
acceptance remain in their unchanged committed reports.

## Boundaries

Preserve all seven Capture commits and exact accepted implementation/test/report
bytes, historical SQLite1–50 and Server1–84, Account generation, localization/UI
guards and runtime CLOSED boundaries. C2, SQLite51/Server85, Hosted environments,
providers, commit/push and main advancement are unauthorized. Stop on a required
check failure or moved source HEAD. Independent review is the next checkpoint.
