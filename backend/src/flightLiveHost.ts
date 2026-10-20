import { createHash, randomUUID } from "node:crypto";
import { types } from "node:util";
import { createFlightDevExecutor } from "./flightDevDispatch";
import { createClosedPersistenceGateway } from "./externalIntegrationPersistence";
import {
  DEEPSEEK_FLIGHT_DESTINATION,
  type FlightLiveTransport,
  FlightSecretResolver,
} from "./deepSeekFlight";
import { type FlightRemoteEnvelope } from "../../src/domain/intelligence/remoteFlightText";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import {
  FLIGHT_MODEL_CONFORMANCE,
  flightModelWitness,
  recoverFlightRaw,
  readFlightHostStatus,
  acceptanceSchema,
  validateHost,
  type FlightAcceptance,
  type FlightEnvironment,
  type FlightLiveProvisioning,
} from "./flightHostProtocol";
export { FLIGHT_MODEL_CONFORMANCE } from "./flightHostProtocol";
export type {
  FlightAcceptance,
  FlightEnvironment,
  FlightLiveProvisioning,
} from "./flightHostProtocol";
const gateKey = "OTR_DEV_FLIGHT_REMOTE_TRANSPORT";
const callGateway = "otr_external_integration_call_gateway";
const secretKey = "OTR_DEV_DEEPSEEK_API_KEY";
export function createDevFlightEnvironmentResolver(
  environment: "DEV" | "TEST" | "PRODUCTION",
  get: FlightEnvironment,
  acceptance: FlightAcceptance,
): FlightSecretResolver {
  const pins = acceptanceSchema.parse(acceptance);
  if (environment !== "DEV") throw new Error("LIVE_HOST_CLOSED");
  return {
    async resolve(input) {
      if (
        environment !== "DEV" ||
        input.environment !== "DEV" ||
        input.provider !== "DeepSeek" ||
        input.reference !== "vault:otr/dev/deepseek/flight-import-v1" ||
        get(gateKey) !== "enabled"
      )
        return null;
      validateHost(input.host, pins.account_id);
      const value = get(secretKey);
      if (!value || value.trim() !== value || !/^[\x21-\x7e]{1,8192}$/.test(value))
        return null;
      const assertCurrentNow = () => {
        validateHost(input.host, pins.account_id);
        if (get(gateKey) !== "enabled" || get(secretKey) !== value)
          throw new Error("AUTH_FAILED");
      };
      return {
        value,
        assertCurrentNow,
        async assertCurrent() {
          assertCurrentNow();
        },
      };
    },
  };
}

export async function createDevFlightLiveHost(input: {
  environment: "DEV" | "TEST" | "PRODUCTION";
  getEnvironment: FlightEnvironment;
  acceptance?: FlightAcceptance;
  custodyDirectory?: string;
  provisioning?: FlightLiveProvisioning;
}) {
  // Only ordinary plain data objects. Reject before any configuration/capability read.
  const keys = [
    "environment",
    "getEnvironment",
    "acceptance",
    "custodyDirectory",
    "provisioning",
  ];
  if (
    !input ||
    typeof input !== "object" ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(Object.prototype).some(
      (key) =>
        typeof key !== "string" ||
        !"constructor __defineGetter__ __defineSetter__ hasOwnProperty __lookupGetter__ __lookupSetter__ isPrototypeOf propertyIsEnumerable toString valueOf __proto__ toLocaleString"
          .split(" ")
          .includes(key),
    ) ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== "string" || !keys.includes(key),
    ) ||
    Object.values(Object.getOwnPropertyDescriptors(input)).some(
      (descriptor) => !("value" in descriptor),
    )
  )
    throw new Error("LIVE_HOST_INPUT_CLOSED");
  if (input.environment !== "DEV") throw new Error("LIVE_HOST_CLOSED");
  const get = input.getEnvironment;
  if (
    !input.acceptance ||
    !input.custodyDirectory ||
    !input.provisioning ||
    !/^vault:[A-Za-z0-9/_-]{1,128}$/.test(
      get("OTR_DEV_FLIGHT_WORKLOAD_SESSION_REF") ?? "",
    ) ||
    !/^vault:[A-Za-z0-9/_-]{1,128}$/.test(get("OTR_DEV_FLIGHT_SQL_SESSION_REF") ?? "")
  )
    return { status: "CLOSED" as const };
  const acceptance = Object.freeze(acceptanceSchema.parse(input.acceptance));
  const stores = await createFlightPrivateCustody(
    input.custodyDirectory,
    input.provisioning.custody.identity,
  );
  // Continuity gates transport construction as well as later execution eligibility.
  try {
    if (input.provisioning.custody.requiredRequest.accountId !== acceptance.account_id)
      throw new Error("CUSTODY_CONTINUITY_CLOSED");
    await stores.custody.read(input.provisioning.custody.requiredRequest);
    await stores.bindAcceptance(acceptance.account_id, acceptance.session_id, acceptance);
  } catch (error) {
    await stores.close();
    throw error;
  }
  const provisioning = input.provisioning;
  const send = createFlightHttpsSend();
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
    kind: "DEV_FLIGHT_HTTPS",
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
      return send(request);
    },
  };
  const factory = createFlightDevExecutor({
    ...provisioning.workflow,
    ...stores,
    gateway,
    transport,
    resolver: createDevFlightEnvironmentResolver("DEV", get, acceptance),
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

// Called by Backend startup; provisioned issuer/session/workflow are never synthesized.
export async function initializeDevFlightLiveHost(
  getEnvironment: FlightEnvironment,
  provisioning?: FlightLiveProvisioning,
) {
  if (!provisioning) return { status: "CLOSED" as const };
  const parsed = acceptanceSchema.safeParse({
    session_id: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_SESSION"),
    account_id: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_ACCOUNT"),
    task_id: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_TASK"),
    attempt_id: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_ATTEMPT"),
    call_id: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_CALL"),
    request_sha256: getEnvironment("OTR_DEV_FLIGHT_ACCEPTANCE_REQUEST_SHA256"),
  });
  if (!parsed.success || !provisioning) return { status: "CLOSED" as const };
  return createDevFlightLiveHost({
    environment: "DEV",
    getEnvironment,
    acceptance: parsed.data,
    custodyDirectory: getEnvironment("OTR_DEV_FLIGHT_PRIVATE_CUSTODY"),
    provisioning,
  });
}
