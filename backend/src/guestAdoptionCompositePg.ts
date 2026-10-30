import { z } from "zod";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import type { CorePgTransactionContext } from "./tripCoreV2PgStorage";
import { withTripPgStorageOnTransaction } from "./tripCreatePgStorage";
import { withTripMetadataV2PgStorageOnTransaction } from "./tripMetadataV2PgStorage";
import { withTripPersonCloudCreateOnTransaction } from "./tripPersonCloudCreatePg";
import { executeGuestAdoptionComposite } from "./guestAdoptionCompositeExecute";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";

// Internal held-transaction candidate only. It owns no COMMIT or final receipt;
// a publisher must persist/verify its complete terminal receipt before committing.
export async function executeGuestAdoptionCompositePgOnTransaction(
  user: AuthenticatedAccount,
  adoptionId: string,
  expectedPlanSha256: string,
  context: CorePgTransactionContext,
  signal?: AbortSignal,
) {
  if (!isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
  const actor = coreUuid.parse(user.id);
  const adoption = coreUuid.parse(adoptionId);
  const expected = coreHash.parse(expectedPlanSha256);
  const current = () => {
    if (signal?.aborted) throw Error("GUEST_ADOPTION_EXECUTION_ABORTED");
  };
  current();
  await context.lease.query(
    "SELECT otr_auth_guest_composite.begin_scope($1::uuid,$2::uuid,$3::text)",
    [actor, adoption, expected],
  );
  current();
  const raw = (
    await context.lease.query(
      "SELECT otr_auth_guest_composite.read_scope($1::uuid) AS result",
      [actor],
    )
  ).rows[0]?.result;
  current();
  const stage = z.strictObject({ planText: z.string(), planSha256: coreHash }).parse(raw);
  if (
    stage.planSha256 !== expected ||
    (await tripCoreSha256Hex(new TextEncoder().encode(stage.planText))) !== expected
  )
    throw Error("GUEST_ADOPTION_LOCKED_PLAN_MISMATCH");
  const plan = JSON.parse(stage.planText);
  if (plan.grant?.adoptionId !== adoption || plan.grant?.targetAccountId !== actor)
    throw Error("GUEST_ADOPTION_LOCKED_PLAN_MISMATCH");
  const binding = Object.freeze({
    actorAccountId: actor,
    adoptionId: adoption,
    sourceGuestLocalId: plan.grant.sourceGuestLocalId,
    inventorySha256: plan.grant.inventorySha256,
    grantId: plan.grant.grantId,
    planSha256: expected,
  });
  const canonical = (value: unknown) => canonicalCoreJson(value as Json);
  const assertCurrent = async (requested: typeof binding) => {
    current();
    if (canonical(requested) !== canonical(binding))
      throw Error("GUEST_ADOPTION_SCOPE_BINDING_MISMATCH");
    const row = (
      await context.lease.query(
        "SELECT otr_auth_guest_composite.scope_binding($1::uuid) AS result",
        [actor],
      )
    ).rows[0]?.result;
    current();
    if (canonical(row) !== canonical(binding))
      throw Error("GUEST_ADOPTION_SCOPE_BINDING_MISMATCH");
  };
  return withTripPgStorageOnTransaction(context.lease, (trips) =>
    withTripMetadataV2PgStorageOnTransaction(context.lease, (metadata) =>
      withTripPersonCloudCreateOnTransaction(context.lease, (people) =>
        executeGuestAdoptionComposite(
          Object.freeze({ id: actor, accountClass: "NORMAL_ACCOUNT" }),
          { grant: plan.grant, preparationSha256: plan.preparation.sha256 },
          plan.preparation,
          {
            assertCurrent,
            async assertNewTrips(accountId, tripIds) {
              if (accountId !== actor) throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
              await context.lease.query(
                "SELECT otr_auth_guest_composite.assert_new_trips($1::uuid,$2::jsonb)",
                [actor, JSON.stringify(tripIds)],
              );
            },
            trips,
            metadata,
            people,
            core: context.storage,
            async initializeLedger(accountId, original) {
              if (accountId !== actor) throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
              return (
                await context.lease.query(
                  "SELECT otr_auth_guest_composite.ledger_snapshot($1::uuid,$2::uuid) AS result",
                  [actor, original.id],
                )
              ).rows[0]?.result;
            },
          },
          signal,
        ),
      ),
    ),
  );
}
