import { describe, expect, it } from "vitest";
import { settledReadSettings } from "./universalSettledReadBootstrap";

const value = {
  version: 1,
  configSHA256: "a".repeat(64),
  startsAt: "2026-10-25T00:00:00Z",
  expiresAt: "2026-10-25T00:10:00Z",
  priceSchedule: {
    currency: "USD",
    inputNanosPerMillion: "150000000",
    cachedInputNanosPerMillion: "3000000",
    outputNanosPerMillion: "600000000",
  },
};
const env = (v: unknown) => ({ OTR_DEV_UNIVERSAL_SETTLED_RECOVERY: JSON.stringify(v) });
describe("settled-only trusted Host selection", () => {
  it("leaves the existing closed baseline unchanged", () =>
    expect(settledReadSettings({})).toBeUndefined());
  it("binds only the fixed recovery config mount", () =>
    expect(settledReadSettings(env(value))?.configPath).toBe(
      "/run/otr/universal-recovery.json",
    ));
  it("rejects simultaneous paid transport", () =>
    expect(() =>
      settledReadSettings({
        ...env(value),
        OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT: "enabled",
      }),
    ).toThrow());
  it("rejects wider windows, arbitrary mount paths and invalid settings", () => {
    for (const v of [
      { ...value, expiresAt: "2026-10-25T00:10:01Z" },
      { ...value, configPath: "/tmp/config" },
      { ...value, configSHA256: "bad" },
    ])
      expect(() => settledReadSettings(env(v))).toThrow();
  });
});
