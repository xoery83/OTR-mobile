import { expect, it } from "vitest";
import { build } from "esbuild";
it.each([
  "server",
  "serverCapture",
  "universalPreparationMain",
  "universalSettledRecoveryMain",
])(
  "keeps crypto executable and Native modules lazy in the headless %s bundle",
  async (entry) => {
    const result = await build({
      entryPoints: [`backend/src/${entry}.ts`],
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      alias: { "@": "./src", "expo-crypto": "./backend/src/headlessExpoCrypto.ts" },
      external: ["react-native", "expo-*"],
      write: false,
      metafile: true,
    });
    expect(
      Object.values(result.metafile!.outputs)
        .flatMap((o) => o.imports)
        .filter(
          (i) =>
            i.path === "expo-crypto" ||
            (i.kind === "import-statement" && /^(?:expo-|react-native)/.test(i.path)),
        ),
    ).toEqual([]);
  },
);
