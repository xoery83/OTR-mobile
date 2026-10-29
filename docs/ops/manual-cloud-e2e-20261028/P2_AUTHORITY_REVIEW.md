# P2 Manual DEV authority — exact review candidate

Status: NOT APPROVED / NOT INSTALLED. Previous P5/P6 approval excludes this new P2 port. Ordinary code and isolated tests are complete; this is the single protected approval packet, including Source compatibility.

## Exact scope

Only existing DEV Forms QA account `3f7e964e-79d3-4028-a585-470e798e41ec`, normal owned V2 Trips created after `2026-10-28T02:16:48Z`, same Creator. Add `CREATE_SPARSE_FLIGHT`, `SET_AUTHORED_FLIGHT_DETAILS` and existing participation Edit under the cumulative Manual capability profile. Preserve authored flight number/date/airports/names/terminals/local clocks/IANA zones without claiming Qualified proof or fabricating UTC instants. Existing local journals do not automatically become Cloud items. Qualified Flight, Segment/Journey, Booking/PNR, Ticket and Source proof rights remain unchanged.

Replace exactly five existing functions: sustained scope, sustained capabilities, write guard, finite read-state guard, aggregate validator. Strict eleven-function definition/OID/owner/ACL CAS; zero new table, role, RLS, GRANT or CHECK. Sparse Create is INSERT-only, and initial child/receipt rows require the same transaction's newly created revision1 root. Accepted Edit needs retained genuine Manual Create provenance. The existing one-command-per-transaction PgPort is unchanged.

## Fixed artifacts

- `p2-authority-candidate/install.full.sql`: SHA256 `b19a0257471cad173533c1c6b2f81cfa3fe38cbccbfb252d77496469540bb733`.
- Exact rollback: `03e65a9e640322784f0364a3404a733af8aa4aa834e88639a4e42fbdc1f3821c`; restores old functions, preserves accepted Item data, closes future P2 writes. Any postimage drift aborts.
- Source-owned activation compatibility: `CONTINUOUS_POLICY_ACTIVATE_NATIVE_P2_CANDIDATE.sql`, SHA256 `fa8df1999e40e211ea5e9eb4627bb546345aba84e0a8877c4d7b9e2dc6527c61`. Only read-state witness `20c7bc156f4d80aac889b7ed8f52ce0a` → `ef17d1618d87006e8379164244a7645f`; original Source actor/Trip/expiry/commands/budget/close unchanged. This grants no new Source scope. Keep Source CLOSED during maintenance; any later activation belongs to Source Writer and its existing authorization.
- Software: Core `b3685197`, Backend `79c998b5`, Native `60471a40`, old-client capability negotiation `e34aa9e0`. Formal flag absent/default false until this scope is approved. Existing phone60 parser is protected by capability negotiation.

## Evidence and deployment boundary

Owned network-none PostgreSQL: normal Create, authored Details/Edit, participation including selected initial children, full Reader, receipt-first replay, existing-object refusal and exact eleven-function rollback with Item facts retained PASS. Independent Review NO_BLOCKER; artifact/identity/body/Source-path verification plus Backend 3 suites78 tests PASS. Native 291 directed tests plus independent119 and parent210 PASS. Capability compatibility36 plus independent50 PASS. Source Writer independently verified its one-literal compatibility and Source P2/P5/P6 isolated regressions (21 controls). Source commit2347e2e5 / review6478fc3a retained; not DEV execution.

Fresh DEV READ ONLY preflight on29 October matched all eleven function MD5/OID/owner/ACL pins (`PREFLIGHT_REVIEW.json`); repeat immediately before installation and abort drift. Original old package379c remains BLOCKED and must never be installed.

After approval: coordinate one Host/SQL window, preserve actual current DEV service/Env/mounts, deploy only reviewed Native Backend delta on latest accepted DEV source (do not restore obsolete image or unrelated main candidates), install exact SQL, independently read all postimages/rights, then enable only the existing QA-scoped Native formal flag and execute normal Create/Edit/readback/cold E2E. No temporary administrator, Provider query, shared public cache, Production or data reset. No Cloud/L3 PASS claimed before those actual steps.
