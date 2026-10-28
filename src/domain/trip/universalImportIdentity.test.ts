import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { universalP1Identity } from "./universalImportIdentity";
it("preserves existing backend identities byte for byte for every Source purpose", () => {
  const task = randomUUID();
  for (const purpose of [
    "candidate",
    "slot",
    "operation",
    "item",
    "plan",
    "p2-publication",
    "p2-operation",
    "p2-item",
  ]) {
    const bytes = createHash("sha256")
      .update(JSON.stringify(["otr.universal.p1-source/1", task, "i1", purpose]))
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 128;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = bytes.toString("hex");
    expect(universalP1Identity(task, "i1", purpose)).toBe(
      `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
    );
  }
  expect(() => universalP1Identity("invalid", "i1", "item")).toThrow();
});
