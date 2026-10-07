import { createFlightProtocolTestHost } from "./__fixtures__/flightProtocolHost";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createDevFlightLiveHost,
  initializeDevFlightLiveHost,
  createDevFlightEnvironmentResolver,
  FLIGHT_MODEL_CONFORMANCE,
  type FlightAcceptance,
} from "./flightLiveHost";
import { createProtocolTestCustody } from "./__fixtures__/flightProtocolCustody";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import {
  flightRemoteRequestMaterial,
  flightReservationCommand,
} from "./flightDevDispatch";
import { verifiedCallContextSchema } from "./externalIntegrationPersistence";
import { fixtureHash, remoteFixture } from "./__fixtures__/flightRemote";
import { advanceAccountGeneration } from "../../src/data/auth/accountGeneration";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { admittedFlightBatch } from "../../src/data/interpretation/__fixtures__/flightInterpretation";
import {
  interpretRemoteFlightBatch,
  flightInterpretationConfiguration,
} from "../../src/data/interpretation/flightInterpretation";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import type { Json } from "../../src/domain/trip/eventIntentJson";
import {
  flightRemoteRequestDigest,
  minimizeFlightRemoteText,
  remoteFlightConfigurationPins,
  flightRemoteExecutionPins,
} from "../../src/domain/intelligence/remoteFlightText";
import { flightUsageCommand } from "./flightUsage";
const server84 = (mode: string, value: unknown) =>
  JSON.parse(
    execFileSync("python3", ["scripts/cp15/live-w-server84-fixture.py", mode], {
      input: JSON.stringify(value),
      encoding: "utf8",
    }),
  );
const source =
  "Flight=ZZ901; operating=YY902; route=AKL→CHC; date=2027-02-03; dep=~10:30; arr=12:00";
const roots: string[] = [];
const handles: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(handles.splice(0).map((close) => close()));
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function setup(mode = "success", model: unknown = "deepseek-flash") {
  const batch = await admittedFlightBatch([source]);
  const remote = await remoteFixture(source);
  batch.request.binding.privacy = "REMOTE_ALLOWED";
  batch.request.binding.contract_version = "otr-intelligence-flight-remote-v2";
  batch.request.binding.descriptor = remote.descriptor;
  batch.request.binding.deadline = "2070-01-01T00:00:00Z";
  const liveSQL =
    mode === "server84"
      ? server84("init", {
          account: batch.request.binding.account_id,
          trip: batch.request.binding.trip_id,
          remote: remote.descriptor.remote,
          pins: flightRemoteExecutionPins(remote.descriptor),
        })
      : null;
  if (liveSQL)
    Object.assign(remote.descriptor.remote, {
      scope_sha256: liveSQL.scope.scope_sha256,
      provider_config_id: liveSQL.provider.provider_config_id,
      price_schedule_id: liveSQL.price.price_schedule_id,
    });
  remote.descriptor.configuration_sha256 = await importDigest(
    "otr-flight-interpretation-config-v1",
    {
      matching: flightInterpretationConfiguration(batch),
      descriptor: remoteFlightConfigurationPins(remote.descriptor),
    } as unknown as Json,
    fixtureHash,
  );
  remote.descriptor.remote.request_sha256 = await flightRemoteRequestDigest(
    batch.request,
    fixtureHash,
  );
  const envelope = await minimizeFlightRemoteText(batch.request, fixtureHash);
  const f = await flightExecutorFixture(mode, source, {
    ...remote,
    request: batch.request,
    envelope,
    host: {
      ...remote.host,
      verified_actor_id: batch.request.binding.account_id,
      verified_account_id: batch.request.binding.account_id,
      request_id: batch.request.binding.request_id,
    },
  });
  if (liveSQL) {
    f.a.config_version = String(liveSQL.integration.config_version);
    f.a.configuration_sha256 = liveSQL.integration.config_sha256;
    f.command = flightReservationCommand(f.a, f.envelope, {
      integration_version: liveSQL.integration.config_version,
      grant_revision: 1,
      trip_id: f.request.binding.trip_id,
      import_id: f.command.row.import_id,
      currency: "USD",
    });
  }
  const base = process.platform === "linux" ? "/custody-tests" : tmpdir();
  const directory = await mkdtemp(join(base, "live-w-private-"));
  roots.push(directory);
  const env: Record<string, string | undefined> = {
    OTR_DEV_FLIGHT_REMOTE_TRANSPORT: "enabled",
    OTR_DEV_FLIGHT_ONE_SHOT: "enabled",
    OTR_DEV_DEEPSEEK_API_KEY: "FAKE_DEDICATED_LIVE_W_KEY",
    OTR_DEV_FLIGHT_WORKLOAD_SESSION_REF: "vault:synthetic",
    OTR_DEV_FLIGHT_SQL_SESSION_REF: "vault:synthetic-dedicated-sql",
  };
  const acceptance: FlightAcceptance = {
    session_id: randomUUID(),
    account_id: f.a.account_id,
    task_id: f.a.task_id,
    attempt_id: f.a.attempt_id,
    call_id: f.a.usage_correlation_id!,
    request_sha256: f.a.request_sha256,
  };
  const host = {
    ...f.host,
    auth_source: "NETWORK_DENIED_TRUSTED_FIXTURE",
    auth_session_reference: "vault:synthetic",
    request_sha256: f.command.request_sha256,
  };
  const st = await stat(directory, { bigint: true });
  const identity = {
    store_id: randomUUID(),
    device: st.dev.toString(),
    inode: st.ino.toString(),
  };
  await writeFile(
    join(directory, "store-identity.json"),
    JSON.stringify({ version: 1, store_id: identity.store_id }),
    { mode: 0o600 },
  );
  const stores =
    process.platform === "linux"
      ? await createFlightPrivateCustody(directory, identity)
      : await createProtocolTestCustody(directory);
  handles.push(stores.close);
  const bytes = flightRemoteRequestMaterial(f.request, f.envelope);
  await stores.custody.put({
    accountId: f.a.account_id,
    reservationId: f.a.request_material_reference!,
    sha256: await fixtureHash(bytes),
    byteCount: bytes.length,
    bytes,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) => {
    expect(options?.redirect).toBe("error");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer FAKE_DEDICATED_LIVE_W_KEY",
    });
    return new Response(
      JSON.stringify({
        id: "chatcmpl-local-live-w",
        ...(model === undefined ? {} : { model }),
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify(f.output) } },
        ],
        usage: {
          prompt_tokens: 100,
          prompt_cache_hit_tokens: 0,
          prompt_cache_miss_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
        },
      }),
      { status: 200 },
    );
  });
  const provisioning = {
    custody: {
      identity,
      requiredRequest: {
        accountId: f.a.account_id,
        reference: f.a.request_material_reference!,
        sha256: await fixtureHash(bytes),
        byteCount: bytes.length,
      },
    },
    verify: async (r: { requestId: string; requestSha256: string; command: string }) =>
      verifiedCallContextSchema.parse({
        ...host,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    session: {
      identity: async () => ({
        session_user: "otr_external_integration_call_gateway",
        environment: "DEV" as const,
        primary: true as const,
        session_reference: "vault:synthetic-dedicated-sql",
      }),
      execute: async (
        kind: Parameters<typeof f.deps.gateway.invoke>[0],
        _context: unknown,
        command: Readonly<Record<string, unknown>>,
      ) =>
        liveSQL
          ? server84("invoke", { kind, context: _context, command })
          : f.deps.gateway.invoke(kind, command as Record<string, unknown>),
    },
    workflow: {
      ...f.deps,
      readStart: async () =>
        liveSQL ? server84("start", { call: acceptance.call_id }) : f.deps.readStart(),
      appendMeter: liveSQL
        ? async (
            a: typeof f.a,
            result: Parameters<typeof flightUsageCommand>[1],
            report: Parameters<typeof flightUsageCommand>[2],
          ) => {
            const command = flightUsageCommand(
              a,
              result,
              report,
              {
                id: liveSQL.price.price_schedule_id,
                sha256: "a".repeat(64),
                currency: "USD",
                units: ["input_tokens", "cached_input_tokens", "output_tokens"].map(
                  (measurement_unit) => ({
                    measurement_unit: measurement_unit as "input_tokens",
                    unit_quantity: 1000,
                    price_per_quantity: "0.000001",
                    relationship: "DISJOINT" as const,
                    billable: true,
                  }),
                ),
              },
              {
                id: randomUUID(),
                request_id: randomUUID(),
                at: new Date().toISOString(),
              },
            );
            const context = await provisioning.verify({
              requestId: command.request_id,
              requestSha256: command.request_sha256,
              command: "external_integration_usage_append",
            });
            await provisioning.session.execute(
              "external_integration_usage_append",
              context,
              command,
            );
          }
        : f.deps.appendMeter,
      interpret: async (_request: unknown, response: unknown) =>
        interpretRemoteFlightBatch(batch, {
          sha256: fixtureHash,
          getAccountId: async () => batch.request.binding.account_id,
          now: () => "2026-10-07T00:00:00Z",
          plugin: async () => response as never,
        }),
      load: async () => ({
        ...(await f.deps.load()),
        command: f.command,
        host,
        deadline: performance.now() + 30000,
      }),
    },
  };
  const input = {
    environment: "DEV" as const,
    getEnvironment: (key: string) => env[key],
    acceptance,
    custodyDirectory: directory,
    provisioning,
    fixtureResponse: fetch,
    stores,
  };
  const restart = async () => {
    const root = await createFlightProtocolTestHost(input);
    if (root.status === "CONFIGURED") handles.push(root.close);
    return root;
  };
  const root = await restart();
  if (root.status !== "CONFIGURED") throw new Error("TEST_SETUP");
  return { ...f, env, host, input, directory, acceptance, fetch, root, restart };
}
describe("live filesystem platform boundary", () => {
  it.skipIf(process.platform === "linux")(
    "unsupported OS denies before filesystem or secret access",
    async () => {
      await expect(
        createFlightPrivateCustody("/unused", {
          store_id: randomUUID(),
          device: "1",
          inode: "1",
        }),
      ).rejects.toThrow("CUSTODY_PLATFORM_CLOSED");
    },
  );
});
describe("LIVE-W production host with denied external network", () => {
  it.skipIf(process.env.LIVE_W_SERVER84 !== "1")(
    "actual disposable Server84 reserve/START/hold/mark → production transport → CP13B → durable recovery/install seam",
    async () => {
      const f = await setup("server84");
      await f.root.factory.executor(f.context).prepareUsage(f.a);
      const report = await f.root.factory.executor(f.context).execute(f.a);
      expect(report.execution_outcome).toBe("SUCCEEDED");
      expect(report.metering_disposition).toBe("COMPLETE");
      const server = server84("readback", { call: f.acceptance.call_id });
      expect(server).toMatchObject({
        starts: 1,
        holds: 1,
        dispatch_state: "MAY_HAVE_STARTED",
      });
      expect(server.usage.cost_quality).toBe("ESTIMATED");
      expect(f.fetch).toHaveBeenCalledTimes(1);
      Object.assign(f.a, {
        response_material_reference: report.response_material_reference,
        response_material_sha256: report.response_material_sha256,
        response_sha256: report.response_sha256,
      });
      const restarted = await f.restart();
      if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
      await expect(restarted.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(
        (await restarted.factory.recover(f.context, f.a.attempt_id)).interpretation
          .candidates,
      ).toHaveLength(1);
      const publicationId = randomUUID();
      const install = vi.fn(async () => {});
      await restarted.factory.install(
        f.context,
        f.a.attempt_id,
        publicationId,
        "a".repeat(64),
        install,
      );
      expect(f.repo.installResult).toHaveBeenCalledWith(
        f.context,
        f.a.attempt_id,
        f.a.row_revision,
        publicationId,
        "a".repeat(64),
        install,
      );
      expect(f.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["A", "B", "C", "D", "E", "F", "G"])(
    "production rejects reviewer bypass %s before handoff",
    async (vector) => {
      const f = await setup();
      const native = globalThis.fetch;
      const wrappers: Record<string, typeof fetch> = {
        A: native,
        B: (...args) => native(...args),
        C: native.bind(globalThis),
        D: new Proxy(native, {
          apply: (target, receiver, args) => Reflect.apply(target, receiver, args),
        }),
        E: (...args) => Promise.resolve().then(() => native(...args)),
        F: (...args) => native(...args),
        G: (...args) => native(...args),
      };
      const handoff = vi.fn(wrappers[vector]);
      const get = vi.fn(f.input.getEnvironment);
      await expect(
        createDevFlightLiveHost({
          environment: "DEV",
          getEnvironment: get,
          acceptance: f.acceptance,
          custodyDirectory: vector === "F" ? f.directory + "-absent" : f.directory,
          provisioning:
            vector === "G"
              ? {
                  ...f.input.provisioning,
                  custody: {
                    ...f.input.provisioning.custody,
                    identity: { store_id: randomUUID(), device: "0", inode: "0" },
                  },
                }
              : f.input.provisioning,
          fetch: handoff,
          protocolTestCustody: f.input.stores,
        } as Parameters<typeof createDevFlightLiveHost>[0]),
      ).rejects.toThrow("LIVE_HOST_INPUT_CLOSED");
      expect(handoff).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.skipIf(process.platform !== "linux")(
    "production chain requires admitted identity/request and reaches only denied native handoff",
    async () => {
      const f = await setup();
      const input = {
        environment: "DEV" as const,
        getEnvironment: f.input.getEnvironment,
        acceptance: f.acceptance,
        custodyDirectory: f.directory,
        provisioning: f.input.provisioning,
      };
      await expect(
        createDevFlightLiveHost({ ...input, custodyDirectory: f.directory + "-absent" }),
      ).rejects.toThrow();
      await expect(
        createDevFlightLiveHost({
          ...input,
          provisioning: {
            ...input.provisioning,
            custody: {
              ...input.provisioning.custody,
              identity: { store_id: randomUUID(), device: "0", inode: "0" },
            },
          },
        }),
      ).rejects.toThrow("CUSTODY_CONTINUITY_CLOSED");
      const root = await createDevFlightLiveHost(input);
      if (root.status !== "CONFIGURED") throw new Error("TEST_SETUP");
      handles.push(root.close);
      expect(Object.isFrozen(root.acceptance)).toBe(true);
      // Test process global networking is explicitly denied; no factory transport override.
      const report = await root.factory.executor(f.context).execute(f.a);
      expect(report.execution_observation).toBe("UNKNOWN");
      expect(root.sendCount()).toBe(1);
      await expect(root.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );
  it("unconfigured startup reads no secret, creates no custody, sends nothing", async () => {
    const get = vi.fn(() => undefined);
    expect(await initializeDevFlightLiveHost(get)).toEqual({ status: "CLOSED" });
    expect(get.mock.calls.flat()).not.toContain("OTR_DEV_DEEPSEEK_API_KEY");
    expect(
      await createDevFlightLiveHost({
        environment: "DEV",
        getEnvironment: () => "enabled",
      }),
    ).toEqual({ status: "CLOSED" });
  });
  it("restart before mark is passive; a missing custody mount fails closed", async () => {
    const f = await setup();
    const restarted = await f.restart();
    expect(restarted.status).toBe("CONFIGURED");
    expect(f.fetch).not.toHaveBeenCalled();
    await expect(
      createDevFlightLiveHost({
        environment: "DEV",
        getEnvironment: f.input.getEnvironment,
        acceptance: f.acceptance,
        provisioning: f.input.provisioning,
        custodyDirectory: join(f.directory, "missing-mount"),
      }),
    ).rejects.toThrow(
      process.platform === "linux" ? undefined : "CUSTODY_PLATFORM_CLOSED",
    );
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["TEST", "PRODUCTION"] as const)(
    "%s rejects manually enabled host and resolver",
    async (environment) => {
      const f = await setup();
      await expect(
        createFlightProtocolTestHost({ ...f.input, environment }),
      ).rejects.toThrow("LIVE_HOST_CLOSED");
      expect(() =>
        createDevFlightEnvironmentResolver(
          environment,
          f.input.getEnvironment,
          f.acceptance,
        ),
      ).toThrow("LIVE_HOST_CLOSED");
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );
  it("exact LIVE-0 spans → protected mark → one intercepted send → durable raw/result → safe readback", async () => {
    const f = await setup();
    expect(f.request.materials[0].pin.payload_sha256).toBe(
      "2c9b62e82d6740911fea8f61b18e27171a91a1ed79057de728b71ba0effd1a27",
    );
    expect(f.envelope.spans).toHaveLength(6);
    expect(f.output.items[0].fields).toHaveLength(8);
    await f.root.factory.executor(f.context).prepareUsage(f.a);
    const report = await f.root.factory.executor(f.context).execute(f.a);
    expect(report.execution_outcome).toBe("SUCCEEDED");
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const restarted = await f.restart();
    if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
    const stored = await restarted.factory.recover(f.context, f.a.attempt_id);
    expect(stored.interpretation.candidates).toHaveLength(1);
    expect(stored.interpretation.fragments).toHaveLength(6);
    const fields = stored.interpretation.candidates[0].proposal.fields;
    expect(fields.services.proposed_value).toMatchObject([
      { operator_value: "ZZ", service_number: "901", attribution: "MARKETING" },
      { operator_value: "YY", service_number: "902", attribution: "OPERATING" },
    ]);
    expect(fields.origin.proposed_value.time.local_date).toBe("2027-02-03");
    expect(fields.destination.proposed_value.time.local_date).toBeNull();
    const occurrence = stored.interpretation.candidates[0].occurrence;
    expect(occurrence["origin.local_time"].value).toMatchObject({
      value: "10:30",
      quality: "ESTIMATED",
    });
    expect(occurrence["destination.local_time"].value).toMatchObject({
      value: "12:00",
      quality: "EXACT",
    });
    for (const role of ["origin", "destination"]) {
      expect(fields[role].proposed_value.time.zone_id).toBeNull();
      expect(fields[role].proposed_value.time.source_instant).toBeNull();
    }
    expect(stored.interpretation).not.toHaveProperty("command");
    expect(stored.result.model_witness).toEqual({
      policy: FLIGHT_MODEL_CONFORMANCE.version,
      returned_model: "deepseek-flash",
      accepted: true,
    });
    await expect(restarted.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const safe = await restarted.readback(f.context);
    expect(JSON.stringify(safe)).not.toContain(source);
    expect(JSON.stringify(safe)).not.toContain("FAKE_DEDICATED");
    const files = await readdir(f.directory);
    expect(files.some((name) => name.startsWith("raw-"))).toBe(true);
    for (const name of files)
      expect(await readFile(join(f.directory, name), "utf8")).not.toContain(
        "FAKE_DEDICATED",
      );
  });
  it.each(["unknown-model", "", undefined, "evil\nmodel"])(
    "missing/mismatched bounded witness rejects success and preserves usage (%s)",
    async (model) => {
      const f = await setup("success", model === undefined ? null : model);
      const report = await f.root.factory.executor(f.context).execute(f.a);
      expect(report.execution_outcome).toBe("FAILED");
      expect(report.reported_usage_summary?.input_tokens).toBe(100);
      expect(f.fetch).toHaveBeenCalledTimes(1);
      const stored = await f.root.factory.recover(f.context, f.a.attempt_id);
      expect(stored.interpretation).toBeNull();
      expect(stored.result.model_witness.accepted).toBe(false);
    },
  );
  it.each([
    "lost-ack",
    "account-aba",
    "kill",
    "grant",
    "budget",
    "config",
    "scope",
    "trip",
  ])("%s denies sends, preserves responsibility, restart never resends", async (mode) => {
    const f = await setup(mode);
    const report = await f.root.factory.executor(f.context).execute(f.a);
    expect(report.execution_observation).toBe("UNKNOWN");
    expect(f.fetch).not.toHaveBeenCalled();
    const restarted = await f.restart();
    if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
    await expect(restarted.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "", " ", "key\nvalue"])(
    "missing/invalid fake secret denies reservation (%s)",
    async (key) => {
      const f = await setup();
      f.env.OTR_DEV_DEEPSEEK_API_KEY = key;
      await expect(f.root.factory.executor(f.context).prepareUsage(f.a)).rejects.toThrow(
        "AUTH_FAILED",
      );
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );
  it("missing retained request closes construction before secret or HTTP", async () => {
    const f = await setup();
    const get = vi.fn((key: string) => f.env[key]);
    await expect(
      createFlightProtocolTestHost({
        ...f.input,
        getEnvironment: get,
        provisioning: {
          ...f.input.provisioning,
          custody: {
            ...f.input.provisioning.custody,
            requiredRequest: {
              ...f.input.provisioning.custody.requiredRequest,
              reference: randomUUID(),
            },
          },
        },
      }),
    ).rejects.toThrow();
    expect(get.mock.calls.flat()).not.toContain("OTR_DEV_DEEPSEEK_API_KEY");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("secret rotation before mark denies the send", async () => {
    const f = await setup();
    f.repo.admitExecution.mockImplementationOnce(async (_context, _a, execute) => {
      f.env.OTR_DEV_DEEPSEEK_API_KEY = "ROTATED_FAKE";
      execute();
    });
    await expect(f.root.factory.executor(f.context).execute(f.a)).rejects.toThrow(
      "AUTH_FAILED",
    );
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("closed gate blocks existing composition; same durable session cannot switch call or Account", async () => {
    const f = await setup();
    f.env.OTR_DEV_FLIGHT_REMOTE_TRANSPORT = undefined;
    await expect(f.root.factory.executor(f.context).execute(f.a)).rejects.toThrow(
      "LIVE_HOST_CLOSED",
    );
    expect(f.fetch).not.toHaveBeenCalled();
    f.env.OTR_DEV_FLIGHT_REMOTE_TRANSPORT = "enabled";
    await expect(
      createFlightProtocolTestHost({
        ...f.input,
        acceptance: { ...f.acceptance, call_id: randomUUID() },
      }),
    ).rejects.toThrow("CUSTODY_INTEGRITY");
    await expect(
      createFlightProtocolTestHost({
        ...f.input,
        acceptance: { ...f.acceptance, account_id: randomUUID() },
      }),
    ).rejects.toThrow("CUSTODY_CONTINUITY_CLOSED");
  });
  it.each(["secret", "transport", "one-shot"])(
    "%s closes after mark: UNKNOWN, zero send, no restart replay",
    async (kind) => {
      const f = await setup();
      const execute = f.input.provisioning.session.execute;
      f.input.provisioning.session.execute = async (...args) => {
        const ack = await execute(...args);
        if (args[0] === "external_integration_mark_dispatch") {
          if (kind === "secret") f.env.OTR_DEV_DEEPSEEK_API_KEY = undefined;
          else
            f.env[
              kind === "transport"
                ? "OTR_DEV_FLIGHT_REMOTE_TRANSPORT"
                : "OTR_DEV_FLIGHT_ONE_SHOT"
            ] = undefined;
        }
        return ack;
      };
      const report = await f.root.factory.executor(f.context).execute(f.a);
      expect(report.execution_observation).toBe("UNKNOWN");
      expect(f.fetch).not.toHaveBeenCalled();
      f.env.OTR_DEV_FLIGHT_REMOTE_TRANSPORT = "enabled";
      f.env.OTR_DEV_FLIGHT_ONE_SHOT = "enabled";
      f.env.OTR_DEV_DEEPSEEK_API_KEY = "ROTATED_FAKE";
      const restarted = await f.restart();
      if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
      await expect(restarted.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );
  it("generic service-role session cannot reserve or mark", async () => {
    const f = await setup();
    f.input.provisioning.session.identity = async () => ({
      session_user: "service_role",
      environment: "DEV",
      primary: true,
      session_reference: "vault:synthetic-dedicated-sql",
    });
    await expect(f.root.factory.executor(f.context).prepareUsage(f.a)).rejects.toThrow(
      "LIVE_SESSION_CLOSED",
    );
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["redirect", "oversize", "loss"])(
    "real transport boundary rejects %s without retry",
    async (mode) => {
      const f = await setup();
      f.fetch.mockImplementationOnce(async () => {
        if (mode === "loss") throw new Error("PRIVATE_PROVIDER_ERROR_DO_NOT_LOG");
        const response = new Response(mode === "oversize" ? "x".repeat(131073) : "{}", {
          status: 200,
        });
        if (mode === "redirect")
          Object.defineProperty(response, "redirected", { value: true });
        return response;
      });
      const report = await f.root.factory.executor(f.context).execute(f.a);
      expect(report.execution_outcome).not.toBe("SUCCEEDED");
      expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(await f.root.factory.recover(f.context, f.a.attempt_id)),
      ).not.toContain("PRIVATE_PROVIDER_ERROR");
      await expect(f.root.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(f.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("death after durable raw response recovers CP13B/result without transport replay", async () => {
    const f = await setup();
    await f.root.factory.executor(f.context).execute(f.a);
    // Reproduce the durable subset at process death before the interpreted index write.
    for (const name of await readdir(f.directory))
      if (name.startsWith("result-")) await rm(join(f.directory, name));
    const restarted = await f.restart();
    if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
    const recovered = await restarted.recoverRaw(f.context);
    expect(recovered.interpretation.candidates).toHaveLength(1);
    expect(recovered.result.model_witness.accepted).toBe(true);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    await expect(restarted.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("retained result survives restart; A→B→A and Trip revoke fence disclosure and install", async () => {
    const f = await setup("meter-loss");
    await f.root.factory.executor(f.context).execute(f.a);
    advanceAccountGeneration();
    advanceAccountGeneration();
    const restarted = await f.restart();
    if (restarted.status !== "CONFIGURED") throw new Error("TEST_SETUP");
    await expect(restarted.factory.recover(f.context, f.a.attempt_id)).rejects.toThrow();
    const fresh = await captureAccountRequestContext("", async () => f.a.account_id);
    expect(
      (await restarted.factory.recover(fresh, f.a.attempt_id)).report
        .metering_disposition,
    ).toBe("COMPLETION_PENDING");
    f.repo.authorizeResultDisclosure.mockImplementation(async () => {
      throw new Error("TRIP_REVOKED");
    });
    await expect(restarted.factory.recover(fresh, f.a.attempt_id)).rejects.toThrow(
      "TRIP_REVOKED",
    );
    await expect(
      restarted.factory.install(
        fresh,
        f.a.attempt_id,
        randomUUID(),
        "a".repeat(64),
        async () => {},
      ),
    ).rejects.toThrow("TRIP_REVOKED");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
