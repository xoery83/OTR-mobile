/** Offline acceptance only. Requires an independently replayed, network-none
 * otr-cp14-a2-acceptance fixture and the accepted persistence harness's synthetic grants.
 * Never opens a hosted connection, provisions a gateway, or changes dispatch authority.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  createClosedPersistenceGateway,
  commandDigest,
  type VerifiedCallContextV1,
} from "../../backend/src/externalIntegrationPersistence";
import { createServer83OutboundReservation } from "../../backend/src/outboundReservation";
import {
  readOutboundSnapshots,
  routeOutbound,
  createOutboundAdmission,
} from "../../src/domain/intelligence/outboundRouting";
import { attemptSchema, type Task } from "../../src/domain/intelligence/persistence";
async function main() {
  const container = "otr-cp14-a2-acceptance",
    now = "2000-01-01T00:00:00.000Z",
    h = "a".repeat(64);
  assert.equal(
    spawnSync(
      "docker",
      ["inspect", container, "--format", "{{.HostConfig.NetworkMode}}"],
      { encoding: "utf8" },
    ).stdout.trim(),
    "none",
  );
  function sql(body: string) {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
      ],
      { input: body, encoding: "utf8" },
    );
    if (r.status !== 0)
      throw new Error(
        r.stderr.match(/ERROR:\s+([A-Z0-9_]+)/)?.[1] ?? "A2_FIXTURE_SQL_FAILURE",
      );
    return r.stdout.trim();
  }
  const literal = (v: unknown) =>
    "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
  const actor = sql(
    "select actor_id from public.external_integration_admin_grants where environment='TEST' and permission='CONFIG_ADMIN' and revoked_at is null limit 1;",
  );
  assert.match(actor, /^[0-9a-f-]{36}$/);
  function gateway(
    kind: VerifiedCallContextV1["gateway_identity"],
    principal: VerifiedCallContextV1["principal_kind"],
  ) {
    return createClosedPersistenceGateway({
      gatewayIdentity: kind,
      now: () => now,
      async verify(r) {
        return {
          version: 1,
          principal_kind: principal,
          verified_actor_id: actor,
          verified_account_id: actor,
          verified_client_identity: null,
          verified_external_subject: null,
          verified_environment: "TEST",
          auth_source: "TEST_ONLY_INJECTED_VERIFIER",
          auth_config_version: 1,
          auth_session_reference: null,
          verified_at: now,
          expires_at: "2070-01-01T00:00:00.000Z",
          revoked: false,
          request_id: r.requestId,
          request_sha256: r.requestSha256,
          command_kind: r.command,
          gateway_identity: kind,
        };
      },
      async execute(command, context, body) {
        // Function identifier is the accepted closed gateway's finite ProtectedCommand enum.
        return JSON.parse(
          sql(
            `set session authorization ${kind};select public.${command}(${literal(context)},${literal(body)});`,
          ),
        );
      },
    });
  }
  const admin = gateway("otr_external_integration_admin_gateway", "OTR_ADMIN");
  async function administer(
    kind: Parameters<typeof admin.invoke>[0],
    fields: Record<string, unknown>,
  ) {
    const body = {
      version: 1,
      environment: "TEST",
      request_id: randomUUID(),
      actor_id: actor,
      ...fields,
    };
    return admin.invoke(kind, { ...body, request_sha256: commandDigest(body) });
  }
  const integrationId = `a2-${randomUUID()}`;
  const integration = JSON.parse(
    sql(
      "select to_jsonb(i) from public.external_integrations i where category='INTELLIGENCE_OUTBOUND' limit 1;",
    ),
  );
  Object.assign(integration, {
    integration_id: integrationId,
    admin_label: "A2 synthetic acceptance",
    config_version: 1,
    config_sha256: h,
    enabled: true,
    kill_switch: true,
    credential_reference: null,
    auth_config_reference: null,
    capabilities: ["EXTRACT"],
    quota_limit: 2,
    quota_window_seconds: 31536000,
    rate_per_minute: null,
    health_state: "UNKNOWN",
    health_observed_at: null,
    health_observation_id: null,
    created_at: now,
    updated_at: now,
    created_by: actor,
    updated_by: actor,
  });
  await administer("external_integration_configure", {
    integration_id: integrationId,
    expected_version: null,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    row: integration,
  });
  await administer("external_integration_set_kill", {
    integration_id: integrationId,
    expected_version: 1,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    kill_switch: false,
  });
  const live = JSON.parse(
    sql(
      `select to_jsonb(i) from public.external_integrations i where integration_id='${integrationId}';`,
    ),
  );
  const provider = JSON.parse(
    sql("select to_jsonb(p) from public.intelligence_provider_configs p limit 1;"),
  );
  Object.assign(provider, {
    provider_config_id: randomUUID(),
    integration_id: integrationId,
    provider_id: "a2-synthetic",
    model_id: "extractor",
    model_version: "1",
    adapter_version: "1",
    config_version: 1,
    configuration_sha256: h,
    provider_class: "DETERMINISTIC",
    capabilities: ["EXTRACT"],
    modalities: ["TEXT"],
    schema_contracts: [{ id: "flight", version: 1, dialect: "otr" }],
    schema_output: true,
    privacy_policy: "LOCAL_ONLY",
    network_required: false,
    data_region: "DEVICE",
    routing_class: "DETERMINISTIC",
    routing_priority: 0,
    routing_eligibility: "ELIGIBLE",
    input_byte_limit: 1048576,
    input_count_limit: 64,
    output_byte_limit: 1048576,
    max_complexity: 10,
    max_risk: 1,
    replay_support: "UNSUPPORTED",
    quality_policy_reference: null,
    quality_policy_sha256: null,
    quality_observation_reference: null,
    expected_completion_cost_nanos: null,
    expected_cost_currency: null,
    created_at: now,
    created_by: actor,
  });
  await administer("intelligence_provider_config_append", {
    integration_id: integrationId,
    expected_version: null,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    row: provider,
  });
  const environment = JSON.parse(
    sql(
      "select to_jsonb(e) from public.external_integration_environment_state e where environment='TEST';",
    ),
  );
  const snapshot = readOutboundSnapshots([
    {
      environment: "TEST",
      environment_version: environment.config_version,
      environment_killed: environment.kill_switch,
      runtime_enabled: environment.runtime_enabled,
      integration_id: integrationId,
      integration_version: live.config_version,
      integration_sha256: live.config_sha256,
      enabled: true,
      killed: false,
      provider_config_id: provider.provider_config_id,
      provider_id: provider.provider_id,
      model_id: provider.model_id,
      model_version: "1",
      adapter_version: "1",
      config_version: 1,
      configuration_sha256: h,
      provider_class: "DETERMINISTIC",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      schemas: [{ id: "flight", version: 1, dialect: "otr" }],
      schema_output: true,
      privacy: "LOCAL_ONLY",
      network_required: false,
      region: "DEVICE",
      routing_class: "DETERMINISTIC",
      priority: 0,
      eligibility: "ELIGIBLE",
      input_byte_limit: 1048576,
      input_count_limit: 64,
      output_byte_limit: 1048576,
      max_risk: 1,
      max_complexity: 10,
      replay_support: "UNSUPPORTED",
      quota_admitted: true,
      rate_admitted: true,
      latency_ms: null,
      expected_cost_nanos: null,
      expected_currency: null,
      price: null,
      health: "UNKNOWN",
      health_reference: null,
      health_config_version: null,
      quality_reference: null,
      quality_policy_reference: null,
      quality_policy_sha256: null,
    },
  ])[0];
  const task = {
    account_id: actor,
    task_id: randomUUID(),
    import_id: randomUUID(),
    trip_id: null,
    input_sha256: h,
    schema_sha256: h,
    policy_sha256: h,
    schema_dialect: "otr",
    policy_snapshot: { region: "DEVICE", route: "DETERMINISTIC" },
    sync_operation_id: randomUUID(),
    publication_fence: 1,
  } as Task;
  const request = {
    task,
    capabilities: ["EXTRACT"],
    modalities: ["TEXT"],
    schema: { id: "flight", version: 1, sha256: h },
    privacy: "LOCAL_ONLY" as const,
    online: true,
    networkRequired: false,
    latencyBudgetMs: null,
    risk: "NORMAL" as const,
    budget: { currency: null, nanos: null },
    shadowEligible: false,
    environment: "TEST" as const,
  };
  const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const route = await routeOutbound(request, [snapshot], hash);
  assert.equal(route.status, "ELIGIBLE");
  if (route.status !== "ELIGIBLE") throw new Error("A2_ROUTE");
  const seed = attemptSchema.parse({
    ...Object.fromEntries(Object.keys(attemptSchema.shape).map((k) => [k, null])),
    account_id: actor,
    attempt_id: randomUUID(),
    task_id: task.task_id,
    attempt_sequence: 1,
    format_version: 1,
    request_id: randomUUID(),
    idempotency_key: randomUUID(),
    request_sha256: h,
    request_material_reference: randomUUID(),
    descriptor_snapshot: {
      version: 1,
      provider_class: "DETERMINISTIC",
      replay_support: "UNSUPPORTED",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      network_required: false,
    },
    policy_admission: { version: 1, policy_sha256: h, allowed: true },
    policy_admission_sha256: h,
    task_publication_fence: 1,
    sync_operation_id: task.sync_operation_id,
    usage_correlation_id: randomUUID(),
    fallback_chain_id: randomUUID(),
    shadow: false,
    created_at: now,
    creation_clock: "DEVICE_WALL",
    row_revision: 1,
    execution_observation: "NOT_STARTED",
    result_install_disposition: "NONE",
    metering_disposition: "START_PENDING",
    updated_at: now,
    update_clock: "DEVICE_WALL",
  });
  const e = await createOutboundAdmission({
    request,
    pins: route.pins,
    seed,
    predecessor: null,
    shadowOf: null,
    hash,
  });
  const port = createServer83OutboundReservation({
    gateway: gateway("otr_external_integration_call_gateway", "TRUSTED_WORKLOAD"),
    hash,
    id: randomUUID,
    async assertCurrentAuthorization(e) {
      assert.equal(
        sql(
          `select public.cp14_trip_access('${actor}'::uuid,${e.trip_id ? "'" + e.trip_id + "'::uuid" : "null::uuid"});`,
        ),
        "t",
      );
    },
    async readCurrent() {
      const i = JSON.parse(
        sql(
          `select to_jsonb(i) from public.external_integrations i where integration_id='${integrationId}';`,
        ),
      );
      return [
        {
          ...snapshot,
          enabled: i.enabled,
          killed: i.kill_switch,
          integration_version: i.config_version,
          integration_sha256: i.config_sha256,
        },
      ];
    },
    async readReserved() {
      return JSON.parse(
        sql(
          `select jsonb_build_object('account_id',c.account_id,'task_id',c.task_id,'attempt_id',c.attempt_id,'attempt_sequence',c.attempt_sequence,'call_id',c.call_id,'integration_id',c.integration_id,'request_id',c.request_id,'request_sha256',c.request_sha256,'configuration_sha256',c.configuration_sha256,'config_version',c.config_version,'provider_config_id',c.provider_config_id,'input_sha256',c.input_sha256,'schema_sha256',c.schema_sha256,'publication_fence',c.publication_fence,'fallback_chain_id',c.fallback_chain_id,'shadow',c.shadow,'shadow_of_call_id',c.shadow_of_call_id,'environment',c.environment,'price_schedule_id',c.price_schedule_id,'provider_id',c.provider_id,'model_id',c.model_id,'model_version',c.model_version,'adapter_version',c.adapter_version,'trip_id',c.trip_id,'import_id',c.import_id,'idempotency_key',c.idempotency_key,'admission_sha256',c.admission_sha256,'start_sha256',u.observation_sha256,'row_revision',c.row_revision,'dispatch_state',c.dispatch_state,'execution_certainty',c.execution_certainty,'start_durable',u.observation_kind='START') from public.external_integration_calls c join public.external_integration_usage_events u using(call_id) where c.call_id='${e.attempt.usage_correlation_id}' and u.observation_kind='START';`,
        ),
      );
    },
  });
  await port.reserve(e);
  await port.assertStart(e);
  await port.reserve(e);
  await port.freshEligibility(e);
  await port.observeDispatchClosed(e);
  assert.equal(
    sql(
      `select count(*) from public.external_integration_calls where integration_id='${integrationId}';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.external_integration_usage_events where call_id='${e.attempt.usage_correlation_id}' and observation_kind='START';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select dispatch_state||':'||execution_certainty from public.external_integration_calls where call_id='${e.attempt.usage_correlation_id}';`,
    ),
    "RESERVED:NOT_STARTED",
  );
  await administer("external_integration_set_kill", {
    integration_id: integrationId,
    expected_version: live.config_version,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    kill_switch: true,
  });
  await assert.rejects(() => port.freshEligibility(e), /PREDISPATCH_INELIGIBLE/);
  await port.assertStart(e); // Kill does not erase historical call or START.
  assert.equal(
    sql(
      "select count(*) from public.external_integration_environment_state where runtime_enabled;",
    ),
    "0",
  );
  console.log(
    "PASS A2 bridge → actual Server83: exact call+START, reservation replay, verified real dispatch CLOSED, fresh kill exclusion, retained historical responsibility. No synthetic completion inserted into Server83.",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
