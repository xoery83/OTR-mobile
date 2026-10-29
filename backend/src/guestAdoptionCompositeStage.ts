import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import type { AuthenticatedAccount } from "./authAccountQualification";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

// Unmounted storage candidate. The caller must supply an owning locked staging binding;
// this function neither issues grants nor makes a plan into publication authority.
export async function stageGuestAdoptionComposite(
  connection: CorePgConnection,
  user: AuthenticatedAccount,
  owningStaging: unknown,
  preparedCheckpoint: unknown,
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
    if (!active) throw Error("GUEST_ADOPTION_STAGE_SCOPE_RELEASED");
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
        await lease.query(
          `INSERT INTO otr_auth_guest_composite.sealed_stages
          (adoption_id,actor_account_id,source_guest_local_id,grant_id,inventory_sha256,preparation_sha256,plan_sha256,plan_text)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8)
         ON CONFLICT (adoption_id) DO NOTHING`,
          [
            grant.adoptionId,
            grant.targetAccountId,
            grant.sourceGuestLocalId,
            grant.grantId,
            grant.inventorySha256,
            sealed.preparation.sha256,
            plan.sha256,
            plan.canonicalText,
          ],
        );
        assertActive();
        const row = (
          await lease.query(
            `SELECT plan_text,plan_sha256 FROM otr_auth_guest_composite.sealed_stages
         WHERE adoption_id=$1::uuid AND actor_account_id=$2::uuid FOR UPDATE`,
            [grant.adoptionId, grant.targetAccountId],
          )
        ).rows[0];
        assertActive();
        if (row?.plan_text !== plan.canonicalText || row?.plan_sha256 !== plan.sha256)
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
