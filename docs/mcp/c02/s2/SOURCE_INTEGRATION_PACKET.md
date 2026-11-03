# MCP-C02 S2 — minimal Source Integration Packet

Request ID: `MCP-C02-S2-SOURCE-20261104-001`  
Business DRI: Lane B / MCP (`01a18663-48af-7b80-9fac-408bfa98e2fb`)  
Recipient / unique resource: Root1 / shared main Source integration only.

## Fixed candidate

Candidate: `98470d017e138dbed68dcb95af820555354d2559`.  
Clean base: `74f182c92b2939dac0f2d8f3dbafbcf8174d6562`, independently reverified remote main.  
Owning sparse Core source already on base: `4c8d0fd9dc4d0210f02b6bfaace5ced0f59f454a`.  
Worktree: `/private/tmp/otr-mcp-c02-s2-source-20261104`.  
Branch: `codex/mcp-c02-s2-source-20261104`.

Do not integrate the long MCP development branch wholesale. Earlier Lane B Adapter
`cc9997fc` is local evidence, not this minimal integration candidate. Canonical Core,
Auth, OAuth, public Tool catalog, Host loader/config, P4 and Phase4B remain unchanged.

## Requested delivery and acceptance

Integrate this fixed source after checking current main compatibility. Return main
SHA, exact source comparison or any conflict, and source-only acceptance. No Hosted
deployment, activation, Permission/SQL changes, business Save or consumer acceptance
is requested. MCP remains end-to-end DRI; Root2 owns any later protected Hosted step.

This adds an internal lawful full Base reader, a standalone sparse Stay mapper and
Adapter, default-false execution guards, complete expected room-set/parent readback
proofs and sixteen local cases. No public Tool registration calls this Adapter; no
existing Host sets `sparseStaySupported`. Existing legacy full-room guard is unchanged.

Authority, CAS and original Operation Receipt are reused. Missing/removed/foreign/
duplicate room rows cannot produce a false successful REMOVE proof. Omitted facts,
protected Source provenance and unrelated child rows are preserved. NO_CHANGE is
explicitly distinguished from historical audit-backed APPLIED readback.

## Evidence and limits

- `SOURCE_COMPATIBILITY.json`: seven source hashes, three suites /59PASS (16S2 included), Typecheck, scoped ESLint, Build and diff check PASS.
- `SOURCE_INTEGRATION_REVIEW.json`: final independent review and exact source hashes.
- Original broader local proof: Lane B `cc9997fc`,103affected MCP +21new owning tests, source preservation/full graph assertions and original Receipt recovery. These counts are not additional consumer results.

Local: PASS; final independent Review NO_BLOCKER. Source integration: PENDING. Hosted / Consumer /
Native: NOT_RUN for S2. No permission to publish new sparse Tool capabilities.

Return trigger: Root1 source integration ACK with main SHA; then Lane B separately
qualifies the minimal owning Host capability. S1 supported-field consumer Create/Edit
remains independent of this source integration and requires precise live authority.
