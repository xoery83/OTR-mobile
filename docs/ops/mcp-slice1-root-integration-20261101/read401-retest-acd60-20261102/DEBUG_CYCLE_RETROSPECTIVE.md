# MCP Consumer Edit — bounded debug retrospective, 2 November 2026

**Result: Item / Edit Base / Preview PASS; Apply NOT_SUBMITTED. Root Backend CLOSED_SERVER_VERIFIED.** Auth issuer and own Session cleanup receipts independently checked; final console/ACL readback pending. No APPLIED or post-write readback is claimed.

| Actual stage | UTC | Result |
|---|---|---|
| Previous 7cb5 Core read | Nov 1 22:50:41 | Core returned 200; Auth POSTCHECK EXPIRED; outer HTTP200 tool AUTH_REQUIRED |
| SDK fix 2ff76bc0 | Nov 1 23:22:30 commit | Only five read tools map AuthRequired to HTTP401 with existing challenge; writes/batches/TTL unchanged |
| New default software release | Nov 1 23:41:55→23:42:02 | Short CAS released; independent default verification 23:44:03 |
| acd60 close binding self-check | Nov 2 00:01:03 | Same-ID no-change restore PASS, no clock/keys started |
| EMPTY activation | 00:17:56→00:18:03 | Short lock released; independent verification 00:18:41 |
| Actual Edit Base | 00:29:35.365 | 200, request51b8611b-34a9-4abc-9469-53eee5320404, 15275ms |
| Actual Notes Preview | 00:30:51.612 | 200, requestb1d5e6ef-6cd4-48ca-9aeb-e16052f5e936, 25110ms |
| Exact Notes human confirmation | Not received before close | confirmations always empty; no CONFIRM_INTENT/RESULT; original1d6 NOT_SUBMITTED |
| Root normal close | 00:40:27.467→00:40:33.344 | Short lock released; independent verification 00:40:33.493724 |

NZDT is UTC+13. Original D00:42:16 and normal-close target00:40:16 were never extended. Historical f107/9b UNKNOWN remain unchanged.

**Root cause and observability.** The previous Core read succeeded, but expiry at Auth postcheck produced HTTP200/tool AUTH_REQUIRED, hiding the SDK refresh signal. The minimal SDK change fixes that error mapping. Existing requestId plus ReadStage diagnosticId identify Handler → Auth precheck → Core owning read → Auth postcheck → response. They are different IDs; correlate by bounded timing/stage, not invented equality. Current captured logs show a401 at00:30:25 followed by successful Preview, but do not prove exact refresh count. No Token, Secret, or user-private body is logged. Reuse bounded existing logs; no observability platform is needed.

**Safety-required steps.** Finite issuer/consent QA access requires valid authority; actual Notes Preview requires a separate human decision for exactly original operation1d6/CAS1/digest1d5. This confirmation wait is a real business-intent requirement, not a repeated Read Gate. Protected mutation needs exact CAS, default rollback, automatic expiry and independent closure. UNKNOWN queries retain the original identity and never replay POST.

**Avoidable overhead.** Within valid normal Account/Trip authority, ordinary Read, Preview and receipt recovery need no new per-request Owner Gate. Software-only fixes require focused checks plus one short deployment CAS, not another full OAuth/Core audit. Reuse the version/hash/close-pointer/timer/default self-check already scripted. Release the deployment lock immediately after smoke/receipt; it did not need to span the business session. Completed subagents require followup wake, not repeated passive messages.

**Remaining true privilege.** The current temporary issuer/consent QA configuration and exact Notes confirmation allowlist still require protected control. Do not make that temporary access permanent. A normal durable QA Session can avoid activation only where existing owning authority already permits it; it cannot replace missing issuer/consent or business intent. Native ordinary QA measured GET=0 because the same-account helper active.lock was still held; that is a Session resource conflict, not a global DEV lock. Preserve the owning session/lock until its normal cleanup.

**Closure.** Root independently confirmed defaultddd7/configdb86/image57, both QA keys absent, Host/all23 files exact, health200/protected401, timer inactive. Bounded pre-close diagnostics retained. No new SQL, Provider or business write occurred during this continuation. Auth issuer and own Session cleanup receipts independently checked; final console/ACL readback remains pending.

**Next same-class fault.** Actual request → existing stage logs → minimal fix → focused check → short version CAS → immediate legal read retry. Do not rebuild packages whose hashes did not change or repeat stable security reviews. Exact waiting savings are UNKNOWN; no percentage is claimed.

Evidence: 7cb5 FINAL_CLOSE_READBACK; combined DEPLOY_RESULT/INDEPENDENT_READBACK; acd60 ACTUAL_NO_CHANGE_RESTORE/EMPTY_ROUND_RESULT/EMPTY_INDEPENDENT_READBACK/FINAL_CLOSE_READBACK; actual Consumer preview raw response. Scope deliberately excludes broad OAuth/Core re-audit, new DEV infrastructure and Provider expansion.

Auth closure addendum: Root directly read issuer DENY_ALL at00:40:31.224564Z and NORMAL_CONTROL_SESSION_CLEANUP_PASS at00:41:54.355Z, own refresh revoked negative PASS; original receipt hashes and safe fields in AUTH_CLOSE_METADATA.json. Auth reports Grant DELETE204/readback absent and normalQA lock released; final console reload/ACL readback is still pending and is not claimed PASS.
