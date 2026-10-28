# AUTH-06 — Invitation & Claim Product Delta V1.0
2026-10-18 | Owner-approved product direction; A1 identity and membership authority protected.

## Four scenarios
A remote targeted invite to existing named Participant. B on-site Trip-wide QR scanned by group. C remote reusable Trip-wide Link/QR shared to WeChat/group chat. D known-account targeted invite from prior co-travel or future privacy-safe search, also available **inline in Create Trip Travelers**: type name → suggest prior known Account → explicit select → queue invite after successful Trip creation. Invite failure does not fail Trip.

## Channels vs identity
Universal Link, QR, email and account-targeted invitation are delivery modes; general join, claim existing Person, join-as-new and viewer grant are distinct permissions. General Link/QR share revocable expiring token; organizer can rotate/close. Expiry default and auto-confirm hours remain OPEN (7 days and 24h only suggestions). Share Sheet open ≠ sent. Public token cannot confer arbitrary Person private rights. Existing-account invite requires acceptance, not organizer pre-connect.

## Entry points
Create Trip Travelers; Trip Home Preparation invitation guidance; persistent Trip Home Members status; Trip Menu → Members from any Trip screen; Members is full management center including individual Person Invite/Connect, general Link/QR, email, known Account, resend, revoke/block. Incoming account-targeted invites prominently in **My Trips** above Trip sections, also Updates. No global contextless Invite People.

## Recipient flow
Limited Trip Preview before auth; join requires verified Account and Guest adoption if needed. Preserve intent across installation/sign-in. WeChat in-app browser must offer `Open in Safari/default browser`, copy link and short-code recovery; real-device test App Store and Universal Link behavior. General link ranks likely unconnected Person from confirmed Profile AKA: `This is me`, `Choose another`, `I'm not listed`; never auto-Connect based on name alone. Known trusted exact identity may qualify for direct claim under A1. New Person may join directly if organizer policy and entitlement allow.

## Provisional access and organizer resolution
Pending claim can receive token-authorized **shared read-only** access, not private Person ledger/docs or editing. Organizer Update displays claimant and claimed Person with four actions: **Confirm / Choose another / Create new / Reject**. Corrections reuse same claim request, no duplicate Person or Ledger merge. Reject revokes provisional access. Block Account and revoke link defend against malicious forwarding. Notify claimant of correction; require consent if changed identity/permissions materially. Low-risk unopposed claim may auto-confirm after configured review window only with server recheck of conflicts, expiry, permission, quota, no reject/block and no sensitive privilege escalation. Organizer action cancels timer. Hours not yet approved.

## Invariants
Stable Person UUID, distinct Account UUID, no name/email-based rights, no silent rebind, idempotent admission, truthful pending/sent/accepted status, backend ACL/RLS enforcement. Offline cache may show invite but cannot claim acceptance without authority.
