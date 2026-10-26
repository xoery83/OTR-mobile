import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync("metro.config.js", "utf8");
function config(directory: string, workbench = false, embedded = false) {
  const module = {
    exports: {} as {
      cacheVersion: string;
      resolver: { resolveRequest?: (...args: any[]) => any };
    },
  };
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
    process: {
      env: {
        ...(workbench ? { EXPO_PUBLIC_OTR_IMPORT_WORKBENCH: "1" } : {}),
        ...(embedded ? { OTR_FORMS_QA_EMBEDDED: "1" } : {}),
      },
    },
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
it("only omits Expo's Metro-only socket for the explicit embedded QA build", () => {
  expect(config("/qa").resolver.resolveRequest).toBeUndefined();
  const qa = config("/qa", false, true);
  const context = {
    resolveRequest: (_: any, filePath: string) => ({ type: "sourceFile", filePath }),
  };
  expect(
    qa.resolver.resolveRequest!(
      context,
      "/node_modules/expo/src/async-require/messageSocket.native.ts",
      "ios",
    ),
  ).toEqual({ type: "empty" });
  expect(
    qa.resolver.resolveRequest!(context, "/src/data/auth/session.ts", "ios"),
  ).toEqual({ type: "sourceFile", filePath: "/src/data/auth/session.ts" });
  expect(qa.cacheVersion).not.toBe(config("/qa").cacheVersion);
});
