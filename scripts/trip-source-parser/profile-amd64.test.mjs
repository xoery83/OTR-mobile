import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { profile as old } from "./profile.mjs";
import { profile, profileHash, profileManifest, sha256 } from "./profile-amd64.mjs";
test("changes only the actual execution runtime, never PNG parsing or resource limits", () => {
  const changed = ["baseImage", "nodeVersion", "zlibVersion", "arch"];
  for (const key of Object.keys(old))
    if (!changed.includes(key)) assert.deepEqual(profile[key], old[key]);
  assert.equal(profile.arch, "x64");
  assert.equal(profile.nodeVersion, "24.22.1");
  assert.equal(profile.zlibVersion, "1.3.2.1-motley-285e94b");
  assert.equal(profileHash(), sha256(JSON.stringify(profileManifest())));
  const files = new Map(profileManifest().files);
  assert.equal(
    files.get("profile.mjs"),
    sha256(readFileSync(new URL("./profile-amd64.mjs", import.meta.url))),
  );
  assert.equal(
    files.get("Dockerfile"),
    sha256(readFileSync(new URL("./Dockerfile.amd64", import.meta.url))),
  );
  assert.notEqual(
    profileHash(),
    "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5",
  );
});
