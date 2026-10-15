import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checker = fileURLToPath(
  new URL("./backend-host-image-check.mjs", import.meta.url),
);
const accepted = `sha256:${"a".repeat(64)}`;
const old = `sha256:${"b".repeat(64)}`;
const valid = {
  name: "dev-backend",
  services: {
    backend: {
      image: accepted,
      network_mode: "host",
      environment: {
        OTR_DEV_BACKEND_NETWORK_MODE: "host",
        OTR_DEV_BACKEND_BIND_ADDRESS: "127.0.0.1",
        OTR_DEV_BACKEND_PORT: "8787",
      },
      env_file: [{ path: "/opt/otr/dev-backend/env/backend.rotated.env" }],
    },
  },
};
function check(
  config,
  reviewed = accepted,
  credential = "/opt/otr/dev-backend/env/backend.rotated.env",
  direction = "host",
) {
  return spawnSync(
    process.execPath,
    [checker, reviewed, old, credential, direction],
    {
      input: JSON.stringify(config),
      encoding: "utf8",
    },
  ).status;
}
test("accepts exact reviewed image and resolved DEV host profile", () => {
  assert.equal(check(valid), 0);
});
for (const [label, change, reviewed] of [
  [
    "mutable tag",
    (c) => {
      c.services.backend.image = "dev-backend-backend";
    },
  ],
  ["mutable reviewed reference", () => {}, "dev-backend-backend"],
  [
    "old wildcard image",
    (c) => {
      c.services.backend.image = old;
    },
    old,
  ],
  [
    "wrong staged image",
    (c) => {
      c.services.backend.image = old;
    },
  ],
  [
    "bridge merge ports",
    (c) => {
      c.services.backend.ports = [{ target: 8787 }];
    },
  ],
  [
    "wildcard bind",
    (c) => {
      c.services.backend.environment.OTR_DEV_BACKEND_BIND_ADDRESS = "0.0.0.0";
    },
  ],
  [
    "other project",
    (c) => {
      c.name = "otr";
    },
  ],
  [
    "unrelated service",
    (c) => {
      c.services.media = {};
    },
  ],
  [
    "wrong environment file",
    (c) => {
      c.services.backend.env_file[0].path = "/opt/otr/env/backend.rotated.env";
    },
  ],
]) {
  test(`rejects ${label} before any deployment operation`, () => {
    const config = structuredClone(valid);
    change(config);
    assert.notEqual(check(config, reviewed), 0);
  });
}

test("rejects resolved secrets without printing their values", () => {
  const config = structuredClone(valid);
  config.services.backend.environment.OTR_DEV_SUPABASE_SECRET_KEY =
    "NONSECRET_LOG_SENTINEL";
  const result = spawnSync(
    process.execPath,
    [checker, accepted, old, "/opt/otr/dev-backend/env/backend.rotated.env"],
    {
      input: JSON.stringify(config),
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.stderr.includes("NONSECRET_LOG_SENTINEL"));
});

const credential = "/opt/otr/dev-backend/env/backend.rotated.env";
const bridge = structuredClone(valid);
bridge.services.backend.image = old;
delete bridge.services.backend.network_mode;
delete bridge.services.backend.environment;
bridge.services.backend.networks = { default: null };
bridge.networks = { default: { name: "dev-backend_default" } };
bridge.services.backend.ports = [
  { host_ip: "127.0.0.1", target: 8787, published: "8787", protocol: "tcp" },
];
test("rollback retains rotated selection and exact Bridge image/network", () => {
  assert.equal(check(bridge, accepted, credential, "bridge"), 0);
});
for (const [direction, baseline] of [
  ["host", valid],
  ["bridge", bridge],
]) {
  for (const [label, change] of [
    [
      "exposed original",
      (c) => {
        c.services.backend.env_file = [
          { path: "/opt/otr/dev-backend/env/backend.env" },
        ];
      },
    ],
    [
      "missing override",
      (c) => {
        delete c.services.backend.env_file;
      },
    ],
    [
      "mixed files",
      (c) => {
        c.services.backend.env_file.push({
          path: "/opt/otr/dev-backend/env/backend.env",
        });
      },
    ],
    [
      "stale selection",
      (c) => {
        c.services.backend.env_file[0].path =
          "/opt/otr/dev-backend/env/backend.rotated.stale.env";
      },
    ],
    [
      "optional missing credential",
      (c) => {
        c.services.backend.env_file[0].required = false;
      },
    ],
    [
      "conflicting override image",
      (c) => {
        c.services.backend.image = direction === "host" ? old : accepted;
      },
    ],
  ]) {
    test(`${direction} rejects ${label}`, () => {
      const c = structuredClone(baseline);
      change(c);
      assert.notEqual(check(c, accepted, credential, direction), 0);
    });
  }
}
test("explicit approved future rotation selection is supported", () => {
  const c = structuredClone(valid),
    next = "/opt/otr/dev-backend/env/backend.rotated.next.env";
  c.services.backend.env_file = [{ path: next }];
  assert.equal(check(c, accepted, next), 0);
});
for (const input of [
  undefined,
  "/opt/otr/dev-backend/env/backend.env",
  "/tmp/backend.rotated.env",
  "/opt/otr/dev-backend/env/../backend.rotated.env",
]) {
  test(`rejects unapproved credential contract ${input ?? "missing"}`, () => {
    const result = spawnSync(
      process.execPath,
      [checker, accepted, old, ...(input ? [input] : [])],
      { input: JSON.stringify(valid) },
    );
    assert.notEqual(result.status, 0);
  });
}
for (const [label, mutate] of [
  [
    "host networking",
    (c) => {
      c.services.backend.network_mode = "host";
    },
  ],
  [
    "wildcard publishing",
    (c) => {
      c.services.backend.ports[0].host_ip = "0.0.0.0";
    },
  ],
  [
    "additional network",
    (c) => {
      c.services.backend.networks.other = null;
    },
  ],
  [
    "extra HTTP override",
    (c) => {
      c.services.backend.environment = { OTR_DEV_BACKEND_NETWORK_MODE: "host" };
    },
  ],
]) {
  test(`rollback rejects ${label}`, () => {
    const c = structuredClone(bridge);
    mutate(c);
    assert.notEqual(check(c, accepted, credential, "bridge"), 0);
  });
}

const capture = structuredClone(valid);
capture.services.backend.command = ["node", "server-capture.mjs"];
capture.services.backend.cap_drop = ["ALL"];
capture.services.backend.volumes = [
  {
    type: "bind",
    source: "/opt/otr/dev-backend/private/capture-custody",
    target: "/var/lib/otr/capture-custody",
    bind: { create_host_path: false },
  },
  {
    type: "bind",
    source: "/opt/otr/dev-backend/env/capture-custody.json",
    target: "/run/otr/capture-custody.json",
    read_only: true,
    bind: { create_host_path: false },
  },
  {
    type: "bind",
    source: "/run/otr-r3a5-catalog/catalog-reader.json",
    target: "/run/otr/catalog-reader.json",
    read_only: true,
    bind: { create_host_path: false },
  },
];
test("Capture profile retains exact host/credential/image checks and only its command/two Capture mounts plus retained Reader", () => {
  assert.equal(check(capture, accepted, credential, "capture"), 0);
  assert.notEqual(check(valid, accepted, credential, "capture"), 0);
});
for (const [name, mutate] of [
  [
    "entrypoint override",
    (c) => {
      c.services.backend.entrypoint = ["node", "server.mjs"];
    },
  ],
  [
    "command",
    (c) => {
      c.services.backend.command = ["node", "other.mjs"];
    },
  ],
  [
    "extra mount",
    (c) => {
      c.services.backend.volumes.push({
        ...c.services.backend.volumes[0],
        target: "/elsewhere",
      });
    },
  ],
  [
    "wrong source",
    (c) => {
      c.services.backend.volumes[0].source = "/somewhere";
    },
  ],
  [
    "duplicate target",
    (c) => {
      c.services.backend.volumes[1].target =
        c.services.backend.volumes[0].target;
    },
  ],
  [
    "auto-created root",
    (c) => {
      c.services.backend.volumes[0].bind.create_host_path = true;
    },
  ],
  [
    "writable attestation",
    (c) => {
      c.services.backend.volumes[1].read_only = false;
    },
  ],
  [
    "readonly metadata root",
    (c) => {
      c.services.backend.volumes[0].read_only = true;
    },
  ],
  [
    "extra bind option",
    (c) => {
      c.services.backend.volumes[0].bind.propagation = "shared";
    },
  ],
  [
    "capabilities",
    (c) => {
      c.services.backend.cap_drop = [];
    },
  ],
  [
    "wrong environment",
    (c) => {
      c.services.backend.environment.OTR_DEV_BACKEND_BIND_ADDRESS = "0.0.0.0";
    },
  ],
  [
    "wrong credential",
    (c) => {
      c.services.backend.env_file = [];
    },
  ],
])
  test(`Capture rejects ${name}`, () => {
    const c = structuredClone(capture);
    mutate(c);
    assert.notEqual(check(c, accepted, credential, "capture"), 0);
  });
test("Capture malformed command does not print private argument values", () => {
  const c = structuredClone(capture);
  c.services.backend.command.push("NONSECRET_CAPTURE_SENTINEL");
  const result = spawnSync(
    process.execPath,
    [checker, accepted, old, credential, "capture"],
    { input: JSON.stringify(c), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.stderr.includes("NONSECRET_CAPTURE_SENTINEL"));
});

for (const [name, mutate] of [
  ["missing retained Reader", c => { c.services.backend.volumes.pop(); }],
  ["different Reader source", c => { c.services.backend.volumes[2].source = "/tmp/catalog-reader.json"; }],
  ["writable Reader", c => { c.services.backend.volumes[2].read_only = false; }],
  ["auto-created Reader", c => { c.services.backend.volumes[2].bind.create_host_path = true; }],
]) {
  test(`Capture rejects ${name}`, () => {
    const c = structuredClone(capture);
    mutate(c);
    assert.notEqual(check(c, accepted, credential, "capture"), 0);
  });
}
