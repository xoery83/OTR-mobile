# Publication Catalog native bounded receipt

Owner accepted Transport Rollout R1 and authorized R2-Native on 2026-10-09.
Accepted source: `/private/tmp/otr-platform-transport-r1-20261009/docs/architecture/OTR_PLATFORM_TRANSPORT_ROLLOUT_R1_PREFLIGHT.md`,
SHA-256 `60930226bfc295e729180e658f05cda3232bb83aff10814f0212889b427dee2f`.

Implement the accepted capped-completion option in a local iOS Expo module. A
serialized URLSession data delegate counts delivered decompressed bytes before
retention: success 4,194,304, error 8,192. Overflow cancels and withholds all.
Accept identity/gzip only, platform TLS validation, no redirects, cookies, disk
cache, credential storage or native retry. One native request/result slot remains
owned until JS acknowledges it. Native monotonic deadline and cancellation work
independently of JS execution; JS retains the original whole-request deadline and
Account generation fences. Only complete bytes reach the unchanged strict parser.

The explicit facade is privately registered; only it can bypass the global
Response streaming-shape check. Availability is verified before token work.
Android and missing native modules are unavailable. No default composition,
global fetch replacement, package, queue, scheduler or SQL change. Native app and
device acceptance remain separately authorized after independent review.

## F1 owner correction — identity only

The accepted independent security review demonstrated incomplete gzip admission.
Owner chose identity-only receive on 2026-10-09: request `Accept-Encoding: identity`
and reject every present Content-Encoding value except a single `identity` value.
URLSession header preservation and no-header raw gzip behavior are exercised in
local native fixtures; gzip magic, including a split prefix, is rejected before
complete-body emission. No decoder or dependency is added. iOS runtime acceptance
remains gated; any observed loss of original encoding evidence blocks activation.
