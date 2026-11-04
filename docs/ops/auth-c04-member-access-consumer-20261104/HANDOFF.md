# B-self member access loss consumer

Auth consumer uses Core public contract from main29d77, copied unchanged as a branch dependency. Integrators must reuse the existing owning file, not overwrite it.

Call createMemberAccessLossAdapter with current Account reader, existing Core Repository, and normal authenticated API options; pass a captured AccountRequestContext. Only B-self GET /v2/trips/:trip/core/access-loss is allowed. Valid matching observation invokes existing Repository.revoke with actual Core accessRevision. Generic404 returns ABSENT_UNCONFIRMED; transport/schema/scope/local transaction failures propagate. No A receipt can revoke B cache. Account/generation fences apply before IO and before cache write; repository owns transactional Account gate.

No Startup caller or runtime enablement is added. Native owns lifecycle mounting after integration. Core repository cold-disk evidence is reused; these six tests prove adapter behavior only. Hosted Member Revoke and Native cold restore remain NOT_RUN. Roll back consumer source by removing this optional adapter; do not reverse authoritative accepted member revocation.
