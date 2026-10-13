import { sha256 } from "@noble/hashes/sha256";

/** SHA-256 of the exact Core canonical UTF-8 bytes, in lowercase hexadecimal. */
export const tripCoreSha256Hex = async (bytes: Uint8Array): Promise<string> =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
