# Sustained DEV Trip / P1 scope

Owner Resume Execution replaces finite QA as product acceptance. This candidate must not depend on fixed Trip IDs, manual dispatch or expiring QA windows. Existing exact finite infrastructure remains isolated for old receipts; it is not extended into normal authority.

Normal authenticated DEV Account policy is explicit, revocable and service-level, not a temporary capability. Each command/result/read independently checks current policy, authenticated Actor, immutable self-created V2 Trip receipt and current ownership. No global history or V1 replay. Ordinary production policy/entitlement is not inferred from DEV rollout.

Add Traveler uses an explicit new CLOUD_SHARED_AUTHORED intent from the current user action. Existing TRIP_PERSON_CREATE v1 remains Local-private. A Person is unlinked, user_id NULL and no invitation/access grant. Stable Person ID, same-Trip reference, immutable request/receipt and current authorized readback are required before P1 dependency resolves. Existing SET_PARTICIPATION contract cannot be repurposed as CREATE; the new receipt/command are an explicit owning Person delta needing SQL/ACL Gate.

No Invite/Claim/Profile/AKA matching, existing Person promotion, account-link inference or Source authority is added. SQLite74 receipt migration is isolated; Coordinator owns registry. No DEV/GUI/deployment operation is authorized or performed by candidate implementation.
