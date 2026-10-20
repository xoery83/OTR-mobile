import { describe, expect, it } from "vitest";

import { createUuid } from "./localId";

describe("UUID identity", () => {
  it("creates an API-safe v4 UUID", () => {
    expect(createUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
