// QA preview only; this never enables an interpreter, Provider or Core authority.
export function formScanFixtureEnabled(
  development: boolean,
  bundleMarker: string | undefined,
  projectUrl: string | undefined,
) {
  return (
    development ||
    (["com.xoery.otrmobile.ipadqa", "com.xoery.otrmobile.formsqa"].includes(
      bundleMarker ?? "",
    ) &&
      projectUrl === "https://tuqigdxrvrerfewsxqgm.supabase.co")
  );
}
export function canOpenFormScanFixture() {
  return formScanFixtureEnabled(
    __DEV__,
    process.env.EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE,
    process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL,
  );
}
