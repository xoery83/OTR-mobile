# CP15B-LIVE-W — CLOSED DEV Flight host composition

Date: 2026-10-07. Activation remains CLOSED.

## Decision

Compose the accepted CP15B executor and verified protected gateway only for DEV
FLIGHT_IMPORT_V1. Host transport and one-shot gates further restrict Server84;
neither supplies authorization. TEST/PRODUCTION construction rejects explicitly.
No HTTP endpoint, scheduler, queue draining, provider retry or fallback is added.
Normal startup supplies no issuer/session/workflow provisioning and stays CLOSED.
Provisioning is a trusted private dependency contract, never a synthetic default,
caller authentication flag or generic Supabase service-role session.

Private request/result/raw-response bytes and immutable associations use the
accepted custody interface on a persistent private Backend filesystem mount.
Immutable exclusive files, content SHA/byte bounds, file fsync and directory fsync
precede acknowledgement. This store retains content; it grants no dispatch,
canonical, disclosure, price or scheduling authority. Release stays CLOSED.

An acceptance session immutably binds one Account/task/attempt/call/request in
that private retained store. Existing durable Server84 fresh mark CAS permits the
only transport handoff. Restart does not reconstruct an ACK or reset the call;
MAY_HAVE_STARTED/UNKNOWN cannot dispatch again. The process-local send latch is
an additional restriction, never the durable nonreplay proof.

Response bytes are durably retained before parsing/metering/install. A raw-response
recovery path validates exact retained pins, call responsibility and current
Account/Trip/material authority, then repeats pure parsing/rebinding/CP13B without
provider replay. Existing F1 recovery and independent installation fences remain.

A versioned model conformance policy admits exact deepseek-flash and
DeepSeek-V4.1-Flash returned identifiers; absence/mismatch rejects success but
preserves usage. This witnesses an alias under a reviewed policy, not immutable
weights. LIVE-1 must revalidate official documentation before activating.

## Consequences

No Server85, SQLite51, new durable business authority or dependency is required.
Persistent mount/ownership, actual dedicated issuer/session provisioning, current
official model/currency/price revalidation, dedicated secret, monetary policy and
one-call LIVE-1 authorization remain future operational prerequisites.
Deleting/replacing the private acceptance mount is not restart recovery and must
never be used to reopen an acceptance session. Missing/corrupt custody fails closed; the factory never creates a missing mount.

## Owner-approved targeted F1 correction

Live filesystem custody is Linux-only. Admission checks real procfs and walks from
trusted `/` one component at a time through parent descriptors with O_NOFOLLOW.
Container ancestors must be root/service-owned and not group/other writable; final
root is service-owned 0700. All leaves, links, cleanup and fsync use the retained
root descriptor; pathname replacement never redirects an admitted instance.
macOS/Windows production filesystem custody rejects without secret/transport access.

Trusted host provisioning supplies an opaque store UUID and expected mount device/
inode outside custody. A preprovisioned private marker must match that UUID; required
retained request pins must verify before transport construction. Device/inode is
additional same-mount continuity evidence, not reboot/restore identity by itself.
An approved restore must explicitly reattest metadata and retained associations;
missing content never permits replay. No marker or mount is created by startup.
This metadata is content-custody identity, never another dispatch journal.

Host bind-source ancestry remains operator responsibility. This protects against
namespace replacement under the stated trust model, not compromised host root,
Docker administrators or malicious code already executing as the Backend UID.
Runtime capability checks exercise exclusive create/link/bounded read/file and
directory fsync under that UID. Failure has no pathname fallback. No native addon.

## Targeted F1-R1 composition separation

The production factory accepts only provisioning/configuration. It always obtains
Linux anchored custody and verifies continuity before constructing the fixed HTTPS
transport; custody/fetch overrides and unknown input capabilities reject. Function
identity/shape establishes no test safety. Portable protocol roots live in fixtures,
use a fixture-only credential and deterministic transport, and are absent from the
Backend bundle. They share protocol state/parsing with production, not its security
capability acquisition. HTTPS interception belongs to direct transport unit tests.
