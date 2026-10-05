import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createLocalCaptureInboxRepository } from "./localCaptureInboxRepository";

// Dormant factory: global SQLite48 registration belongs to Integration.
export async function getDefaultLocalCaptureInboxRepository() {
  return createLocalCaptureInboxRepository(await openDatabase(), requireActiveUserId, {
    newId: randomUUID,
    now: () => new Date().toISOString(),
    sha256: async (bytes) => {
      const hash = await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
      return Array.from(new Uint8Array(hash), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    },
  });
}
