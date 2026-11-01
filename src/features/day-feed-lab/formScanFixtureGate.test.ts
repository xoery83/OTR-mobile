import { expect, it } from "vitest";
import { formScanFixtureEnabled } from "./formScanFixtureGate";
it("keeps release previews closed without the exact QA build marker and DEV project", () => {
  const url = "https://tuqigdxrvrerfewsxqgm.supabase.co";
  expect(formScanFixtureEnabled(false, undefined, url)).toBe(false);
  expect(formScanFixtureEnabled(false, "com.xoery.otrmobile", url)).toBe(false);
  expect(
    formScanFixtureEnabled(false, "com.xoery.otrmobile.ipadqa", "https://other.invalid"),
  ).toBe(false);
  expect(formScanFixtureEnabled(false, "com.xoery.otrmobile.ipadqa", url)).toBe(true);
  expect(formScanFixtureEnabled(true, undefined, undefined)).toBe(true);
});
