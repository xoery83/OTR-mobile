import { expect, it } from "vitest";
import { build } from "esbuild";
it("does not eagerly import Native modules into the headless Capture Backend", async () => {
  const result = await build({
    entryPoints: ["backend/src/serverCapture.ts"],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    alias: { "@": "./src" },
    external: ["react-native", "expo-*"],
    write: false,
    metafile: true,
  });
  expect(
    Object.values(result.metafile!.outputs)
      .flatMap((o) => o.imports)
      .filter(
        (i) => i.kind === "import-statement" && /^(?:expo-|react-native)/.test(i.path),
      ),
  ).toEqual([]);
});
