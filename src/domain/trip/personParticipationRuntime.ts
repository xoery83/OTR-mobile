import { z } from "zod";
export const participationCapabilitiesSchema = z.strictObject({
  contractVersion: z.literal(1),
  activationState: z.literal("DISABLED"),
  enabledCommands: z.array(z.never()),
  enabledScopes: z.array(z.never()),
  commandVersion: z.literal(1).nullable(),
  receiptVersion: z.literal(1).nullable(),
  databaseGate: z.enum(["CLOSED", "UNKNOWN"]),
  gatewayAvailable: z.boolean(),
});
