import { describe, expect, it } from "vitest";

import {
  assertLedgerCursorContinuation,
  decodeLedgerCursor,
  encodeLedgerCursor,
} from "./supabaseGateway";

describe("Ledger cursor v1", () => {
  const trip = "10000000-0000-4000-8000-000000000001";
  const user = "20000000-0000-4000-8000-000000000001";

  it("validates version, Journey, user and continuation", () => {
    const cursor = encodeLedgerCursor(42, trip, user);
    expect(decodeLedgerCursor(cursor, trip, user)).toBe(42);
    for (const invalid of [
      "not-base64-json",
      Buffer.from(
        JSON.stringify({ version: 2, sequence: 42, tripId: trip, userId: user }),
      ).toString("base64url"),
      encodeLedgerCursor(42, "10000000-0000-4000-8000-000000000002", user),
      encodeLedgerCursor(42, trip, "20000000-0000-4000-8000-000000000002"),
      Buffer.from(
        JSON.stringify({ version: 1, sequence: -1, tripId: trip, userId: user }),
      ).toString("base64url"),
    ])
      expect(() => decodeLedgerCursor(invalid, trip, user)).toThrowError(
        expect.objectContaining({ code: "INVALID_CURSOR" }),
      );
    expect(() => assertLedgerCursorContinuation(43, 42)).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
  });
});
