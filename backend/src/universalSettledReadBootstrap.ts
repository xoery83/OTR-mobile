import { z } from "zod";

const settings = z.strictObject({
  version: z.literal(1),
  configSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  priceSchedule: z.strictObject({
    currency: z.literal("USD"),
    inputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
    cachedInputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
    outputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
  }),
});

// Explicit trusted Host selection; it cannot enable the paid execution port.
export function settledReadSettings(environment: Record<string, string | undefined>) {
  const raw = environment.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY;
  if (raw === undefined) return undefined;
  if (raw.length > 4096 || environment.OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT === "enabled")
    throw Error("UNIVERSAL_RECOVERY_CONFIGURATION_REJECTED");
  const value = settings.parse(JSON.parse(raw));
  const start = Date.parse(value.startsAt),
    end = Date.parse(value.expiresAt);
  if (end <= start || end - start > 600000)
    throw Error("UNIVERSAL_RECOVERY_WINDOW_REJECTED");
  return { ...value, configPath: "/run/otr/universal-recovery.json" };
}
