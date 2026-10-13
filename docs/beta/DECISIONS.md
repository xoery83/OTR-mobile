# OTR Beta — DECISIONS

2026-10-13 NZDT. Owner Response 01 is accepted delegation, not an application activation receipt. Ordinary engineering choices stay with coordinator; approved product design is not resubmitted. Active engineering baseline: [STATUS](STATUS.md); packets/forecasts: [EXECUTION](EXECUTION.md).

## Already decided / authority links

- Owner Response01: accepted inventory; ordinary R0/R1 implementation/fixes/review/tests/commit/local integration when Gates satisfied; internal Agent/Reviewer/Visual QA/Integrator coordination. No new Owner-only Gate for ordinary implementation. DEV tests only existing expressly approved scope. Production/paid Provider/new credentials/cross-user permission changes/irreversible operations require explicit approval. Push was not included in this response's explicit local-integration grant.
- [L1–L3 product v0.2](../trip/OTR_Trip_L1_L3_Review_v0.2.md), [W0 contract index](../trip/contracts/W0_UNIFIED_DATA_CONTRACT.md), [W1–W5 accepted implementation record](../trip/implementation/W1_W5_EXECUTION.md). Later accepted implementation overrides old document status language, not product semantics.
- [UI Foundation](../architecture/ui-foundation.md), [terminology](../architecture/OTR_TERMINOLOGY_GLOSSARY.md), approved Flexible/TTR/G2 contracts and ADRs are normative. Current Trip Home reuses Current Day Feed; no duplicate Today. Participant/Person identity precedes Account; claim preserves identity. Wallet is Ticket access, Photos minimum is local organization, Ledger owns financial truth.
- Coordinator Kickoff v2 and Visual QA Addendum supplied by Owner2026-10-13: every UI packet has independent observed Visual QA; source inspection alone never PASS. Normal layout defects are internal engineering, not Owner aesthetic approval requests.

## Gate Consolidation Proposal — package L1

**Ready to request now:** one bounded authorization for **PORT02 + G2-FLEX03** local preparation/implementation/review/integration. Owner is asked to explicitly replace only these two historical per-step technical approvals with the package conditions below. Approval is not inferred until received.

| Gate        | Existing evidence                                                                                                                      | Proposed delegation                                                                                                                                                                                 | Excluded / still closed                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core PORT02 | Exact19695db4/implementation64c84e0; six-path manifest; independent connected-code review PASS;4files46 fresh tests PASS               | Accept CLOSED technical port; coordinator reconciles latest main, re-runs impacted regression, seals manifest and locally integrates after independent review, without another per-SHA Owner prompt | No actual TTR consumer/runtime, formal Selection migration activation, Hosted/native unrestricted activation                                     |
| G2-FLEX03   | Approved ACCEPT WITH BOUNDED CORRECTIONS direction; TTR02 main prerequisite done; precise owning paths and native scenarios identified | Authorize only minimal reversible G2 outer-scroll lease, scoped cleanup/fencing tests, independent functional+Visual QA and eligible local integration; then ordinary Flexible consumer adapter     | No extra Composer/focus architecture/navigation redesign, business Flexible storage activation, new device/install or physical-device permission |

No product decision, new paid integration or shared-contract redesign is requested by package L1. P0/P1 review/gesture defects block acceptance; stale release/new-owner races must be tested. If approval is pending, only review/preflight and independent unblocked R0/R1 work continue.

## Gate Consolidation Proposal — package L2

**Ready to request the repaired local package; original40b98591 alone remains unsuitable:** independent review found a P1 commit-boundary bypass. `00400:78–82` compares row xmin with top-level current XID; a released SAVEPOINT child XID is different although still uncommitted. Isolated cached network-none PG TEMP TABLE reproduced TRUE predicate on an in-progress child transaction; outer rollback removes the new authority. No live incident or activated runtime is claimed.

Original Source TIMING03 scope is already implemented, so fixing this implementation defect within the approved V3 design does not reopen product design or add an Owner-only coding Gate. A separate bounded builder repaired00400/current regression suite, with original40b98591 unchanged. Fixed candidate commit2470d001eff50fda71d2dc5bfa283f36b8abdbff, tree d4e5d0fad74a8d676d3f11d8eb8ce408fa17b085, changes only2 paths in the existing22-path combined scope.45 SQL PASS; old predicate/new10 regressions all fail as expected (prior35 pass). Independent re-review PASS confirms SAVEPOINT, EXCEPTION,80 child transactions and committed recovery, plus6 cross-epoch arithmetic checks. Actual rollover/status-horizon exhaustion not physically reproduced; native unknown status remains fail-closed. Reviewer must cover SAVEPOINT/exception and all four committed boundaries, normal replay and old profiles. Never introduce clock slack or fake terminality. Historical00100/00200/00300 bytes remain unchanged.

Repair and independent PASS are complete. Request **one concrete local package** for:

1. Accept fixed V3 candidate2470d00 and its two-path fix manifest (including carried00300→00400) and authorize its current-main reconciliation/local integration under independent checks.
2. Authorize bounded CLOSED Backend/Source joined implementation consuming the accepted owning ports, complete ACK→committed READ permit→new ACK-linked GET, durable staging/restart/UNKNOWN negative tests and later independently reviewed local integration.

This would replace repeated Owner sign-offs for those named local stages only. Backend03A acceptance currently says no additional Backend development before separate joined authorization; it remains frozen until package L2 explicitly clears that restriction. Technical preparation/port mapping is already complete. This request is only for fixed2470d00/local CLOSED joined work; the original defective predicate is not accepted.

## Separate protected packages — no release in L1/L2

- Native Flight positive acceptance, physical-device install/signing, Hosted R3-compatible forward/roles/storage/secrets/exclusive producer/deploy/rollback, or wider business runtime activation retain existing gates. Present a concrete bounded package only when local proof is ready; no generic account/credential request now.
- Actual Core-backed TTR activation/Selection allocation deployment, Apple ETA/route cache license and paid Provider remain separate. The spatial correction is a previously approved design compatibility repair; it is not a new product choice.
- New accounts/credentials, account/participant access semantics changes, private original/QR sharing expansion, financial materiality/irreversible loss and Production require express approval. Ordinary Trip-container design within existing owner/member policy uses internal risk review, not an invented Owner-only implementation checkpoint.
- Known D0 CLI setup/expiry finding and D1 creator-edge/R3 forward candidate remain separately reviewable Hosted evidence. No remediation or privilege acceptance is inferred from public health.

## Minimum Owner decisions now

**Approve package L1 (PORT02 CLOSED local integration + G2-FLEX03 bounded implementation/review/local integration), with every excluded environment/runtime/permission Gate retained?**

**Approve package L2 (fixed V3 candidate2470d00/current-main local integration + bounded CLOSED Backend/Source joined implementation/review/local integration), retaining all protected runtime/Hosted/native Gates?**

Both requests consolidate named existing approvals only. Nothing else needs a product decision now. Beta0/Beta1 dates are rolling forecasts, not a proposal to cut scope or redefine release. Photos/TTR remain on the Beta1 plan; no removal is implied by OFF fallback.

No permission is sought for DTO naming, ordinary file structure, fixture/test fixes, worktree conflict resolution, review wording, Metro debugging, ordinary layout defects or technical task order. Those are already delegated.
