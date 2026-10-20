import { createHash, randomUUID } from "node:crypto";
import { createFlightDevExecutor } from "../flightDevDispatch";
import { createClosedPersistenceGateway } from "../externalIntegrationPersistence";
import {
  acceptanceSchema,
  FLIGHT_MODEL_CONFORMANCE,
  flightModelWitness,
  recoverFlightRaw,
  readFlightHostStatus,
} from "../flightHostProtocol";
import {
  DEEPSEEK_FLIGHT_DESTINATION,
  type FlightLiveTransport,
  type FlightSecretResolver,
} from "../deepSeekFlight";
import { type FlightRemoteEnvelope } from "../../../src/domain/intelligence/remoteFlightText";
// Fixture-only composition: never imports live environment resolver or HTTPS constructor.
import {
  validateHost,
  type FlightAcceptance,
  type FlightEnvironment,
  type FlightLiveProvisioning,
} from "../flightHostProtocol";
import type { createProtocolTestCustody } from "./flightProtocolCustody";
const gateKey = "OTR_DEV_FLIGHT_REMOTE_TRANSPORT";
const callGateway = "otr_external_integration_call_gateway";
const fakeKey = "FAKE_DEDICATED_LIVE_W_KEY";
export async function createFlightProtocolTestHost(input: {
  environment: "DEV" | "TEST" | "PRODUCTION";
  getEnvironment: FlightEnvironment;
  acceptance: FlightAcceptance;
  provisioning: FlightLiveProvisioning;
  stores: Awaited<ReturnType<typeof createProtocolTestCustody>>;
  fixtureResponse: (url: string, options: RequestInit) => Promise<Response>;
  custodyDirectory: string;
}) {
  if (input.environment !== "DEV") throw new Error("LIVE_HOST_CLOSED");
  return assembleFixture({
    ...input,
    transportKind: "NETWORK_DISABLED_PROTOCOL",
    resolver: {
      async resolve(request) {
        validateHost(request.host, input.acceptance.account_id);
        const current = () =>
          input.getEnvironment("OTR_DEV_DEEPSEEK_API_KEY") === fakeKey &&
          input.getEnvironment("OTR_DEV_FLIGHT_REMOTE_TRANSPORT") === "enabled";
        if (!current()) return null;
        const assertCurrentNow = () => {
          if (!current()) throw new Error("AUTH_FAILED");
        };
        return {
          value: fakeKey,
          assertCurrentNow,
          async assertCurrent() {
            assertCurrentNow();
          },
        };
      },
    },
    send: async (request) => {
      const response = await input.fixtureResponse(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
        signal: request.signal,
      });
      return {
        status: response.status,
        redirected: response.redirected,
        body: (async function* () {
          yield new Uint8Array(await response.arrayBuffer());
        })(),
      };
    },
  });
}

// Test wiring uses the same executor/parsers; capability acquisition remains isolated.
async function assembleFixture(input: {
  getEnvironment: FlightEnvironment;
  acceptance: FlightAcceptance;
  provisioning: FlightLiveProvisioning;
  stores: Awaited<ReturnType<typeof createProtocolTestCustody>>;
  resolver: FlightSecretResolver;
  send: FlightLiveTransport["send"];
  transportKind: "NETWORK_DISABLED_PROTOCOL";
}) {
  const get = input.getEnvironment;
  const acceptance = Object.freeze(acceptanceSchema.parse(input.acceptance));
  const provisioning = input.provisioning;
  const stores = input.stores;
  try {
    if (provisioning.custody.requiredRequest.accountId !== acceptance.account_id)
      throw new Error("CUSTODY_CONTINUITY_CLOSED");
    await stores.custody.read(provisioning.custody.requiredRequest);
    await stores.bindAcceptance(acceptance.account_id, acceptance.session_id, acceptance);
  } catch (error) {
    await stores.close();
    throw error;
  }
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const assertLocalReady = (e: FlightRemoteEnvelope, host: unknown) => {
    if (get(gateKey) !== "enabled" || get("OTR_DEV_FLIGHT_ONE_SHOT") !== "enabled")
      throw new Error("LIVE_HOST_CLOSED");
    if (
      validateHost(host, acceptance.account_id).auth_session_reference !==
      get("OTR_DEV_FLIGHT_WORKLOAD_SESSION_REF")
    )
      throw new Error("LIVE_SESSION_CLOSED");
    if (e.binding.descriptor.boundary_version !== "otr-flight-remote-v2")
      throw new Error("LIVE_HOST_CLOSED");
    const p = e.binding.descriptor.remote;
    if (
      e.binding.account_id !== acceptance.account_id ||
      p.attempt_id !== acceptance.attempt_id ||
      p.call_id !== acceptance.call_id ||
      p.request_sha256 !== acceptance.request_sha256 ||
      p.expected_family !== FLIGHT_MODEL_CONFORMANCE.expected_family ||
      p.model_id !== FLIGHT_MODEL_CONFORMANCE.requested_model
    )
      throw new Error("LIVE_HOST_CLOSED");
  };
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: callGateway,
    now: () => new Date().toISOString(),
    async verify(r) {
      if (r.environment !== "DEV") throw new Error("LIVE_HOST_CLOSED");
      const h = await provisioning.verify(r);
      return validateHost(h, acceptance.account_id);
    },
    async execute(kind, context, command) {
      const identity = await provisioning.session.identity();
      if (
        identity.session_user !== callGateway ||
        identity.environment !== "DEV" ||
        identity.primary !== true ||
        identity.session_reference !== get("OTR_DEV_FLIGHT_SQL_SESSION_REF")
      )
        throw new Error("LIVE_SESSION_CLOSED");
      if (
        ![
          "flight_activation_reserve_call",
          "external_integration_mark_dispatch",
          "external_integration_usage_append",
          "external_integration_observe_call",
        ].includes(kind)
      )
        throw new Error("LIVE_COMMAND_CLOSED");
      const row = command.row as Record<string, unknown> | undefined;
      if (
        (command.call_id ?? row?.call_id) !== acceptance.call_id ||
        (command.account_id ?? row?.account_id) !== acceptance.account_id
      )
        throw new Error("LIVE_HOST_CLOSED");
      if (
        kind === "external_integration_mark_dispatch" &&
        (get(gateKey) !== "enabled" || get("OTR_DEV_FLIGHT_ONE_SHOT") !== "enabled")
      )
        throw new Error("LIVE_HOST_CLOSED");
      return provisioning.session.execute(kind, context, command);
    },
  });
  let sent = false;
  const transport: FlightLiveTransport = {
    kind: "NETWORK_DISABLED_PROTOCOL",
    assertLocalReady,
    async assertReady(e, h) {
      assertLocalReady(e, h);
    },
    modelWitness: flightModelWitness,
    async retainResponse(e, bytes, status) {
      if (bytes.byteLength < 1 || bytes.byteLength > 131072)
        throw new Error("RESPONSE_CUSTODY_FAILED");
      if (e.binding.descriptor.boundary_version !== "otr-flight-remote-v2")
        throw new Error("LIVE_HOST_CLOSED");
      const p = e.binding.descriptor.remote;
      // The UUID reference pins the only configured call; no raw bytes enter telemetry.
      await stores.custody.put({
        accountId: acceptance.account_id,
        reservationId: p.call_id,
        sha256: await hash(bytes),
        byteCount: bytes.length,
        bytes,
      });
      await stores.retainRaw(
        acceptance.account_id,
        p.call_id,
        { reference: p.call_id, sha256: await hash(bytes), byteCount: bytes.length },
        { acceptance, envelope_sha256: e.envelope_sha256, execution_pins: p, status },
      );
    },
    async send(request) {
      if (
        sent ||
        request.url !== DEEPSEEK_FLIGHT_DESTINATION ||
        request.method !== "POST" ||
        request.redirect !== "error" ||
        request.max_response_bytes !== 131072 ||
        get(gateKey) !== "enabled" ||
        get("OTR_DEV_FLIGHT_ONE_SHOT") !== "enabled"
      )
        throw new Error("LIVE_HOST_CLOSED");
      sent = true; // Further process-local restriction. Durable fresh Server84 mark is mandatory above.
      return input.send(request);
    },
  };
  const factory = createFlightDevExecutor({
    ...provisioning.workflow,
    ...stores,
    gateway,
    transport,
    resolver: input.resolver,
    hash,
    id: randomUUID,
    now: () => new Date().toISOString(),
    monotonic: () => performance.now(),
    async load(a) {
      if (
        a.account_id !== acceptance.account_id ||
        a.task_id !== acceptance.task_id ||
        a.attempt_id !== acceptance.attempt_id ||
        a.usage_correlation_id !== acceptance.call_id ||
        a.request_sha256 !== acceptance.request_sha256 ||
        a.shadow ||
        a.request_material_reference !== provisioning.custody.requiredRequest.reference ||
        a.request_material_sha256 !== provisioning.custody.requiredRequest.sha256
      )
        throw new Error("LIVE_HOST_CLOSED");
      const loaded = await provisioning.workflow.load(a);
      const host = validateHost(loaded.host, acceptance.account_id);
      if (
        host.request_id !== loaded.command.request_id ||
        host.request_sha256 !== loaded.command.request_sha256 ||
        host.command_kind !== "flight_activation_reserve_call"
      )
        throw new Error("LIVE_REQUEST_BINDING");
      // Loading retained content is permitted while transport is closed; readiness
      // and the final synchronous handoff independently enforce host gates.
      if (
        loaded.envelope.binding.descriptor.boundary_version !== "otr-flight-remote-v2" ||
        loaded.envelope.binding.descriptor.remote.call_id !== acceptance.call_id
      )
        throw new Error("LIVE_HOST_CLOSED");
      return {
        ...loaded,
        deadline: Math.min(loaded.deadline, performance.now() + 30000),
      };
    },
  });
  return {
    status: "CONFIGURED" as const,
    close: stores.close,
    factory,
    custody: stores.custody,
    recoverRaw: (context: Parameters<typeof factory.recover>[0]) =>
      recoverFlightRaw({ factory, stores, provisioning, acceptance, hash }, context),
    acceptance,
    sendCount: () => (sent ? 1 : 0),
    readback: (context: Parameters<typeof factory.recover>[0]) =>
      readFlightHostStatus({ factory, stores, provisioning, acceptance }, context, sent),
  };
}
