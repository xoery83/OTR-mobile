import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

test("baseline guards reject count and same-count checksum drift", async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), "otr-baseline-guard-"));
  const verifier = resolve("scripts/supabase/verify-baseline-artifacts.mjs");
  const comparator = resolve("scripts/supabase/compare-manifests.mjs");
  try {
    await mkdir(resolve(cwd, "supabase"));
    for (const name of ["migrations", "seed.sql", "schema-manifest.json"]) {
      await cp(resolve("supabase", name), resolve(cwd, "supabase", name), {
        recursive: true,
      });
    }
    const manifestPath = resolve(cwd, "supabase/schema-manifest.json");
    const expectedPath = resolve(cwd, "expected.json");
    const canonical = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(expectedPath, JSON.stringify(canonical));
    const run = (file, args = []) =>
      execFileSync(process.execPath, [file, ...args], {
        cwd,
        stdio: "pipe",
      });
    assert.equal(JSON.parse(run(verifier)).status, "ok");
    run(comparator, [expectedPath, manifestPath]);
    for (const [field, value] of [
      ["tables", canonical.tables + 1],
      ["checksum", "0".repeat(64)],
    ]) {
      await writeFile(manifestPath, JSON.stringify({ ...canonical, [field]: value }));
      assert.throws(
        () => run(verifier),
        (error) => error.stderr.toString().includes(`Expected ${field}=`),
      );
      assert.throws(
        () => run(comparator, [expectedPath, manifestPath]),
        (error) =>
          error.stderr.toString().includes(`Schema manifest mismatch for ${field}`),
      );
    }
    await writeFile(manifestPath, JSON.stringify(canonical));
    const activationPath = resolve(
      cwd,
      "supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql",
    );
    const activation = await readFile(activationPath, "utf8");
    await writeFile(
      activationPath,
      activation.replace(
        /as \$anchor\$ select '[0-9a-f]{64}'::text/,
        "as $anchor$ select '" + "0".repeat(64) + "'::text",
      ),
    );
    assert.throws(
      () => run(verifier),
      (error) =>
        error.stderr
          .toString()
          .includes("Independent reviewed participation root anchor changed."),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
