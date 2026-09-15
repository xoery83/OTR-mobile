import { describe, expect, it } from "vitest";

import { assertReplayFixtureWritable } from "./replayFixtureGuard";

describe("Replay fixture guard", () => {
  it("rejects both Replay identities and permits unrelated Journeys", () => {
    expect(() =>
      assertReplayFixtureWritable("ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65"),
    ).toThrow("immutable read-only fixture");
    expect(() =>
      assertReplayFixtureWritable("ec3ae448-3fa5-84a9-a986-655a243cf3ad"),
    ).toThrow("immutable read-only fixture");
    expect(() => assertReplayFixtureWritable("another-journey")).not.toThrow();
  });
});
