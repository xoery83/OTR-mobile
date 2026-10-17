import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  createLedgerReportingRepository,
  type LedgerReportingDatabase,
} from "./ledgerReportingRepository";
import { createLedgerSettlementRepository } from "./ledgerSettlementRepository";
import { createTripPersonRepository } from "./tripPersonRepository";

export type TripPreparationSetup = {
  context: AccountRequestContext;
  currency:
    | { state: "UNKNOWN" }
    | {
        state: "AVAILABLE";
        code: string;
        scale: number;
        permission: "OWNER" | "READ_ONLY";
        lock: "FINALIZED" | "NOT_OBSERVED" | "UNKNOWN";
      };
  members:
    | { state: "UNKNOWN" }
    | {
        state: "AVAILABLE";
        namedCount: number;
        people: { personId: string; displayName: string }[];
      };
  // The existing Person projection does not expose Account links or invitations.
  invitations: "UNKNOWN";
  connections: "UNKNOWN";
};

export function createTripPreparationSetupRepository(
  database: LedgerReportingDatabase,
  account: () => Promise<string>,
) {
  const reporting = createLedgerReportingRepository(database, account);
  const settlement = createLedgerSettlementRepository(database, account);
  const persons = createTripPersonRepository(database, account);
  return {
    async read(tripId: string): Promise<TripPreparationSetup> {
      coreUuid.parse(tripId);
      const context = await captureAccountRequestContext(tripId, account);
      return withAccountApplyGate(async () => {
        const result: TripPreparationSetup = {
          context,
          currency: { state: "UNKNOWN" },
          members: { state: "UNKNOWN" },
          invitations: "UNKNOWN",
          connections: "UNKNOWN",
        };
        await database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, account);
          const actor = await reporting.getActorContext(tripId).catch(() => null);
          if (actor?.memberId) {
            try {
              const journey = (await reporting.listJourneys()).find(
                (item) => item.journeyId === tripId && item.hasActor,
              );
              if (journey) {
                let lock: "FINALIZED" | "NOT_OBSERVED" | "UNKNOWN" = "UNKNOWN";
                try {
                  lock = (await settlement.hasFinalized(tripId))
                    ? "FINALIZED"
                    : "NOT_OBSERVED";
                } catch {
                  // A failed local history read cannot certify an unlocked currency.
                }
                result.currency = {
                  state: "AVAILABLE",
                  code: journey.settlementCurrency,
                  scale: journey.settlementScale,
                  permission: actor.role === "owner" ? "OWNER" : "READ_ONLY",
                  lock,
                };
              }
            } catch {
              // Preserve independent member availability if Ledger settings cannot load.
            }
            try {
              const people = await persons.listTripPersons(tripId);
              if (people.some((person) => person.personId === actor.memberId)) {
                const named = people.filter((person) => person.displayName.trim());
                result.members = {
                  state: "AVAILABLE",
                  namedCount: named.length,
                  people: named.map(({ personId, displayName }) => ({
                    personId,
                    displayName,
                  })),
                };
              }
            } catch {
              // Unknown roster is not an empty roster or evidence of an invitation.
            }
          }
          await assertAccountRequestContext(context, account);
        });
        return result;
      });
    },
  };
}

export async function readTripPreparationSetupRepository() {
  return createTripPreparationSetupRepository(
    await readInitializedDatabase(),
    requireActiveUserId,
  );
}
