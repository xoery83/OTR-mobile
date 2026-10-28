# Current implementation state — 28 October 2026

## Auth / Identity Phase1 — Email and Google L3; Apple Owner-paused

Use existing Supabase Auth, secure Account Session storage, generation/apply gate,
Account switch coordinator and normal Sync. No second identity/session authority,
Schema/RLS/GRANT change, business Gate expansion, Secret logging or device Session/
Keychain copying. Auth worktree has normal own-root read/write permission.

Google native nonce repair and consumer generation fences are integrated on
main76d05522; signed-out repository guard/local Mailpit acceptance on main0a6e7a9a.
Real native46 Google ID-token exchange200, independent Account/Session readback,
cold restore, native49 immediate A↔B four-vs-zero Trip isolation, normal current
Session logout/server absence and A restoration pass. Keep caller nonce validation
enabled. Exact history and build identities: ops/auth-phase1-20261028/GOOGLE_DEV_E2E.json
and GOOGLE_NONCE_REPAIR.md. Failed43 nonce exchange is historical, never login PASS.

Owner verified Resend auth.xoery.art/DNS and authorized DEV SMTP. Saved
smtp.resend.com:465/resend, OTR <noreply@auth.xoery.art>, retaining the existing
Supabase encrypted password without reading its value. Both signup and login
email templates use Token without ConfirmationURL. Owner received real eight-digit
OTP and entered it normally in native49. New canonical Account/email confirmation/
Session has independent database evidence; terminate/launch retains this Account
with no private QA Trips. Immediate resend429, wrong-code403, subsequent normal
request/verification and distinct Account Session/cache selection pass.

Actual expiry is separate from the wrong-code error name: independently confirmed
stricter60-second policy, new native OTP08:50:46Z, delivered08:50:50Z, Owner input
rejected403 at08:52:39Z (113 seconds). Final policy independently restored3600
seconds/eight digits; JWT TTL unchanged. Normal current Session logout leaves no
server Session; original QA A/four Trips restored. Exact finite L3 evidence and
all limitations: ops/auth-phase1-20261028/EMAIL_OTP_HOSTED_DEV_E2E.json. Local real
Mailpit proof (not Hosted/Native) remains separately recorded; its isolated test
stack is stopped, canonical local stack unchanged.

Owner found expired-code text below the visible long Account form. Authd3d334d4
moves the existing alert before inputs and dismisses keyboard on alive failure.
19 suites191 tests/types/UIguard/scopedlint and independent3 suites11 pass.
Unified JS-only native52 source9c818005/JS2bb56d528ddc564f431a58e2f4b1fef2597641ad5daa749d0a866ec7b189dffe
passes real guaranteed-wrong rejection with alert visible above input, keyboard
closed, challenge cancelled and A/four Trips preserved. Native49 code/identity
sections remain byte-identical, strict signing verified; no new Native modules.
Email Account still has zero Sessions after that negative. Forms QA/GUI returned
to Native for P1; AD5 not operated. Import reserves build53.

Apple is explicitly paused until Owner Developer enrollment; its uncommitted SDK/
configuration candidates were withdrawn. Phase1 Email/Google evidence is complete
within the scopes above; this does not certify Apple or Guest adoption. Next
approved work: Phase2 Guest→Account. Guest marker/Guest-install guard exists;
adoptLegacyAccountState is not Guest conversion. Preserve full-dataset authoritative
preflight, no early Guest upload or partial visible ownership conversion, stable
operation identities and UNKNOWN recovery. No new quota/pricing policy is invented.
Main integration remains serial and must preserve concurrent Native/Import work
and the six unrelated dirty primary-checkout files.

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
