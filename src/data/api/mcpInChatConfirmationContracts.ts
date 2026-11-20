import { z } from "zod";
const metadata = z.object({ name: z.string() }).passthrough();
export const inChatPreviewSchema = z.object({
  accountId: z.uuid(),
  clientId: z.uuid(),
  resource: z.url(),
  tripId: z.uuid(),
  operationId: z.uuid(),
  idempotencyKey: z.uuid(),
  expectedMetadataRevision: z.number().int().nonnegative(),
  before: metadata,
  after: metadata,
  expiresAt: z.iso.datetime(),
  scope: z.literal("TRIP_NAME_ONLY_NO_BUSINESS_WRITE_PROTOTYPE"),
});
export const inChatHiddenSchema = z.strictObject({
  handle: z.string().regex(/^[a-f0-9]{64}$/),
  preview: inChatPreviewSchema,
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type InChatContext = z.infer<typeof inChatHiddenSchema>;
