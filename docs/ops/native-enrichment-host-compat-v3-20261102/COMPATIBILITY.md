# Flight Enrichment Host compatibility — bounded local check

Base Native `fcfe8745`; Root interface snapshot
`6f458c5aa0f7c5f8da1247e1776da55eb8b31691`. Eight direct contracts/Host
interfaces are byte-identical between those baselines. This is a source snapshot,
not a read of the deployed DEV image or current capability state.

## Actual failure and minimal candidate

New normal/anonymous Auth classification already exists, but Enrichment's optional
app boundary used only Trip read access. With an injected enabled service, three
non-normal classes (ANONYMOUS, UNKNOWN, absent classification) obtained a successful
capability result; a same-ID classification drift also reached the service.
The new deterministic test reproduced four failures before the patch.

The candidate only reuses `isNormalAccount` after `authorizeRead` and in the
existing `assertCurrent` callback. It does not change Auth/Session ownership,
permissions, grants, metering or the default CLOSED runtime. Non-normal requests
are now rejected before service dispatch; the normal positive path still works.
The one existing Enrichment app fixture explicitly supplies NORMAL_ACCOUNT.

`app.ts` is a shared Root-owned integration file. This candidate is NOT applied to
Root/main or deployed. The exact patch passed read-only `git apply --check` against
Root's working tree. The unique Writer must preserve all current MCP/Auth/Source
changes when integrating it; do not replace app/startup files with an old version.

## Retained Host, not a second implementation

Retained package `90b4b1ce` already contains the reviewed persistent Host candidate
from `0f222171`: durable request claim/terminal/UNKNOWN custody, at most one Search
and one Extraction, protected reserve/mark/observe, scheduled Usage and independent
profile. Public CachePort remains MISS/no-write. No replacement client, ledger,
idempotency journal or Parser is required.

That retained protected composition is not present in the current Native/Root
baseline. An exact isolated leaf-module overlay produced compile errors against
the current shared interfaces, then was removed after hash verification. These
are missing previously prepared software integration, not evidence that the
Provider failed or that a new authorization scheme is needed:

- protected gateway lacks the retained Enrichment commands and input-custody verifier;
- HTTPS transport lacks the retained explicit FLIGHT_ENRICHMENT_V1 Search profile;
- extraction profile provenance lacks the retained prompt/contracts hash export;
- app/startup/capture do not forward the retained availability/runtime composition.

The shared request/response, service, port and projection contracts remain exact
with the retained package. Host optional composition must be stitched onto the
current Root baseline, not by merging/replacing the entire old branch. Old finite
approvals are historical; no expired Scope, budget, SQL or temporary role is
reactivated by this software candidate. Fresh protected capability/price/runtime
qualification and actual DEV readback remain future owning work.

## Evidence and limits

New Auth compatibility five cases plus existing Host boundary/service regression:
3 suites / 52 PASS. Existing default-CLOSED app case:1 PASS,53 unrelated cases not
selected. Scoped types and changed-source lint PASS. Native Suggestions/UNKNOWN/
UsagePending evidence is reused unchanged from the prior reviewed client package;
no Native files or device were touched here. RESULT.json records hashes and the
actual red/green/overlay evidence.

No Hosted/SQL/Provider/Device/main actions. No paid query or Cloud E2E PASS is
claimed. Remaining first integration dependency is the retained Host software
composition by its unique Writer, followed by lawful runtime/Provider qualification.
