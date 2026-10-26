import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("bootstraps the retained P2 snapshots in a standalone Node bundle without Expo installed", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "otr-p2-bootstrap-"));
  try {
    const output = resolve(directory, "replay.mjs");
    const result = await build({
      entryPoints: ["backend/src/__fixtures__/universalP2BootstrapReplay.ts"],
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      alias: { "@": "./src", "expo-crypto": "./backend/src/headlessExpoCrypto.ts" },
      external: ["react-native", "expo-*"],
      outfile: output,
      metafile: true,
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
    });
    execFileSync(
      process.execPath,
      [
        output,
        resolve(
          "docs/ops/universal-p2-formal-save-20261027/P2_TASK_PREPARATION_READ_SNAPSHOTS.json",
        ),
      ],
      { cwd: directory, stdio: "pipe" },
    );
    expect(
      Object.values(result.metafile!.outputs)
        .flatMap((o) => o.imports)
        .filter((i) => i.path === "expo-crypto"),
    ).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
