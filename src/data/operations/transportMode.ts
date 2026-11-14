import { z } from "zod";
const transportModeSchema = z.enum(["fake", "dev"]);
export function getSyncTransportMode() {
  return transportModeSchema.parse(process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT ?? "fake");
}
