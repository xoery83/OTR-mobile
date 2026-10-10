// Read-only pre-stop check of fully resolved, credential-free DEV Compose JSON.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const [reviewedImage, rollbackImage, credentialFile, direction = "host"] =
  process.argv.slice(2);
for (const image of [reviewedImage, rollbackImage]) {
  assert.match(
    image ?? "",
    /^sha256:[a-f0-9]{64}$/,
    "Exact immutable image IDs required",
  );
}
assert.notEqual(
  reviewedImage,
  rollbackImage,
  "Old wildcard image cannot run in host mode",
);
assert.ok(
  ["host", "bridge"].includes(direction),
  "Explicit host or bridge direction required",
);
// Future rotations require an explicitly verified private selection, never the exposed original.
assert.ok(
  /^\/opt\/otr\/dev-backend\/env\/backend\.rotated(?:\.[A-Za-z0-9_-]+)?\.env$/.test(
    credentialFile ?? "",
  ),
  "Verified rotated credential file required",
);
const config = JSON.parse(readFileSync(0, "utf8"));
assert.equal(config.name, "dev-backend");
assert.deepEqual(Object.keys(config.services), ["backend"]);
const service = config.services.backend;
assert.equal(service.image, direction === "host" ? reviewedImage : rollbackImage);
// Check names/counts with booleans so unexpected credential metadata is not serialized.
assert.ok(
  service.env_file?.length === 1 &&
    service.env_file[0].path === credentialFile &&
    service.env_file[0].required !== false,
  "Exclusive required rotated credential selection required",
);
if (direction === "host") {
  assert.equal(service.network_mode, "host");
  assert.ok(!service.build && !service.ports?.length && !service.networks);
  const httpEnvironment = {
    OTR_DEV_BACKEND_NETWORK_MODE: "host",
    OTR_DEV_BACKEND_BIND_ADDRESS: "127.0.0.1",
    OTR_DEV_BACKEND_PORT: "8787",
  };
  // Inspect names first so an accidentally resolved secret is never printed on failure.
  assert.deepEqual(
    Object.keys(service.environment).sort(),
    Object.keys(httpEnvironment).sort(),
  );
  for (const [name, value] of Object.entries(httpEnvironment)) {
    assert.ok(service.environment[name] === value, `Unexpected ${name}`);
  }
} else {
  assert.ok(
    !service.network_mode && !Object.keys(service.environment ?? {}).length,
    "Original Bridge environment required",
  );
  assert.deepEqual(Object.keys(service.networks ?? {}), ["default"]);
  assert.deepEqual(Object.keys(config.networks ?? {}), ["default"]);
  assert.equal(config.networks.default.name, "dev-backend_default");
  assert.ok(service.ports?.length === 1, "One loopback publication required");
  const port = service.ports[0];
  assert.ok(
    port.host_ip === "127.0.0.1" &&
      port.target === 8787 &&
      String(port.published) === "8787" &&
      port.protocol === "tcp",
    "Exact Bridge loopback port required",
  );
}
console.log(
  "PASS: immutable DEV image, exclusive rotated credential and network profile",
);
