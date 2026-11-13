import * as SecureStore from "expo-secure-store";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { readInitializedDatabase } from "@/data/db/database";
import { createTripPersonCloudCreateRepository } from "@/data/repositories/tripPersonCloudCreateRepository";
import { bindTripPersonEditorDraft } from "@/data/repositories/tripPersonEditorDraft";

// One editor slot per Account/Trip; these are draft bytes, never Session/Cloud authority.
export async function loadTripPersonEditorDraft(input: AccountRequestContext) {
  const context = Object.freeze({ ...input });
  await assertAccountRequestContext(context, requireAdoptedUserId);
  const database = await readInitializedDatabase();
  await assertAccountRequestContext(context, requireAdoptedUserId);
  const repository = createTripPersonCloudCreateRepository(
    database,
    requireAdoptedUserId,
    undefined,
    {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      deleteItem: SecureStore.deleteItemAsync,
    },
  );
  if (!repository.drafts) throw Error("PERSON_EDITOR_STORAGE_UNAVAILABLE");
  return bindTripPersonEditorDraft(repository.drafts, context);
}
