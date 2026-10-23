import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { hashTripPersonBytes, fingerprintParticipation } from "./tripPersonCertificate";
import { serializeParticipationVector } from "@/domain/trip/participationSnapshot";

vi.mock("expo-crypto", () => {
  throw new Error("Native digest module must not be loaded");
});

it.each(["", "OTR_AD5_QA_HASH_ONLY", "中文😀\u0000e\u0301", "\ud800"])(
  "preserves exact UTF-8 SHA-256 independently of the native digest loader: %j",
  async (input) => {
    expect(await hashTripPersonBytes(input)).toBe(
      createHash("sha256").update(input, "utf8").digest("hex"),
    );
  },
);

it("preserves the existing canonical participation fingerprint and detects a changed vector", async () => {
  const rows = [
    {
      id: "324bac23-5de8-41cd-be91-c5d59e253cfd",
      isParticipating: true,
      participationRevision: 1,
    },
  ];
  const expected = createHash("sha256")
    .update(serializeParticipationVector(rows))
    .digest("hex");
  expect(await fingerprintParticipation(rows)).toBe(expected);
  expect(
    await fingerprintParticipation([{ ...rows[0], participationRevision: 2 }]),
  ).not.toBe(expected);
});
