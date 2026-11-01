import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
const code = readFileSync(new URL("../../metro.config.js", import.meta.url), "utf8");
const realRequire = createRequire(import.meta.url);
function config(env: Record<string, string>) {
  const module = { exports: {} as { cacheVersion: string } };
  runInNewContext(code, {
    module,
    process: { env },
    __dirname: "/native",
    require: (name: string) =>
      name === "expo/metro-config"
        ? { getDefaultConfig: () => ({ resolver: {}, cacheVersion: "expo" }) }
        : realRequire(name),
  });
  return module.exports.cacheVersion;
}
it("invalidates inlined public transport flags while retaining stable/private-only cache identity", () => {
  const dev = config({
    EXPO_PUBLIC_OTR_SYNC_TRANSPORT: "dev",
    EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED: "true",
  });
  expect(dev).not.toBe(
    config({
      EXPO_PUBLIC_OTR_SYNC_TRANSPORT: "fake",
      EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED: "true",
    }),
  );
  expect(dev).toBe(
    config({
      PRIVATE_SECRET: "not-a-public-build-value",
      EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED: "true",
      EXPO_PUBLIC_OTR_SYNC_TRANSPORT: "dev",
    }),
  );
  expect(dev).not.toContain("not-a-public-build-value");
});
