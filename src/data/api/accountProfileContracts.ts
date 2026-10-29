import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";

export const accountProfileBootstrapPath = "/v1/account/profile/bootstrap";
export const accountProfileBootstrapSchema = z.strictObject({
  schemaId: z.literal("otr.auth.account-profile-bootstrap/1"),
  accountId: coreUuid,
  ready: z.literal(true),
});
export type AccountProfileBootstrap = z.infer<typeof accountProfileBootstrapSchema>;
