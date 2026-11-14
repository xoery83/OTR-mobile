import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { requireActiveUserId } from "../auth/authRepository";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";

// Device-local read preference only; never a Review decision or an Operation receipt.
const key = (context: AccountRequestContext, batchId: string) =>
  `otr.import.read.${z.uuid().parse(context.accountId)}.${z.uuid().parse(batchId)}`;
export async function readImportUpdateVersions(
  context: AccountRequestContext,
  batchIds: readonly string[],
) {
  await assertAccountRequestContext(context, requireActiveUserId);
  const pairs = await Promise.all(
    [...new Set(batchIds)].map(
      async (id) => [id, await SecureStore.getItemAsync(key(context, id))] as const,
    ),
  );
  await assertAccountRequestContext(context, requireActiveUserId);
  return Object.fromEntries(pairs);
}
export async function markImportUpdateVersionRead(
  context: AccountRequestContext,
  batchId: string,
  version: string,
) {
  await assertAccountRequestContext(context, requireActiveUserId);
  await SecureStore.setItemAsync(
    key(context, batchId),
    z.string().min(1).max(512).parse(version),
  );
  await assertAccountRequestContext(context, requireActiveUserId);
}
