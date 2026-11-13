import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";
import {
  lockCorePgActor,
  withCorePgStorageTransaction,
  type CorePgConnection,
} from "./tripCoreV2PgStorage";
import { readCoreGate, type CoreGateMode } from "./tripSustainedGate";

const observationSchema = z
  .strictObject({
    qualification: z.literal("NOT_A_PRIVATE_JOIN_LEASE"),
    actorAccountId: coreUuid,
    tripId: coreUuid,
    actorPersonId: coreUuid,
    coreEpoch: coreUuid,
    coreAccessRevision: z.number().int().positive().safe(),
  })
  .readonly();
export type CoreRealtimeObservation = z.infer<typeof observationSchema>;

// Trusted verified Auth input only; Core metadata never issues a private channel lease.
export function createCoreRealtimeQualification(
  connection: CorePgConnection,
  hash: ImportHash,
  gateMode?: CoreGateMode,
) {
  return {
    async observe(
      user: AuthenticatedAccount,
      tripId: string,
    ): Promise<CoreRealtimeObservation> {
      if (!isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
      const accountId = coreUuid.parse(user.id),
        trip = coreUuid.parse(tripId);
      return withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
          [accountId, trip],
        );
        const finiteScope = async () => {
          const allowed = (
            await lease.query(
              "SELECT public.trip_core_finite_scope_allowed($1::uuid,$2::uuid) AS allowed",
              [accountId, trip],
            )
          ).rows[0]?.allowed;
          if (allowed !== true) throw Error("CORE_CAPABILITY_CLOSED");
        };
        await finiteScope();
        const actor = await lockCorePgActor(lease, accountId, trip);
        if (actor.active !== true || actor.personId === null) throw Error("NOT_VISIBLE");
        if (
          (await readCoreGate(lease, accountId, trip, gateMode, "runtime_enabled"))
            ?.runtime_enabled !== true
        )
          throw Error("CORE_CAPABILITY_CLOSED");
        const state = (
          await lease.query(
            "SELECT epoch,access_revision::float8 AS access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [trip],
          )
        ).rows[0];
        const observed = observationSchema.parse({
          qualification: "NOT_A_PRIVATE_JOIN_LEASE",
          actorAccountId: accountId,
          tripId: trip,
          actorPersonId: actor.personId,
          coreEpoch: state?.epoch,
          coreAccessRevision: state?.access_revision,
        });
        await finiteScope();
        return observed;
      });
    },
  };
}

// No Auth transition-receipt producer exists here, including within the same Core epoch.
export function coreRealtimeRevocationMapping(current: unknown, previous: unknown) {
  const a = observationSchema.safeParse(current),
    b = observationSchema.safeParse(previous);
  const reason =
    !a.success || !b.success
      ? "INVALID_OBSERVATION"
      : a.data.actorAccountId !== b.data.actorAccountId || a.data.tripId !== b.data.tripId
        ? "SCOPE_MISMATCH"
        : a.data.coreEpoch !== b.data.coreEpoch
          ? "EPOCH_MISMATCH"
          : "AUTH_TRANSITION_RECEIPT_UNAVAILABLE";
  return { status: "NOT_MAPPABLE" as const, reason };
}
