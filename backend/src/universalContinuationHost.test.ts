import { expect, it } from "vitest";
import { runUniversalContinuationFixture } from "./__fixtures__/universalContinuationRuntime";

it.skipIf(process.platform !== "linux")(
  "reopens the real SQLite Task repository and Linux private custody through the authenticated HTTP boundary",
  async () => {
    const result = await runUniversalContinuationFixture("/custody-tests");
    expect(result.realProviderCalls).toBe(0);
    expect(result.checks).toHaveLength(4);
  },
);
