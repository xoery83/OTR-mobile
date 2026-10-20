import type { createTripPersonParticipationPendingRepository } from "@/data/repositories/tripPersonParticipationPendingRepository";
import type { createTripPersonParticipationTransport } from "@/data/api/tripPersonParticipationTransport";
import { reconcileTripPersonParticipationResult } from "./ledgerReportingCoordinator";
// Explicit exact recovery only. No scheduler, automatic dispatch, POST fallback
// or optimistic canonical write. Reporting remains the sole convergence owner.
export async function recoverTripPersonParticipationOperation(
  pending: ReturnType<typeof createTripPersonParticipationPendingRepository>,
  transport: ReturnType<typeof createTripPersonParticipationTransport>,
  tripId: string,
  operationId: string,
) {
  const stored = await pending.load(tripId, operationId);
  const result = await transport.receipt(stored.command, stored.context);
  return reconcileTripPersonParticipationResult(
    stored.command,
    result.data,
    result.context,
  );
}
