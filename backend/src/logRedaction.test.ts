import { describe, expect, it } from "vitest";

import { redactLogRoute } from "./app";

describe("backend log redaction", () => {
  it("does not retain entity identifiers or query contents", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const route = redactLogRoute(`/v2/trips/${id}/expenses/${id}`);
    expect(route).toBe("/v2/trips/:id/expenses/:id");
    expect(route).not.toContain(id);
  });
});
