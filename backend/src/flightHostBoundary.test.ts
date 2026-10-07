import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, it, expect, vi } from "vitest";
import * as live from "./flightLiveHost";
import * as custody from "./flightPrivateCustody";
import * as https from "./flightHttpsTransport";
import * as persistence from "./externalIntegrationPersistence";
const prefix = "OTR_DEV_FLIGHT_";
describe("production/test root isolation", () => {
  it("exact plain production fields reach the legitimate configuration gate", async () => {
    const get = vi.fn(() => undefined);
    expect(
      await live.createDevFlightLiveHost({
        environment: "DEV",
        getEnvironment: get,
        acceptance: {} as never,
        custodyDirectory: "/synthetic-not-admitted",
        provisioning: {} as never,
      }),
    ).toEqual({ status: "CLOSED" });
    expect(get).toHaveBeenCalledExactlyOnceWith("OTR_DEV_FLIGHT_WORKLOAD_SESSION_REF");
  });
  it.each([
    "enumerable unknown",
    "hidden fetch",
    "hidden protocolTestCustody",
    "symbol transport",
    "symbol fetch getter",
    "inherited fetch",
    "inherited protocolTestCustody",
    "inherited unknown",
    "class instance",
    "inherited getter",
    "own configuration accessor",
    "hidden acceptance accessor",
    "unknown accessor",
    "proxy",
    "revoked proxy",
    "null prototype",
    "ordinary prototype hidden unknown",
    "ordinary prototype capability getter",
  ])("strict plain-data input rejects %s before capabilities", async (vector) => {
    const get = vi.fn(() => "vault:synthetic");
    const accessor = vi.fn(() => get);
    const handoff = vi.fn();
    const input: Record<PropertyKey, unknown> = {
      environment: "DEV",
      getEnvironment: get,
      acceptance: {},
      custodyDirectory: "/synthetic-not-admitted",
      provisioning: { session: { execute: handoff }, verify: handoff },
    };
    let candidate: unknown = input;
    if (vector === "enumerable unknown") input.transport = handoff;
    if (vector.startsWith("hidden ") && vector !== "hidden acceptance accessor")
      Object.defineProperty(input, vector.slice(7), { value: handoff });
    if (vector === "symbol transport") input[Symbol("transport")] = handoff;
    if (vector === "symbol fetch getter")
      Object.defineProperty(input, Symbol("fetch"), { get: accessor });
    if (
      ["inherited fetch", "inherited protocolTestCustody", "inherited unknown"].includes(
        vector,
      )
    )
      Object.setPrototypeOf(input, { [vector.slice(10)]: handoff });
    if (vector === "class instance") {
      class Configuration {}
      candidate = Object.assign(new Configuration(), input);
    }
    if (vector === "inherited getter")
      Object.setPrototypeOf(input, Object.defineProperty({}, "fetch", { get: accessor }));
    if (
      [
        "own configuration accessor",
        "hidden acceptance accessor",
        "unknown accessor",
      ].includes(vector)
    )
      Object.defineProperty(
        input,
        vector === "own configuration accessor"
          ? "getEnvironment"
          : vector === "hidden acceptance accessor"
            ? "acceptance"
            : "custody",
        { get: accessor },
      );
    if (vector === "proxy")
      candidate = new Proxy(input, {
        getPrototypeOf: accessor,
        ownKeys: accessor as never,
        get: accessor,
      });
    if (vector === "revoked proxy") {
      const revoked = Proxy.revocable(input, {});
      revoked.revoke();
      candidate = revoked.proxy;
    }
    if (vector === "null prototype") Object.setPrototypeOf(input, null);
    if (vector === "ordinary prototype hidden unknown")
      // eslint-disable-next-line no-extend-native -- deliberate prototype-pollution attack; restored below.
      Object.defineProperty(Object.prototype, "unknownLiveField", {
        value: handoff,
        configurable: true,
      });
    if (vector === "ordinary prototype capability getter")
      // eslint-disable-next-line no-extend-native -- deliberate prototype-pollution attack; restored below.
      Object.defineProperty(Object.prototype, "fetch", {
        get: accessor,
        configurable: true,
      });
    const admission = vi.spyOn(custody, "createFlightPrivateCustody");
    const transport = vi.spyOn(https, "createFlightHttpsSend");
    const gateway = vi.spyOn(persistence, "createClosedPersistenceGateway");
    const network = vi.spyOn(globalThis, "fetch");
    try {
      await expect(live.createDevFlightLiveHost(candidate as never)).rejects.toThrow(
        "LIVE_HOST_INPUT_CLOSED",
      );
      for (const spy of [get, accessor, handoff, admission, transport, gateway, network])
        expect(spy).not.toHaveBeenCalled();
      // No configuration reads includes zero dedicated secret-key reads.
      expect(get.mock.calls).toEqual([]);
    } finally {
      Reflect.deleteProperty(Object.prototype, "unknownLiveField");
      Reflect.deleteProperty(Object.prototype, "fetch");
      vi.restoreAllMocks();
    }
  });
  it.each([
    {},
    { REMOTE_TRANSPORT: "enabled" },
    { KEY: "FAKE_UNIT_KEY" },
    { PRIVATE_CUSTODY: "/absent" },
    { WORKLOAD_SESSION_REF: "vault:synthetic" },
    { REMOTE_TRANSPORT: "enabled", ONE_SHOT: "enabled", KEY: "FAKE_UNIT_KEY" },
    { REMOTE_TRANSPORT: "enabled", ENVIRONMENT: "PRODUCTION", TEST: "enabled" },
  ])("normal startup remains CLOSED: %s", async (flags) => {
    let reads = 0;
    expect(
      await live.initializeDevFlightLiveHost((key) => {
        reads++;
        return (flags as Record<string, string>)[key.replace(prefix, "")];
      }),
    ).toEqual({ status: "CLOSED" });
    expect(reads).toBe(0);
  });
  it("production exports/config cannot substitute capabilities; fixtures never import live constructors", async () => {
    expect(Object.keys(live).sort()).toEqual(
      [
        "FLIGHT_MODEL_CONFORMANCE",
        "createDevFlightEnvironmentResolver",
        "createDevFlightLiveHost",
        "initializeDevFlightLiveHost",
      ].sort(),
    );
    const fixture = await readFile(
      "backend/src/__fixtures__/flightProtocolHost.ts",
      "utf8",
    );
    expect(fixture).not.toMatch(/from ["'].*(?:flightLiveHost|flightHttpsTransport)["']/);
    expect(fixture).not.toContain("createDevFlightEnvironmentResolver");
    expect(fixture).not.toContain("createFlightHttpsSend");
    const shared = await readFile("backend/src/flightHostProtocol.ts", "utf8");
    expect(shared).not.toContain("createFlightHostProtocol");
    expect(shared).not.toContain("globalThis.fetch");
    const server = await readFile("backend/src/server.ts", "utf8");
    expect(server).not.toContain("__fixtures__");
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    expect(pkg.exports).toBeUndefined();
    for (const key of [
      "fetch",
      "protocolTestCustody",
      "custody",
      "transport",
      "resolver",
      "linuxCapability",
    ]) {
      await expect(
        live.createDevFlightLiveHost({
          environment: "DEV",
          getEnvironment: () => "enabled",
          [key]: {},
        } as never),
      ).rejects.toThrow("LIVE_HOST_INPUT_CLOSED");
    }
  });
  it("compiled server bundle contains no portable root or bypass path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "r1-bundle-"));
    try {
      const result = await build({
        entryPoints: ["backend/src/server.ts"],
        bundle: true,
        platform: "node",
        target: "node24",
        format: "esm",
        alias: { "@": "./src" },
        outfile: join(dir, "server.mjs"),
        metafile: true,
      });
      expect(
        Object.keys(result.metafile!.inputs).filter((path) =>
          /__fixtures__|\.test\./.test(path),
        ),
      ).toEqual([]);
      const code = await readFile(join(dir, "server.mjs"), "utf8");
      for (const token of [
        "protocolTestCustody",
        "PROTOCOL_TEST_TRANSPORT_REQUIRED",
        "createFlightProtocolTestHost",
        "fixtureResponse",
        "assembleFixture",
      ])
        expect(code).not.toContain(token);
      expect(code).not.toMatch(/fetch\s*[!=]==?\s*globalThis\.fetch/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
