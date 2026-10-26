import { createHash, randomUUID } from "node:crypto";

// Backend build alias only; Native continues to use Expo's implementation.
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" } as const;
export const CryptoEncoding = { HEX: "hex", BASE64: "base64" } as const;
export { randomUUID };

function sha256(algorithm: string) {
  if (algorithm !== CryptoDigestAlgorithm.SHA256)
    throw new TypeError("HEADLESS_CRYPTO_UNSUPPORTED_ALGORITHM");
  return createHash("sha256");
}

export async function digestStringAsync(
  algorithm: string,
  data: string,
  options = { encoding: CryptoEncoding.HEX as string },
): Promise<string> {
  if (typeof data !== "string") throw new TypeError("HEADLESS_CRYPTO_STRING_REQUIRED");
  if (options.encoding !== "hex" && options.encoding !== "base64")
    throw new TypeError("HEADLESS_CRYPTO_UNSUPPORTED_ENCODING");
  return sha256(algorithm).update(data, "utf8").digest(options.encoding);
}

export async function digest(
  algorithm: string,
  data: ArrayBuffer | ArrayBufferView,
): Promise<ArrayBuffer> {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  return Uint8Array.from(sha256(algorithm).update(bytes).digest()).buffer;
}
