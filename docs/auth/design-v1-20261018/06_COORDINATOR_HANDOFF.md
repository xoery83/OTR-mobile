# Coordinator Handoff — AUTH Final + LANG-01
2026-10-18 | Product design CLOSED; technical capability UNVERIFIED.

## Package
01 AUTH; 02 Invitation; 03 Cross-module; 04 UI Blueprint; 05 LANG-01.

## Required first pass: read-only impact inventory
Audit actual installed Auth/Supabase providers and OTP, local Guest principal and account isolation, offline session, profile and AKA, A1 Membership/Invites, Create Trip inline matching, My Trips invite inbox, Updates, QR/link/deferred deep-link behavior, Capture Source/Evidence and LANG-01 Unicode. Distinguish CONTRACT / IMPLEMENTED / WIRED / NATIVE VERIFIED / GAP with exact paths and owners.

## Priority and scheduling
1. Preserve existing Capture E2E, Day Shell and Create/Edit active work; no parallel edits to same files without Coordinator ownership.
2. Identify irreversible source/evidence loss and Guest early-shell conflict as architecture gates.
3. Plan AUTH foundation (providers/Guest principal/session), account/profile and linking, invitation/claim, then adoption reliability release gate; keep provider/monetization scope proportionate.
4. Plan LANG-01A audit now, LANG-01B after Capture E2E, LANG-01C regression before Beta.
5. Require explicit Owner review for pricing thresholds, claim auto-confirm hours, provisional access limits, quota reservation/atomicity feasibility, and schema/migration changes.

## Non-negotiable QA
No Guest data cloud sync before full authoritative entitlement authorization. No partial account-visible adoption. No same-name Trip merging. No Account/Person auto-link from name. No infinite adoption spinner; kill/restart/resume and authoritative commit check. No private-data exposure from general link. WeChat/Safari/App Store flow must be tested on devices. No unverified claims of readiness.
