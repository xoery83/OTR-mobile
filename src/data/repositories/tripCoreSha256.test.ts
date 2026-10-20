import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "./tripCoreSha256";

it("matches SHA-256 standard vectors and binary/Unicode bytes", async () => {
  expect(await tripCoreSha256Hex(new Uint8Array())).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  expect(await tripCoreSha256Hex(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  for (const bytes of [
    new Uint8Array([0, 255, 128, 10]),
    new TextEncoder().encode("旅程 🚆 café"),
    new Uint8Array(1025).map((_, index) => index & 255),
  ]) {
    expect(await tripCoreSha256Hex(bytes)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  }
});

it("preserves the Core intent domain-separation digest", async () => {
  const command = { kind: "CREATE_ITEM", title: "旅程 🚆", date: "2026-10-13" };
  const actual = await coreHashValue(
    "otr-trip-core-intent-v2",
    command,
    tripCoreSha256Hex,
  );
  const expected = await coreHashValue(
    "otr-trip-core-intent-v2",
    command,
    async (bytes) => createHash("sha256").update(bytes).digest("hex"),
  );
  expect(actual).toBe(expected);
});
