import { z } from "zod";
import { participationResultCodec } from "./tripPersonParticipationIntent";
import { participationCapabilitiesSchema } from "../../src/domain/trip/personParticipationRuntime";
/** Connector is not provisioned. Implement only these fixed DB entrypoints under
 * actual session_user=otr_trip_person_command_gateway. Lookup enforces current
 * linked owner authority in DB; no service_role or generic SQL fallback. */
export type ParticipationGateway = {
  sessionUser(): Promise<string>;
  readInstalledState(): Promise<{
    commandVersion: 1 | null;
    receiptVersion: 1 | null;
    gateClosed: boolean;
  }>;
  setParticipation(actor: string, rawIntent: string): Promise<unknown>;
  // Fixed SQL admits the current Organizer before lookup. Preserve its exact
  // { code: "42501", message: "PARTICIPATION_FORBIDDEN" } denial unchanged.
  lookupExactReceipt(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<unknown | null>;
};
export async function requireParticipationGateway(connection?: ParticipationGateway) {
  try {
    if (
      !connection ||
      (await connection.sessionUser()) !== "otr_trip_person_command_gateway"
    )
      return null;
    const state = z
      .strictObject({
        commandVersion: z.literal(1).nullable(),
        receiptVersion: z.literal(1).nullable(),
        gateClosed: z.boolean(),
      })
      .parse(await connection.readInstalledState());
    return { connection, state };
  } catch {
    return null;
  }
}
export async function participationCapabilities(connection?: ParticipationGateway) {
  const admitted = await requireParticipationGateway(connection);
  return participationCapabilitiesSchema.parse({
    contractVersion: 1,
    activationState: "DISABLED",
    enabledCommands: [],
    enabledScopes: [],
    commandVersion: admitted?.state.commandVersion ?? null,
    receiptVersion: admitted?.state.receiptVersion ?? null,
    databaseGate: admitted?.state.gateClosed ? "CLOSED" : "UNKNOWN",
    gatewayAvailable: !!admitted,
  });
}
export async function recoverParticipationReceipt(
  connection: ParticipationGateway,
  actor: string,
  trip: string,
  operation: string,
) {
  const raw = await connection.lookupExactReceipt(actor, trip, operation);
  if (raw === null) return null;
  return participationResultCodec(raw, actor, trip, operation).result;
}

export function isParticipationLookupForbidden(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "42501" &&
    "message" in error &&
    error.message === "PARTICIPATION_FORBIDDEN"
  );
}
