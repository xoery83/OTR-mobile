import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripMetadataRepository } from "./tripMetadataRepository";
import { tripCoreSha256Hex } from "./tripCoreSha256";

export type PersonalTripCoverAccess = Readonly<{
  kind: "LOCAL_CREATOR" | "CORE_READ";
  token: string;
}>;

// Caller holds the Account gate/transaction; never infer access from a preference or discovery row.
export function createPersonalTripCoverAccess(
  database: CoreDatabase,
  account: () => Promise<string>,
) {
  const core = createTripCoreV2Repository(database, account, tripCoreSha256Hex);
  const metadata = createTripMetadataRepository(database, account, () =>
    new Date().toISOString(),
  );
  return async (
    context: AccountRequestContext,
  ): Promise<PersonalTripCoverAccess | null> => {
    await assertAccountRequestContext(context, account);
    const current = await database.getFirstAsync<{
      refresh_generation: number;
      access_revision: number;
      revoked: number;
    }>(
      "SELECT refresh_generation,access_revision,revoked FROM trip_core_scopes WHERE account_id=? AND trip_id=?",
      context.accountId,
      context.tripId,
    );
    if (current?.revoked) return null;
    let localCreator = false;
    try {
      localCreator = await metadata.canUpdateMetadata(context.tripId);
    } catch {
      await assertAccountRequestContext(context, account);
    }
    if (localCreator) {
      const local = await database.getFirstAsync<{ create_operation_id: string }>(
        "SELECT create_operation_id FROM local_trip_containers WHERE account_id=? AND id=?",
        context.accountId,
        context.tripId,
      );
      await assertAccountRequestContext(context, account);
      if (local)
        return {
          kind: "LOCAL_CREATOR",
          token: JSON.stringify([current, local.create_operation_id]),
        };
    }
    let accepted;
    try {
      accepted = await core.readAcceptedSnapshotWithinTransaction(context);
    } catch {
      await assertAccountRequestContext(context, account);
      return null;
    }
    if (!accepted) return null;
    const { actor, certificate } = accepted;
    if (
      !actor.active ||
      actor.accountId !== context.accountId ||
      actor.tripId !== context.tripId
    )
      return null;
    // The owning reader permits lawful read-only observers too; no management or person-ID gate.
    return { kind: "CORE_READ", token: JSON.stringify([current, certificate, actor]) };
  };
}
