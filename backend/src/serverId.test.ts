import { describe, expect, it } from "vitest";

import { deriveServerId } from "./serverId";

describe("deriveServerId", () => {
  it("is stable for a retry and isolated by entity type", () => {
    const expenseId = deriveServerId("user-1", "expense", "operation-1");

    expect(deriveServerId("user-1", "expense", "operation-1")).toBe(expenseId);
    expect(deriveServerId("user-1", "itinerary", "operation-1")).not.toBe(expenseId);
    expect(expenseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
