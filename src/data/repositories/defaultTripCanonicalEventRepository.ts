import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createTripCanonicalReadTransport } from "@/data/api/tripCanonicalReadTransport";
import { createTripCanonicalEventRepository } from "./tripCanonicalEventRepository";

export async function getDefaultTripCanonicalEventRepository() {
  const transport = createTripCanonicalReadTransport(requireActiveUserId);
  return createTripCanonicalEventRepository(
    await openDatabase(),
    requireActiveUserId,
    transport.event,
    transport.collectionPage,
  );
}
