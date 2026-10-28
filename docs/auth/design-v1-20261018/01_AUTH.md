# OTR-AUTH-01 — Final Product Delta V1.0
2026-10-18 | Owner-approved design; Coordinator technical audit required, not coding authorization.

## First launch and login
First-ever use is Guest-first, no login wall. Guest Offline creates local Trips, Ledger, Items, Capture; Guest Online has secure temporary cloud principal for AI quota (not cloud Trip backup). Device identifier is not sufficient authentication. Previously signed-out users do not get a new Guest workspace. Authenticated offline sessions remain usable.

Beta sign-in: Apple, Google, passwordless Email OTP; one combined Sign up/In sheet, cancellable by X/swipe until protected adoption. Provider registry must allow later region-aware WeChat/LINE/Kakao/etc; region determines suggestions not account identity. Canonical Account ID is independent of provider. Global Menu login returns to originating screen/scroll, not necessarily My Trips; gated actions preserve drafts and intent.

## Identity/entitlement gates
All future paywall-triggering actions require verified account identity and entitlement before restricted mutation (illustrative: second Trip, seventh traveler, AI/storage). Actual tiers/prices remain undecided. Payment UI success is not sufficient; recheck server authority. Cancel keeps draft.

## Guest→Account adoption hard gate
After provisional verification, inventory **all** local Guest Trips, Items, Ledger, Documents, Capture batches/candidates/reviews, receipts/files, queues and profile. Server-authoritative whole-dataset entitlement preflight **before any Guest upload or ownership conversion**. Insufficient: upgrade/recheck OR cancel sign-in and remain Guest. Unavailable: no upload. Existing target Account requires explicit confirmation; new Account can auto-proceed. No partial selection, early remote Trip shell, partial visible migration or same-name Trip merge. Every Guest Trip becomes distinct new Trip with stable internal references. Transfer can be resumable private staging but publish all-or-nothing after full verification and quota revalidation/reservation. Preserve Guest originals until verified. App kill/network loss resumes; timeout requires authoritative commit-status check. No indefinite loading, duplicate uploads, or two editable workspaces. Earlier Capture early-shell-first design is superseded for Guest adoption.

## Profile, AKA, provider linking
Global Account & Profile: optional Display Name; travel-document name Family/Given or unsplit alternative; original Unicode preserved; AKA with provenance, dedup, deletion/suppression and correction. Guest can edit local profile. Authorized Account–Participant Connect automatically learns that Participant's confirmed names/AKA across Trips; unconnected names/AI transliteration do not. Confirmed unambiguous AKA can auto-match ordinary Capture passengers, never confer membership rights. Self Participant defaults to You in Create Trip with name confirmation and opt-out. Provider linking verifies old account and new credential; same email not proof. Remember last provider as hint after logout; if Apple previously used and Google chosen, offer verified linking or separate account. If Google already bound elsewhere, no auto merge; allow return to Apple. Recovery via verified providers or support.

## Session/logout/app lock
Long-lived login with silent token refresh; offline continuity. Production removes QA fast account switcher. Ordinary voluntary logout unavailable offline. Online logout with unsynced data warns and isolates retained local account data. Adoption has protected recovery. Optional Face ID/Touch ID App Lock belongs Settings → Privacy & Security post-Beta; do not show inert switch.

## Release gates
Crash/restart transfer at 10/50/99%; quota race, response timeout after commit, wrong account, duplicate names, attachment failure, provider collision, Guest cancel, account isolation. No schema/provider/atomicity claims without technical verification.
