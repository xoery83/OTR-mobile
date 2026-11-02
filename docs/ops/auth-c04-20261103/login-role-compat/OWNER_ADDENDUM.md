# C04 existing LOGIN role compatibility — exact supplement

Status: PREPARED_NOT_AUTHORIZED. Original Owner approval is retained, not discarded.
Base Gate `3edebba4ac1a3d7178dc6cb5b240c68a76cec4dda4b58c7a87ab6b7fb4deb989`,
base candidate7734f3b0; base SQL2eec272c… was approved for installation with runtime closed.
Root correctly stopped before installation: actual DEV Core Gateway has LOGIN=true,
while base SQL required NOLOGIN. No role, schema or business write occurred.

Supplement SQL SHA256: `3bbe7fbf47ae40d18dfcb91d98d1aa8da1cf3839853320f1e4733fc61490d565`.
Target remains only Supabase DEV `tuqigdxrvrerfewsxqgm`.
New marker: `OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_LOGIN_COMPAT_V1`.

## Exactly two replacement spans

1. Require the new supplement-specific marker rather than the base marker.
2. Accept the actual existing `otr_trip_core_v2_gateway` LOGIN role only when
   superuser, bypassRLS, inheritance, createDB, createRole and replication are all false.

The original table/function/trigger/ACL/GRANT body, beginning with CREATE TABLE,
is byte-identical. No ALTER ROLE, role creation, password/credential change, extra
EXECUTE, table privilege, identity policy or business-authority expansion is added.
Root's fresh same-role readback at2026-11-02T21:17:53Z confirms these exact attributes;
LIVE_ROLE_PREIMAGE.json SHA6222968f… preserves non-secret evidence. Root must recheck
fresh flags before execution; this supplement cannot authorize changes to match them.

## Scope retained from the original approval

Same two initially empty private tables, two RLS enables with zero policies, three
functions, two triggers including mapped-only legacy Invite protection, and one
EXECUTE to the same existing Core Gateway. Only original Owner / exact registered
Account / never-linked Person path. No new role, generic member removal, private
Item grant, production operation or historical-data migration.

Only protected installation is requested. Backend and Native remain unmounted;
no QA window, OTP/Session, business operation, Profile Cloud or Provider activation.
Root remains unique protected Writer. Verify actual selected DEV project, original
expected-absence/dependencies, fresh Role/ACL preimage, fixed bytes and independent
post-install conditions; stop on drift. UNKNOWN requires read-only reconciliation,
not a replay or destructive rollback. No need to change the role serving Native.

Four new pure rendering/conformance tests and independent scoped Review pass.
Original business PG/Review receipts are reused because that body is unchanged.
This package is not installation permission until Owner explicitly approves this
supplement; the original base approval alone is insufficient.
