import { describe, expect, it } from "vitest";

import { assertHostedDevUrl } from "../../scripts/dev/enable-settlement-test-fixture";

describe("Settlement fixture target guard", () => {
  it("rejects Production before a client can be created", () => {
    expect(() => assertHostedDevUrl("https://production.invalid")).toThrow(
      "TARGET_REJECTED_BEFORE_CLIENT",
    );
  });
});
