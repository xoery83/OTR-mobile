# Finite A/B QA restriction candidate — not selected or authorized

Root selector handoff addendum: `parseMemberClaimQaCase(raw:unknown)` exports the
same strict case schema and constructor now calls it. It copies/validates shape
and policy only; it does not check live time, endpoint or select a port. Root must
independently reject unopened/expired cases before composing PG options. Invalid
QA input must close only Claim, leaving ordinary Trip/Core startup intact. No
second configuration entry exists in Auth. One new parser check PASS; the prior16
policy tests/review remain unchanged evidence, not rerun or rehashed as a new review.

`createMemberClaimQaAuthority(existingPort, exactCase)` returns `{port,close}`.
Root's existing v3 raw-Core constructor remains the only PG connection source.
Wrap that port with this Auth restriction before any future explicit selection;
do not bypass the existing normal-account gateway or underlying PG authorization.
Existing production calls remain unchanged and select neither port nor wrapper.

The strict case fixes DEV, A/B, Trip, never-linked Person and two operation IDs.
The Owner's issue can target only B and that Person; only B can Claim. Receipt
scope, outcome and original intent digest are checked. Reads/links/issue cannot
target another Person or Account. Dynamic invite IDs must pass the owning invite
reader and exact Trip/Person/registered-B/expiry checks. All other mutators,
including pending-invite revoke and unregistered identity confirmation, are closed.
The QA restriction never makes a denied business operation permitted.

Runtime opensAt/closesAt are separate from inviteExpiresAt; no default timestamps,
config mount, Env key, production invitation policy or startup selection is added.
The proposed template's10-minute invitation and30-minute QA maximum are a future
test-only Gate proposal, not an approved production TTL or execution approval.
Root must pin actual server-derived times in a fixed execution artifact. The
template omits them and cannot instantiate the wrapper as-is.

Checks precede/finish each method, callback and transaction result; close, observed
expiry and backward clock latch closed. Failed or pending detached methods prevent
callback success; escaped handles retire. These checks do not cancel an already
attempted SQL COMMIT. A late result is UNKNOWN; preserve the original operation and
receipt and do not claim NoCommit, undo the membership or resubmit another ID.
After close, recovery is closed too; any later recovery requires its own qualified
read-only authority. Do not silently extend or reopen the same case.

Before requesting the exact activation Gate, Root still supplies the owning server
selector, independent bounded close/restore controller and fresh Host CAS. Verify
actual DEV endpoint separately: projectRef in config is only an assertion. Require
normal A/B own sessions, quota/readiness before open, exact existing Person binding
preimage and independent authorized SQL readback. No schema installation is needed
for this Adapter. Preserve current default/image/config rollback; rollback does
not delete receipts or reset a successfully connected Person.

16 component tests and independent16 PASS; no old PG suite repeated. No Hosted QA,
Native/UI integration or real timer/SQL cancellation is proved. Current normal
Hosted software is default-closed (runtime-hosted-receipt/); this wrapper and the
new Native repository c9858f88 are later, unselected source candidates.
