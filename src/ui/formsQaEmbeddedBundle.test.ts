import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
const module = { exports: undefined as any };
runInNewContext(
  readFileSync(
    new URL("../../plugins/withFormsQaEmbeddedBundle.js", import.meta.url),
    "utf8",
  ),
  {
    module,
    require: (name: string) => {
      if (name !== "expo/config-plugins") throw Error("Unexpected dependency");
      return { withAppDelegate: (config: any, apply: any) => apply(config) };
    },
  },
);
const plugin = module.exports;
it("adds an explicit Debug-only opt-in once and retains ordinary Metro/Release paths", () => {
  const source =
    '#if DEBUG\n    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "entry")\n#else\n    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")\n#endif';
  const input = { modResults: { language: "swift", contents: source } };
  const result = plugin(input);
  expect(result.modResults.contents).toContain("#if DEBUG\n    // Dedicated device QA");
  expect(result.modResults.contents).toContain(
    'object(forInfoDictionaryKey: "OTRFormsQAEmbeddedBundle")',
  );
  expect(result.modResults.contents).toContain(
    "return RCTBundleURLProvider.sharedSettings()",
  );
  expect(result.modResults.contents).toContain("#else\n    return Bundle.main.url");
  const first = result.modResults.contents;
  expect(plugin(result).modResults.contents).toBe(first);
});
it("fails visibly when the generated delegate template changes", () => {
  expect(() =>
    plugin({ modResults: { language: "swift", contents: "changed" } }),
  ).toThrow("unsupported AppDelegate template");
});
