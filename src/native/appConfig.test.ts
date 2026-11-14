import { afterEach, expect, it } from "vitest";
import appConfig from "../../app.config";
const variant = process.env.OTR_IOS_VARIANT;
afterEach(() => {
  if (variant === undefined) delete process.env.OTR_IOS_VARIANT;
  else process.env.OTR_IOS_VARIANT = variant;
});
it("includes Apple native support in DEV without replacing its Google or app identity", () => {
  delete process.env.OTR_IOS_VARIANT;
  const config = { name: "OTR", slug: "otr", ios: { bundleIdentifier: "com.xoery.otrmobile" }, plugins: ["@react-native-google-signin/google-signin"] };
  const result = appConfig({ config } as Parameters<typeof appConfig>[0]);
  expect(result.ios?.bundleIdentifier).toBe(config.ios.bundleIdentifier);
  expect(result.ios?.usesAppleSignIn).toBe(true);
  expect(result.plugins).toContain("expo-apple-authentication");
  expect(result.plugins).toContain("@react-native-google-signin/google-signin");
  process.env.OTR_IOS_VARIANT = "production";
  const production = appConfig({ config } as Parameters<typeof appConfig>[0]);
  expect(production.ios?.bundleIdentifier).toBe("art.xoery.otr");
  expect(production.plugins).toEqual(["expo-apple-authentication"]);
});
