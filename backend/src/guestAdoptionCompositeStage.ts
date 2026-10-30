import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import type { AuthenticatedAccount } from "./authAccountQualification";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

// Unmounted owning-stage adapter. SQL compares the complete server-issued grant
// and serializes the immutable plan; a client grant/hash alone grants no authority.
export async function stageGuestAdoptionComposite(
  connection: CorePgConnection,
  user: AuthenticatedAccount,
  owningStaging: unknown,
  preparedCheckpoint: unknown,
  signal?: AbortSignal,
) {
  const plan = await prepareGuestAdoptionCompositePlan(
    user,
    owningStaging,
    preparedCheckpoint,
  );
  const sealed = JSON.parse(plan.canonicalText) as {
    grant: {
      adoptionId: string;
      targetAccountId: string;
      sourceGuestLocalId: string;
      grantId: string;
      inventorySha256: string;
      expiresAt: string;
    };
    preparation: { sha256: string };
  };
  const grant = sealed.grant;
  let active = true,
    commitAttempted = false,
    retired = false;
  let retireLease: (() => void) | undefined;
  const retire = () => {
    if (retired || !retireLease) return;
    retired = true;
    try {
      retireLease();
    } catch {
      /* Cleanup cannot replace UNKNOWN. */
    }
  };
  const assertActive = () => {
    if (!active || signal?.aborted) throw Error("GUEST_ADOPTION_STAGE_SCOPE_RELEASED");
  };
  try {
    return await connection.withLease(async (lease) => {
      retireLease = () => lease.retire();
      assertActive();
      await lease.query("BEGIN");
      const assertUnexpired = () => {
        if (Date.parse(grant.expiresAt) <= Date.now())
          throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
      };
      try {
        assertActive();
        assertUnexpired();
        const row = (
          await lease.query(
            "SELECT otr_auth_guest_composite.seal_stage($1::uuid,$2::text,$3::text) AS plan_sha256",
            [grant.targetAccountId, plan.canonicalText, plan.sha256],
          )
        ).rows[0];
        assertActive();
        if (row?.plan_sha256 !== plan.sha256)
          throw Error("GUEST_ADOPTION_STAGE_REUSE_MISMATCH");
        assertUnexpired();
        commitAttempted = true;
        await lease.query("COMMIT");
        assertActive();
        return plan;
      } catch (error) {
        if (active) await lease.query("ROLLBACK").catch(retire);
        throw error;
      }
    });
  } catch (error) {
    active = false;
    retire();
    if (commitAttempted) throw Error("GUEST_ADOPTION_STAGE_OUTCOME_UNKNOWN");
    throw error;
  } finally {
    active = false;
  }
}
