import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  CryptoDigestAlgorithm,
  digest,
  digestStringAsync,
  randomUUID,
} from "./headlessExpoCrypto";

it("preserves UTF8 digest encoding and exact buffer view bounds", async () => {
  const algorithm = CryptoDigestAlgorithm.SHA256;
  for (const value of ["", "NZ501 AKL→CHC 2026-11-02\n", "参与者🥝"]) {
    for (const encoding of ["hex", "base64"] as const)
      expect(await digestStringAsync(algorithm, value, { encoding })).toBe(
        createHash("sha256").update(value).digest(encoding),
      );
    expect(await digestStringAsync(algorithm, value)).toBe(
      createHash("sha256").update(value).digest("hex"),
    );
  }
  const input = Uint8Array.from([99, 1, 2, 3, 88]).subarray(1, 4);
  const result = await digest(algorithm, input);
  expect(result.byteLength).toBe(32);
  expect(Buffer.from(result)).toEqual(createHash("sha256").update(input).digest());
  expect(Buffer.from(await digest(algorithm, input.slice().buffer))).toEqual(
    Buffer.from(result),
  );
  expect(randomUUID()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
it("rejects unsupported algorithms, encodings and non-string data", async () => {
  await expect(digestStringAsync("MD5", "abc")).rejects.toThrow("UNSUPPORTED_ALGORITHM");
  await expect(digest("SHA-1", new ArrayBuffer(0))).rejects.toThrow(
    "UNSUPPORTED_ALGORITHM",
  );
  await expect(digestStringAsync("SHA-256", "abc", { encoding: "utf8" })).rejects.toThrow(
    "UNSUPPORTED_ENCODING",
  );
  await expect(digestStringAsync("SHA-256", 1 as unknown as string)).rejects.toThrow(
    "STRING_REQUIRED",
  );
});
