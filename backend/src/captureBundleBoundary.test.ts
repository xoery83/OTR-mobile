import { expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
      external: ["./src/data/auth/guestLocalWorkspace.ts", "./src/data/db/database.ts", "./src/data/operations/nativeDirectedInvitePorts.ts", "react-native", "expo-*"],
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
    if (entry === "serverCapture") {
      const directory = mkdtempSync(join(tmpdir(), "otr-headless-bundle-"));
      try {
        const file = join(directory, "capture.mjs");
        writeFileSync(file, 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n' + result.outputFiles![0].text);
        const run = spawnSync(process.execPath, [file], { cwd: directory, env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 10000 });
        // No credentials or node_modules: reach the normal closed configuration boundary.
        expect(run.error).toBeUndefined();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("CAPTURE_RUNTIME_UNAVAILABLE");
        expect(run.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  },
);
