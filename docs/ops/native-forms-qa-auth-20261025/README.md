# Forms QA normal authentication and P3 local acceptance — 25 October 2026

Status: **NORMAL_AUTH_PASS / NORMAL_NATIVE_LOCAL_PASS / CLOUD_PENDING**. No Owner manual action remains for login. P3 full Product Delta still depends on the owning Contact/Instructions ports and other gaps in the [P3 candidate](../native-forms-p3-20261025/README.md).

## Durable dedicated identity and resources

- DEV project `tuqigdxrvrerfewsxqgm`; account `3f7e964e-79d3-4028-a585-470e798e41ec`, `otr.forms.qa.20261025@example.invalid`, display name `OTR Forms QA`.
- Dedicated simulator `C0C23E00-5016-4289-B806-92C5484BD5BA`, iPhone18Pro/iOS27.0; own Metro8096 and worktree `codex/native-forms-p3-delivery`. Keep this identity/device for P3–P6. No AD5 request/container/Keychain/SQLite/Session copy.
- Long-term operator credential is in this worktree’s ignored `.env.forms-qa-credentials.json`, mode0600. Never commit, print or attach it. [Custody check](PRIVATE_CUSTODY_CHECK.json) contains no credential. This worktree and private file must be preserved; do not archive/remove them without deliberate custody transfer.

## Actual authentication

Existing A/B identity records were checked without other-device credential access. Their earlier temporary password artifact is absent; neither account was reset. Owner explicitly authorized dedicated DEV QA provisioning. The existing management SDK and provision diagnostics were reused: exact email absence preflight, fixed DEV origin/body, one reserved POST, no retry on unknown, no roles/app_metadata/permission writes. [Provision journal](provision-journal.json) retains HTTP200 and request ID. Its historical `NORMAL_LOGIN_PENDING` status is superseded by the later evidence below, not rewritten.

This is the same approved admin-provisioned, confirmed Synthetic QA identity flow used for A/B (`email_confirm:true`); no OTP was issued, intercepted or reported as received. It does not test public signup/email delivery. The inert [operator source](provision-forms.ts.txt) is evidence, not a runnable production/Auth module. Exact body/origin/email/extra-role/duplicate-dispatch self-check PASS; independent static review found no blocking issue.

Then the unmodified normal Account → Add/Login UI submitted email/password to the existing password Auth endpoint. Independent DEV SQL readback records `last_sign_in_at=2026-10-25T04:13:24.732967Z` for that exact identity: [server evidence](independent-after-ui-login.json). No generated token/Session was injected. OS Save Password was declined. After process termination/relaunch, normal Account shows Active account OTR Forms QA and no other remembered accounts: [screenshot](evidence/cold-active-account.png), [AX](evidence/cold-active-account.ax.txt).

## Normal authenticated P3 loop

Through normal MyTrips → Create Trip Manually, created `Forms QA P3 20261025`, Trip `034beec1-74ac-4358-b4b9-728651c03db3`. Through Add to this trip → Itinerary → Stay, entered a new accommodation, required dates25–30October2026 and synthetic Auckland location; optional clocks remain unknown. Saved once, opened Day and Details, edited the title on the same Item `5a18728b-ab6e-4020-bdd8-a0bdcee73f93`, then saved again. Native Day exposes check-in/checkout rows and honest Saved · waiting to sync status.

Terminated/relaunched only Forms QA (new PID33351), without database reset or Auth reinjection. Normal MyTrips restores its one Trip; Trip Home shows1Stay and edited title; Day/Details preserve title/date/location. [Cold Day](evidence/cold-day.png), [cold Details](evidence/cold-details.png), [cold MyTrips](evidence/cold-my-trips.png). These supersede the earlier synthetic-overlay-only restriction for this bounded normal route.

[Read-only normal SQLite evidence](LOCAL_READBACK.json) confirms exactly one local Trip for this account, exactly CREATE_ITEM then SET_ITEM_TEXT for the same P3 Item, three queue operations all owned by this account with attempt_count0. Pending intents remain BLOCKED; canonical accepted Item count0. This is local repository/Reader recovery, not Server Accepted or Cloud recovery. Earlier separate fixture database is not the normal Trip data and was not adopted. Assertions PASS. Final independent evidence/report review PASS: identity, normal cold Account, same Item and zero-attempt Cloud boundary agree; no credential payload found in reviewed archive. Review was read-only, without fresh network/device execution.

## Boundaries and next vertical slice

Only ignored local config enabled the existing DEV Auth provider. Existing empty Native QA scope (`creates:[]`, `edits:[]`, no API base) quarantines business dispatch. No backend deployment/schema/roles/grants, P3 Cloud permission or product Auth/Shell source change. Auth network success does not open P3 business Cloud. No shared DEV business write window used.

No fresh full native build, physical network-off or public OTP/signup claim. Existing26P3 UI/repository tests and source candidate remain unchanged. New checks are operator self-check, independent static review, real normal Login, read-only server identity verification, normal Native Create/Edit/Day/Details/cold restore and account/queue isolation. [Evidence hashes](EVIDENCE_SHA256.json).

Next P3 vertical slice remains the minimal owning Contact/Instructions interface candidate, with no parallel Core authority. Full P3 remains `CLOUD_PENDING / BLOCKED_BY_OWNING_INTERFACE`; no P4/P5 Writer started.
