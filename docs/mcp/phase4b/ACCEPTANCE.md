# Phase4B local acceptance — 1 November 2026

## Actual blank-context model exercise

Three Codex subagents were started with no inherited conversation. Each received only
an ordinary travel request, the synthetic materials and a CLI for the local MCP
connection; repository/docs/history access was excluded. They discovered the guide
through actual SDK Initialize/Discovery/tool calls. No expected tool sequence was
supplied. No additional paid provider/platform was configured.

The harness uses the official SDK Client/Streamable HTTP transport with in-process
fetch into the real MCP handler. Authorized synthetic Core reads are local; no TCP,
OAuth, cloud, financial write or real Nelson data is involved. Reproduction entry:
`node --import tsx mcp/freshChatQa.ts tools /private/tmp/otr-mcp-phase4b-check`.
It is a test CLI, not a consumer OAuth connection or an attachment parser.

- Run1 correctly discovered guide, resisted attachment instructions and reported
  unreadable existing data honestly. It exposed a harness collection-binding bug;
  this run is NOT successful object-read acceptance. The missing binding was fixed.
- Run2 read actual Trip, existing P3 and the full legal edit base, used actual
  revision1 instead of attachment-claimed revision3, retained notes, separated two
  flights and businesses sharing a reference, flagged conflicts/people/money, and
  performed no write/invite. It exposed real usability problems: pending checkout
  displaced confirmed checkout; optional vehicle unknown blocked rental; flight
  route paths were unsupported; enum casing required error-based correction.
- Fixed these roots, added explicit field/submission paths, preserved confirmed
  dates beside pending alternatives, and replayed the actual submitted request in
  `reconcile.test.ts`. Guide2 then entered the bounded third formal model exercise below.

Compressed complete synthetic tool transcripts and their original-byte hashes are
in `model-evidence.json`. These record actual model-selected calls/results, not a
scripted expected conversation. Agent prose alone is not a saved-object receipt.

## Complex-case matrix

| Case                                                                  | Local evidence / result                                                                         | Remaining limit                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Confirmation + voucher + confirmed amendment                          | Same target; source/locator/claim chain retained                                                | Client claims are not admitted Source evidence        |
| Unaccepted amendment                                                  | PENDING_CHANGE; accepted checkout preserved                                                     | User must resolve pending change                      |
| Same reference, different supplier/family; two flights                | Distinct candidates; sparse flights + explicit follow-up details                                | Qualified flight enrichment unchanged                 |
| True duplicate vs different dates; multiple candidates on one Item    | Identity question / no silent duplicate; distinct dates permit separate create                  | Similar names never prove identity                    |
| Hut/hike P1/P6 ambiguity, unreadable/unrelated source                 | NEEDS_INPUT or inventory-only; no forced Item                                                   | Actual attachment extraction is client responsibility |
| Seven travelers / order / Chinese / nickname / same name / correction | Explicit MATCH_EXISTING / CREATE_UNLINKED / UNRESOLVED; corrected choice versioned              | Private AKA and Account linking unavailable           |
| Total/deposit/balance/quote/refund/multiple currencies                | No double consumption, paid inference or automatic conversion                                   | Refund/payment ambiguity needs focused user input     |
| Existing Expense / many Items / incomplete link visibility            | Matching needs choice; linkage BLOCKED; never infer missing links                               | Owning association port absent                        |
| P1–P6 minimal edits and Source facts                                  | Real Core commands/receipts; exact field-state preservation or fail closed                      | Lossy owning SET paths remain blocked                 |
| Item/Traveler/Expense/link dependencies, partial/CONFLICT/UNKNOWN     | Reporting preserves identities and accepted prefix; dependent suffix waits                      | No cross-domain atomic Apply or generic dispatcher    |
| Changed confirmed plan / same ID replay                               | Reject altered immutable intent; fresh confirmation/current base required                       | UNKNOWN resolved first                                |
| Process termination after actual local commit                         | SQLite WAL/FULL + separate processes recover original persisted intent/receipt; 1 POST/1 Item   | Test storage fixture, not a new product journal       |
| Metadata / Traveler response loss                                     | Existing HTTP boundaries + original receipt recovery; no extra POST                             | Real host binding not activated                       |
| Expense create/edit/recovery                                          | Owning typed DTOs/response validation; trusted recovery required                                | No pure owning HTTP operation reader connected        |
| Scope/default-off/expiry/prompt injection                             | Actual SDK schemas; unauthorized tools absent; post-expiry result UNKNOWN without business data | Auth consumer windows untouched                       |

Independent review reproduced same-command Expense receipt with different original
intent being reported APPLIED. Fixed by requiring the trusted recovery port to
return the persisted original actor/client/resource/Trip/command/digest binding,
then compare to the frozen current binding. Same-ID altered intent and foreign
actor receipt regressions return UNKNOWN without another POST. No new Ledger
receipt fields or model confirmation flags were invented.

Review also reproduced minute-clock formatting as a false UPDATE and domain
business permission strings leaking into OAuth provider discovery scopes. Minute
comparison now normalizes only explicit minute precision (not exact/instant),
including both P2 endpoints. Registry separately uses signed business grants for
authority and the server's approved provider scope policy for discovery/challenges;
read-only provider policy omits domain writes even with business claims. Actual
SDK regressions cover these distinctions without changing provider configuration.

Final test/review receipt is recorded in REVIEW_RECEIPT.md. ChatGPT/Claude fresh-chat
Phase4B, DEV save, real Ledger, expanded iOS and real Nelson acceptance: NOT_TESTED.

## Final Guide2 qualification and freeze

Run3 started from `32aa279a`, with `fork_turns:none` and the same fixed synthetic
material contents. Exact task, current input/harness/Guide source hashes and
restrictions are in `model-v3-input.json`; complete model-selected tool requests
and responses are in `blank-model-v3.jsonl.gz` with original-byte SHA256 in
`model-evidence.json`. The original run2 attachment byte hash was not captured;
run3 used the frozen baseline fixture without adding materials. The agent response
is retained in `model-v3-response.md` (Markdown presentation formatted only).

Guide2 actual-model understanding: **PASS for this bounded synthetic read-only
preview task**. It is one formal third run, with no author hints, no additional
model repair/retest run, and no code/guide change after it. This is evidence from
one model execution, not a claim all models always follow the guide.

| Requirement               | Actual run3 evidence                                                                                                                                                                           | Result / bound                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery and read        | Initialize/tool discovery; independently calls guide OPERATING/FIELDS/CAPABILITIES, list_trips, get_trip, list_trip_items, get_trip_item, get_trip_item_edit_base and review_travel_materials  | SDK PASS; actual Item revision1 over attachment revision3; full base read                                                                                  |
| Confirmed vs pending date | Both reviews preserve confirmed checkout Dec12, mark Dec13 PENDING_CHANGE, proposed fields keep Dec12 and contain no checkout UPDATE                                                           | Prior destructive date problem absent; accepted check-in amendment Dec11 remains distinct                                                                  |
| Two flights / legal paths | First review already accepts two P2 candidates QA101/QA202 and explicit origin/destination date/time paths; separate sparse Creates and fresh-read detail follow-ups; no Enum/path tool errors | Local civil clocks preserved; zones/airport codes stay null, no Source Instant or guessed qualification                                                    |
| Optional fields           | Rental CREATE/schema-valid despite unknown actual vehicle; hike/gallery remain independent valid candidates; water taxi waits only for conflicting departure                                   | No missing-optional-field blockage or forced clear                                                                                                         |
| Duplicate identity        | Hotel documents match actual existing Item; car with same reference remains separate; no merge of flights                                                                                      | Evidence-led preview, not a new booking/identity authority                                                                                                 |
| Names and money           | Same-name Alex ambiguity, Lin spelling question, new Person question; no AKA/Account/Invite creation. Total/deposit/balance/quotes/refund separated, no duplicate Expense or paid assertion    | Actual roster/Expense tools unavailable; no fictional backend verification or payment/link success                                                         |
| Safety and capabilities   | All actual calls are discovered read/review tools; writes0; embedded invitation/payment instructions not followed; unavailable save/People/Ledger/Source capabilities disclosed                | No new observed security/data-preservation error; confirmation/CAS/receipt refusal still qualified by existing local tests, not by a real save in this run |

Run3 made20 recorded CLI operations, including two material reviews and zero MCP
isError responses. It did encounter one semantic validation warning: hotel address
was first supplied without its required place label. The model read that warning,
added the source-supported hotel name and reviewed again without author guidance.
This was a correct schema guard and a nonblocking model planning inconvenience,
not an adapter/data-loss defect. No new high-permission tool, automatic field fill
or clear was introduced. This remains a bounded usability limitation.

The final response tentatively considers a future Expense link. Its observed empty
Item link list is not qualified absence proof; the final plan must still use the
formal complete relationship reader/permission and separate confirmation before
linking. No link request was issued, and no completion was claimed. This caution
is retained for the next consumer acceptance, not reported as real link PASS.

Original final request is replayed in `mcp/guideQualification.test.ts`; it pins the
accepted checkout, independent flight paths, optional rental behavior, current
revision, unavailable-domain reporting and no write. This deterministic regression
is not a substitute for the actual model exercise recorded above.

Qualification layers: Local SDK/Discovery PASS; Guide2 bounded blank-model
understanding PASS; local Core/Receipt/Recovery existing evidence plus final
regression PASS; ChatGPT/Claude OAuth + Hosted DEV/iOS **NOT_TESTED**.
Final freeze status and independent final-diff review are in `FREEZE_RECEIPT.md`.
Next stages are preparation only: `INTEGRATION_SEQUENCE.md`.
