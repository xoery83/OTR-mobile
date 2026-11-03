# AUTH C04 — original ISSUE recovery-only execution

PREPARED_NOT_AUTHORIZED_NOT_ARMED. One DEV recovery session; no resubmission.

## Fixed identity and software

- Project `tuqigdxrvrerfewsxqgm`; Backend `https://api-dev.xoery.art` only.
- Account A `26876e6e-a919-457d-bc00-78d76ba08043`; Trip `fb2f0820-e429-404a-b4dd-7adcad814e45`; Person `bcd1d48e-a9f7-445a-911b-0452ff8dc55a`.
- Original ISSUE `b3299bda-8939-4e49-8377-338f8e619869`, target B `1f3d7935-1bdc-4952-8d7f-0f72077368c1`, digest `27da9414669e8ecd83c826d39438c09f2ad9049bfcfcb829c6b300975164e7d1`.
- Reviewed entry/port/runtime source `e44bed42`, review `acbe0b70`; Controller candidate `58e4dbed` must independently pass Review before activation.
- Default-closed image `sha256:039810d82ad18344afc9b4ddade1e352b340792b3ffea6f384acf28ef3725058`, CID `c213f5dd69ef1e8e4f469450a7985ff731b04ada6f514a48c91e2b4008dba682`, Config SHA `bb7ab53035c91d1a7d83953fdc22c8ef57c185baeea2493077fb984a0c0cf9ed`.
- Independent default readback SHA `a63cc8d5669b05309f8417afb68b9ee979253b8736b96bf906fa7ce7d34cb654`. Fresh CAS must still match; drift stops preparation before mutation.

## Requested execution

After normal Account A session qualification, exact Host preflight and independent Controller Review, bind one immutable T/D at actual resource readiness. D=T+900 seconds; no extension/restart. Fresh selector inviteExpiresAt=T+600 seconds exists only to satisfy the existing constructor. Qualification must complete before T+600; the 15-minute outer close bound is not permission to delay the query. RECOVERY_ONLY rejects issue/link/revoke/save and every method except exact A access and original ISSUE receipt; this selector date cannot change the actual historic invite or grant Claim permission.

Stage the same image with only the fixed QA selector and `OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE=RECOVERY_ONLY`. Arm the existing close command twice: normal T+780 seconds and hard D. Verify both active and exact frozen plan/config before start. The in-process QA expiry independently denies at D. No SQL/schema/RLS/GRANT/role changes, Provider calls, Secret scope or account scope changes. Existing receipt SELECTs and owning PG transaction/locks remain.

Use only the existing normal A login/session callback, at most one normal OTP if needed; rate limit stops. No B login, copied Session/Token/OTP or credential transfer. `qualifyRecoveryWindow` invokes the pinned Controller `qualify-recovery`, verifies returned exact QA case/image/config/plan and both timers; the old zero-receipt business preflight is forbidden.

Run repository.recover on the original command once. If it returns ISSUED, use the existing independent receipt reader to bind A/Trip/Person/op/digest/outcome/invite. Retain actual invite identity and mark usability NOT_VERIFIED. ABSENT_UNCONFIRMED, 503, scope/auth failure, wrong receipt or UNKNOWN stops; no execute, ISSUE retry, Claim, replacement ID or expiry extension. No new business Item or invite is authorized.

## Close and rollback

On completion or failure, immediately use the existing exact retained-container close; both timers remain until default restoration is independently verified. Restore the same default CID/config/environment/mounts and absent selector/mode. Revoke only this test's own normal session using the existing callback and verify refresh rejection; preserve all original UNKNOWN/receipt/invite data. Rollback never deletes business rows.

Any unconfirmed close remains an explicit failure, retains evidence and blocks further activation. Shared Backend lock covers only stage/start/restore; business recovery does not hold a global deployment lock. This is a fresh limited runtime-access request because the prior one-time A/B window is consumed; ordinary software deployment approval does not renew it.
