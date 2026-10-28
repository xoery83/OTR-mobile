# Person membership compatibility — independent bounded review

Fixed `2f4a9264fb3089d284391016d942aac2b05ddeb0`: **PASS, ready for exact SQL Owner authorization.** No remaining P0/P1/P2 finding in this delta.

The patch permits only the observed PERSON gateway redundant postgres→postgres grantor row, requiring false admin/inherit/set and an exact same role/member supabase_admin admin/non-inherit/non-set pair. Other membership predicates and CREATE/METADATA/CORE behavior remain unchanged. CREATE OR REPLACE preserves helper owner/ACL; no membership/GRANT/RLS/business data mutation. Existing Source Review branch remains unchanged.

Independent actual network-none PostgreSQL: **49 checks + 8 typed Pg/Core checks PASS**. Reproduced original Person403; exact postimage permits canonical Person creation/replay/readback. SET/INHERIT/foreign-member/foreign-grantor/missing-admin-pair negatives deny. Active installation/rollback and closed preimage drift deny. Adoption cutoff remains immutable. Rollback restores exact helper and membership rows, preserving accepted data/receipts. Generated rollback SHA matches fixed artifact exactly.

Fixed Writer archive lacks the already-reviewed Root-only `tripPersonCloudCreateHttp.ts`; initial independent run stopped there. To finish typed tests, reviewer supplied only that exact file from reviewed Root `69897aa`, hash `b10264a6a7333ab9c12dfcb99ff3a11c7b7542181deb66af7bfcb7dfd71a0fd6`. No mutable Writer file used. Raw failed and final receipts are retained separately.

## Precise additional Owner Gate

- DEV project remains `tuqigdxrvrerfewsxqgm`; install only `20261024000400_person_redundant_owner_membership.sql`, SHA256 `45e21bc8988887b90b7bacc0a110f532f0f827bedebd8d924ed2b14e4c012094`. No Backend deployment or additional SQL is required by this patch.
- Close policy and four gateway logins/sessions; verify finite Create/Metadata/Core/Person and installed Source gates remain closed. Verify helper preimage MD5 `54d94b8e00ee7228cfe2d38085475089`; stop on drift. Record before/after helper owner/ACL and complete memberships unchanged.
- Verify exact postimage MD5 `5c8c33ec3d6b9547451c64f67f769d4d`. Re-pin only this helper postimage and consequent activation/closure/watchdog artifact hashes; preserve immutable Actor/cutoff and existing operation/cost/identity limits. Never run stale activation packet.
- Resume only previously approved dedicated QA Person/P1 operations, with ordinary authenticated worker and result/readback; UNKNOWN first reconciles. No global queues, historical replay or identity promotion.
- On failure close service first; exact rollback SHA256 `2cf85e61601e12fcdc14e8bed46e319348a41ab5f863687dfd2b25772f881a8d` requires closed policy/four NOLOGIN/zero sessions and exact postimage, restores original helper without data deletion. Independently verify closure/restoration; otherwise RECONCILE_REQUIRED.

This review performs **no DEV/Hosted/Auth/Native operation** and does not itself grant execution authorization or claim Person Cloud E2E.
