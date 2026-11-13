import { afterEach, expect, it, vi } from "vitest";
import appConfig from "../../../app.config";
import base from "../../../app.json";

afterEach(() => vi.unstubAllEnvs());
it("preserves the existing QA Expo configuration unless production is explicitly selected", () => {
  vi.stubEnv("OTR_IOS_VARIANT", "");
  expect(appConfig({ config: base.expo } as never)).toBe(base.expo);
});
it("isolates the production Bundle ID and Team without mutating the QA config", () => {
  vi.stubEnv("OTR_IOS_VARIANT", "production");
  const config = appConfig({ config: base.expo } as never);
  expect(config.ios).toMatchObject({
    bundleIdentifier: "art.xoery.otr",
    appleTeamId: "3K49Z2Q5X7",
    usesAppleSignIn: true,
  });
  expect(config.plugins).toContain("expo-apple-authentication");
  expect(
    config.plugins?.some(
      (p) => Array.isArray(p) && p[0] === "@react-native-google-signin/google-signin",
    ),
  ).toBe(false);
  expect(base.expo.ios.bundleIdentifier).toBe("com.xoery.otrmobile");
  expect(base.expo.ios.appleTeamId).toBe("U9D5C58Z94");
});
