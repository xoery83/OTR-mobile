import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync("metro.config.js", "utf8");
function config(directory: string, workbench = false) {
  const module = { exports: {} as { cacheVersion: string } };
  vm.runInNewContext(source, {
    __dirname: directory,
    module,
    require: (name: string) => {
      expect(name).toBe("expo/metro-config");
      return {
        getDefaultConfig: (root: string) => ({
          projectRoot: root,
          cacheVersion: "expo-default",
          resolver: {},
        }),
      };
    },
    process: { env: workbench ? { EXPO_PUBLIC_OTR_IMPORT_WORKBENCH: "1" } : {} },
  });
  return module.exports;
}
it("isolates shared-dependency Router transform contexts by checkout while retaining existing workbench invalidation", () => {
  const one = config("/qa/current"),
    other = config("/qa/previous");
  expect(one.cacheVersion).not.toBe(other.cacheVersion);
  expect(one.cacheVersion).toBe("expo-default:/qa/current");
  expect(config("/qa/current").cacheVersion).toBe(one.cacheVersion);
  expect(config("/qa/current", true).cacheVersion).toBe(
    "otr-import-workbench-v1:/qa/current",
  );
});
