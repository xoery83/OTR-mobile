# Active Universal Import product completion — 2026-10-28

Owner resumed Beta delivery in stable `universal-product-20261028`; previous six minimal Golden Slices remain accepted, not continuous-user acceptance. Import owns Source/Task/Admission/Documents/Activity; Native owns shared Core/Reader/Sync/Navigation, Auth owns identity. Current Import source `1072af7d` retains Native deployed P4/Auth baseline `a78ed2ee`; main was not updated by this checkpoint.

- Owner-approved continuous packet091fb547 is INSTALLED_DEFAULT_CLOSED; six functions/OID/Owner/ACL independently verified. Save false/scopeNULL, dormant airports remain disabled. Native subsequently installed its separately approved P4 package, so read-state is now f1378cb07c1f1882651a558dbe612909; original activation expects c8d64 and must not run or overwrite Native. One-hash activation compatibility passed isolated PG and independent review; Owner explicitly approved fdd2730d (record4503cc5b). Activation still awaits normal QA read/close preflight; authority is not active.
- Actual DEV software `1072af7d`, image5e551e2c/container43c4f20a, unchanged Env SHAab5dc0e7 and six mounts/HostConfig; health and independent bundle readback PASS. Prior compatible 2cc88598/61b0 retained for exact rollback, with original NativeP4 e624 also preserved. Receipt: `ops/universal-product-20261028/authority/CONTINUOUS_SOURCE_SERIAL_DEPLOY_RECEIPT.json`. DEV deployment lease currently Import; Native holds the coordinated GUI/normal Core P4 Edit acceptance window. Auth main advanced to0a6e7a9a; Import has not updated main.
- Activity context GET no longer loads original bytes; normal Auth, Source binding and immutable Task checks remain. Results retain original checks. Red→green fixture, 49 joined directed tests, types/build and independent NO_BLOCKER PASS. AD5 retest proved BINDING/BUSY from shared single-lease Source handle. Fixed with runtime-wide bounded FIFO while retaining Source role connlimit1. Five suites17 tests plus actual isolated PG connlimit1 parallel requests7 tests, private-dependency typecheck/lint and independent review PASS. Software deployed; normal AD5 same retained Batch context/Results recovery PASS at19:14, no Analyze/model/Save. Core receipt cold GET then timed out at default15s: Import hook aligns its existing confirmation budget60s (Backend remains30s); JS-only Import47 actual cold launch at20:08 retained My Trips/QA Trip and the same P6 RESULTS_READY plus server-accepted receipt without reconfirm/Create/model. SourceSave remains CLOSED pending Native business-window release and fresh activation preflight. Read-only runtime check confirms Source connection valid and QA mirror has 7 PUBLISHED/1 PENDING/1 RUNNING records.
- Build42 full Expo native compile PASS. Original simulator application identity restored without copying Session/Keychain; My Trips and original QA Trip cold startup PASS. Temporary shared startup diagnostics removed; Native Writer returned. Personal Inbox list/detail, verified retained TEXT original and back navigation passed on AD5. Actual PDF/image QuickLook, Trip Documents, sustained Save and full lifecycle remain pending. Activity received-input captions and Inbox privacy context corrected at fee149c2; 27 directed tests PASS.
- Existing receipt-only Results recovery, sequential context inventory GET and pending-only polling are LOCAL_PASS. Documents preserves Local Durable vs unconfirmed cloud custody and exact Source pins; no all-Batch→all-Item association. Import Updates fa28eb2b now projects latest20 current Task completion/failure records through existing Auth/repo/GET and original Capture route (43 tests/types/UIguard/independent NO_BLOCKER). Formal Save/Review/unread notifications remain pending; no invented notification authority. Remaining product flows continue independently while GUI is occupied.

First normal product run: Batchbb571a30/Task0d4a0592 Source/Task Prepare and PUBLISHED result SERVER_VERIFIED, one new terminal Provider call (total9/day1; original uncertain call retained). Actual input contains IME tail R, so conservative candidate is preserved and no Save attempted; independent unselected Item count0. Scope was exactly activated then independently CLOSED with unchanged functions/OID/Owner/ACL. Documents actual original→completed Source Item link1 and Results/receipt cold read PASS. Continuous pending-marker fix7136d81a has54 tests/types/lint and independent NO_BLOCKER; installed thin Build51 preserves31 business tables, cold retest pending. No Schema/RLS/GRANT/role or budget changes. Next: diagnose/retest real context GET, qualify exact Native P4-compatible activation precondition, then normal sustained synthetic Import acceptance. Preserve all other worktrees and historical QA.

Earlier historical handoff follows unchanged; its integration-pending entries are superseded by main1c7e7fc8.

# Current implementation state — 28 October 2026

## Auth / Identity Phase1 — 28 October

Independent Auth lane starts at main1c7e7fc8. Source cfae2b18 is integrated/pushed;
remote current-Session logout/hosted error recovery6b4bc3c5 is independently reviewed.
Its exact host-only DEV receipt proves normal Synthetic password login, self-read,
repository reconstruction, concurrent refresh single-flight, wrong-Account denial,
current-Session revoke/independent absence and14 baseline Sessions preserved.
It does not prove OTP delivery or native Keychain cold start.

Google Provider enabled; Apple disabled. Source48d0c53e and reviewed remote logout
are integrated/pushed on unified main453de9c3, retaining accepted P3;18 suites153
tests/typecheck PASS. Original main six dirty entries preserved. Build43 is the
same source with own embedded Debug JS, standard simulator identity sections and
Google SDK. In-place Forms QA cold restore retains its QA identity/four Trips and
all original row hashes across148 tables, integrityOK. Real native Google control
opens system prompt; Cancel preserves Account, repeat opens official OnTheRoad
Google email page. This does not prove Google login. Owner completed Google interaction, but actual ID-token exchange was rejected
HTTP400 for missing matching caller nonce (DEV Auth18:09/18:19NZ). Original QA
Account retained. The reviewed local Expo bridge passes a fresh secure nonce digest
to official Google SDK9.2.0 and the original nonce to Supabase; server nonce checks
remain enabled. Native46 real ID-token exchange returned200 at19:20:04NZ;
independent readback verified its canonical Google Account/Session. Cold restart
restored that Account with an empty Trip list, excluding A's four Trips.
Immediate menu/list activation exposed a consumer race; Auth258f50de includes the
reviewed generation guards and read-only committed Session port (no Guest creation).
18 suites187 tests/types/UIguard pass; independent5 suites76 plus real public-port
gate/fresh/legacy checks pass. Native49 immediate A↔B switching passes: correct
menu and four-vs-zero Trip lists without restart. Normal B logout is independently
verified by an empty server Session list; A is restored through remembered-account
UI with four Trips retained. SQLite integrityOK;147/149 tables retain original row
hashes, with local_trip_containers/sync_operations changes, so no full unchanged-DB
claim. See `ops/auth-phase1-20261028/GOOGLE_DEV_E2E.json` and
`ops/auth-phase1-20261028/GOOGLE_NONCE_REPAIR.md`. Historical failed43 receipt: `ops/auth-phase1-20261028/GOOGLE_NATIVE_BUILD43.json`;
Google ADR: `adr/2026-10-28-google-native-id-token.md`. No Secret, business/schema/
RLS/GRANT, SQLite74 or other QA Session changed; AD5 not operated.

Google nonce/consumer slice is integrated/pushed on main76d05522, remote verified,
with original six dirty files and tracked diff byte-preserved; no P4 parent commits.
Signed-out My Trips repair e3bdeef4 skips account repositories, clears stale lists
and keeps direct Trip routes unavailable;18 suites189 tests/types/UIguard and
independent4 suites71 pass. Native runtime follow-up remains pending; Forms QA
is returned to Native and Auth does not install over its active Form tests.

Owner paused Apple until further notice because the Developer account is not open;
uncommitted Apple dependency/config candidates were withdrawn. Email OTP has real
isolated Local Supabase/Mailpit PASS: new signup, wrong/used-code denial,
existing-user canonical Account stability, self-read, in-memory Repository restore,
distinct Account Session selection, refresh, scoped logout and other Session
preservation. Exact finite runner/hash/run receipt: EMAIL_OTP_MAILPIT_E2E.json in
ops/auth-phase1-20261028. This does not prove Hosted delivery or Native OTP restore.
Hosted DEV custom SMTP is off and its current email is a Magic Link. Dashboard
allows customization through Pro/custom SMTP/Send Email Hook; no paid upgrade or
team-membership workaround. Free Resend SMTP/subdomain/template proposal is
EMAIL_SMTP_CANDIDATE.json, not applied. Owner approves external service/account/DNS
and saves Secrets directly in secure configuration. No email sent to a real inbox.
Next: await that precise SMTP setup while continuing independent Session/Guest
work. Phase1 CLOUD_PENDING. Guest bootstrap/adoption remains a separate owning delta; ordinary
Auth cannot silently claim Guest datasets or Trip People.

## Active checkpoint: Manual Cloud P3 first, then P4/P2/P5/P6

Owner28 October follow-up authorizes normal Push of unified main and sequential Manual P3→P4→P2→P5→P6 Cloud E2E. main1c7e7fc8 safely pushed and remote SHA verified; no deployment. Implement exact normal Core capability candidates first; new protected SQL/RLS/GRANT/business authority still needs precise authorization. Enrichment/paid DeepSeek/Import Admission/Production remain closed. Historical Native and Universal handoffs remain fixed at e18b8e05 and817583e0; see `ops/native-universal-integration-20261028/README.md` and adjacent baseline/conflict receipts.

Input main817583e0 contains the independently accepted Universal P1–P6 limited formal Import Save slices. Nativee18b8e05 contains P1–P6 local Forms, Browse/Focus/Immersive, Day Shell/Home/navigation/retention, Calendar/place/keyboard/Expense-prefill and related tests. The independent Host0f222171 is retained on codex/flight-enrichment-host; it has no real paid-query E2E. All original branches, six unrelated primary-checkout dirty entries and private QA data are preserved.

Integration uses `codex/native-universal-integration-20261028` in the dedicated native-universal-integration worktree. Native snapshot lineage is explicitly bridged, not rewritten. Main Source/Admission/Actor/Receipt/normal Sync owning semantics are retained; Native atomic local Manual batch/Reader and Shell/UI are additive. Sparse accepted Home Items use lawful Details without fake zones. Independent Review found the real unknown-zone Today empty-string issue; it is repaired to explicit FLOATING. Production SQLite registry/runner remain identical to main, schema74; no migration or new database rights.

## Existing local Native capabilities

- P1 plan, P2 single Flight, P3 Stay, P4 Rental, P5 supported Transport modes and P6 Activity Create/Edit/Save/Cancel/read/recovery are retained through existing repositories. Local-only remains local-only.
- Day range capsule, Today/Tomorrow headers/backgrounds, four per-Trip Header styles, structured-place destination resolver, mixed civil ordering, sparse batch loading/tail/top handling, native Back/Edit, retained Home/Day slots and semantic loading skeletons are retained.
- P1 Focus plus uses approved insertion-time advice and existing quick-add/Form. P1 move and same-day P3 clock move remain subject to their existing legal writer/qualification constraints; P2 never moves. Complete physical gesture matrix remains pending.
- P3 software keyboard was Owner-accepted. P4 representative native/locale/theme checks and P5/P6 local vertical simulator checks exist; no full visual matrix claim. P6 normal Edit→Home immediate name refresh and cold restoration were observed in R39.
- Shared four-action Immersive footer hides empty modules. Add Expense uses existing Ledger with Trip/date/name defaults; unsupported photo/attachment/link actions stay disabled. A live Modal theme hot-switch limitation remains.

## Current validation and device state

Joined directed checks:55 suites917 assertions PASS; TypeScript/UIguard/scoped lint/default-CLOSED Backend build PASS. Independent protected review109PASS and Core review were completed; its Floating Today finding is fixed and covered by directed tests. Repaired stale Schema62/mock/UI-test expectations retain real data/identity/foreign-key/cold-recovery assertions through existing schema74. Forms QA real local P1–P6 Create/Edit/Cancel and Details readback passed on the integrated build; cold startup retains the session and all three Trips. Smoke found valid P6 commands blocking local P2 identity coverage: minimal Manual-only whitelist repair c6886504 plus 35 directed checks and independent15/15 review PASS. AD5 in-place update/cold startup retains its account, 22 local Trips,88 accepted Core Items and all original row hashes; real Reader shows six accepted families. Existing Batch history and recovered Source suggestions read without Analyze/paid calls. Final delivery build40, schema74, DEV API; exact source/JS identities are pinned in the private build-identity receipt.

Forms QA C0C23E00-5016-4289-B806-92C5484BD5BA and AD5 AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A retain their own app/account/data. Pre-update integrityOK/schema74 for both; AD5 has88 accepted Core Items, Forms has local journal-backed items. Separate local rollback artifacts retained, no Keychain/session copying or reset. Physical phone read-only signing check found the existing independent formsqa bundle/Team/profile; it is currently unreachable. Owner explicitly deferred it on28 October (先完成模拟器). No phone install/uninstall or data change; no physical PASS. One heavy build at a time, no new simulator or shared Metro.

## DEV and independent uncompleted business

Latest DEV baseline is P3 sourceeb77fc08/image248ddc05/container6ab4b657, cloned from the exact restored P6 configuration. Env345601e9, original six mounts/HC, health200/unauthenticated401 and bundle645a162e are verified; original healthy container49a111 is retained for rollback. No Provider/Import gate expansion. All six client Admission flags are explicitly false; Enrichment Host is not enabled. Existing default-closed read paths and current account-fenced normal sync cutoff are preserved, historical QA queues never flushed.

Forms QA CreateTrip has real Server Accepted/independent readback. Existing Manual P1 capability is separate from this integration smoke. Manual P3 actual Native Create/Edit, SERVER_ACCEPTED, independent SERVER_VERIFIED and cold recovery passed on a new normal Synthetic Trip; full Cloud L3 still lacks Native offline/reconnect and live cross-account negative. P2/P4/P5/P6 ports remain pending unique Writer work. Import P1–P6 PASS never supplies Manual permission.

Enrichment latest finite window2210 configured/read back successfully but normal capability stayedfalse. No paid lookup occurred. Business/runtime/admin/token were all safely closed/restored/removed. Host0f222171 adds safe diagnostic stages,38tests/typesPASS, not deployed here. Public cache remains MISS/no-write. Next Enrichment activation requires a separately authorized coordinated fresh window and must not restore obsolete service images.

Other remaining scope: sustained Import authority, qualified Journey/Booking/Ticket, unsupported Transport subtypes, advanced Activity/Contact/Instructions/Documents/Media/Item-expense association, full visual/gesture matrix, Auth/Invite/Updates/Flexible/TTR/NOW. Participants-only visibility is only a discussion, not implemented. Do not expand this integration into those features.

Manual P3 follow-through: normal Sync wake/activity and Accepted same-Creator provenance now prepared; typed street address retains legacy label. Eight directed suites103PASS, types/default-CLOSED buildPASS and owned isolated PostgreSQL Create/Edit/receipt/replay/read/NULL-negatives/exact rollback/ACL PASS. Owner approved and installed the exact four-function sustained QA-only SQL. Actual P3 Create/text/schedule/place/participation produced five APPLIED receipts and one Item at revision5; Native cold recovery and retry/replay passed. See ops/manual-cloud-e2e-20261028/P3_DEV_RECEIPT.json for precise remaining L3 negatives and deployment recovery. Next P4; other families remain unenabled. Auth independently advanced main to cfae2b18 after the original1c7e7 Push; do not overwrite it.

P4 candidate now extends existing normal queue/wake/activity and same-Creator Accepted Edit, exact P1/P3/P4 capability profile and Rental command fence.6suites84PASS/types/lint/build/owned network-none PG PASS. Independent SQL Review repaired Rental child event_id/role reparenting; real raw-writer negatives and rollback/OID/ACL passed. Four-function SQL is NOT_INSTALLED, requires precise approval in ops/manual-cloud-e2e-20261028/P4_AUTHORITY_REVIEW.md. Universal independently deployed current Import host imagee482e6ed retaining P3 source/config and installed read-state c8d64; P4 must use that actual source/postimage, not old Compose/SQL. P3 full L3 negative gaps remain explicit.
