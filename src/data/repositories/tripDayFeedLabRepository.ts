import { readAdoptedLocalSession } from "../auth/authRepository";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { collectionUuid } from "../api/tripEventCollectionCodec";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { coreCanRead } from "../../domain/trip/tripCoreV2Mutation";
import { createCoreFlightDayFeedReader } from "./tripCoreV2DayFeedRepository";
import { validateCalendarDate } from "../../domain/trip/dayReadModel";

type Repository = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "acceptedSnapshot" | "acceptedTripIds"
>;
// This facade exposes no install/refresh/command method and never falls back to v1.
export function createTripDayFeedLabReader(
  repository: Repository,
  account: () => Promise<string>,
) {
  return {
    async candidates() {
      const result = await repository.acceptedTripIds();
      result.tripIds.forEach((id) => collectionUuid.parse(id));
      await assertAccountRequestContext(result.scope, account);
      return result;
    },
    async trip(tripId: string, expected: AccountScope) {
      collectionUuid.parse(tripId);
      await assertAccountRequestContext(expected, account);
      const context = await repository.captureContext(tripId);
      const snapshot = await repository.acceptedSnapshot(context);
      await assertAccountRequestContext(expected, account);
      if (!snapshot) throw new Error("CORE_LAB_NO_ACCEPTED_READ");
      // Reuse the owning Flight bridge with this exact already-admitted snapshot.
      const observed = await createCoreFlightDayFeedReader({
        captureContext: async () => context,
        acceptedSnapshot: async () => snapshot,
      })(tripId);
      const projection = observed!.projection;
      if (projection.accountId !== expected.accountId || projection.tripId !== tripId)
        throw new Error("CORE_LAB_SCOPE");
      const dates = [
        ...new Set(
          projection.events.flatMap((event) =>
            event.boundaries.flatMap((b) =>
              b.local_date ? [validateCalendarDate(b.local_date)] : [],
            ),
          ),
        ),
      ].sort();
      const unsupportedFamilies = [
        ...new Set(
          snapshot.graph.itinerary_events
            .filter(
              (row) =>
                coreCanRead(snapshot.graph, snapshot.actor, "ITEM", row) &&
                row.hidden_at === null &&
                !["cancelled", "skipped"].includes(String(row.status)) &&
                row.experience_family !== "P2",
            )
            .map((row) => String(row.experience_family)),
        ),
      ].sort();
      await assertAccountRequestContext(expected, account);
      return { scope: expected, projection, dates, unsupportedFamilies };
    },
  };
}
export async function readTripDayFeedLab() {
  const account = async () => {
    const session = await readAdoptedLocalSession();
    if (!session?.identity?.userId || !session.accessToken || !session.refreshToken)
      throw new Error("CORE_LAB_AUTH_REQUIRED");
    return collectionUuid.parse(session.identity.userId);
  };
  await account();
  const database = await readInitializedDatabase();
  const repository = createTripCoreV2Repository(database, account, tripCoreSha256Hex);
  return createTripDayFeedLabReader(repository, account);
}
