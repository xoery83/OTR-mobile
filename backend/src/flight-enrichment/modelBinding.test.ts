import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { modelTaskRequestSchema } from "../../../src/domain/intelligence/modelTask";
import { persistenceDigest } from "../externalIntegrationPersistence";
import {
  bindFlightEnrichmentModelTask,
  enrichmentOutputSchemaDescriptor,
  enrichmentOutputSchemaSha256,
} from "./modelBinding";
import { ENRICHMENT_EXTRACTION_SYSTEM_PROMPT } from "./provider";
import upstream from "./UPSTREAM.json";
const input = () => ({
  logicalRequestId: "a0000000-0000-4000-8000-000000000001",
  material: {
    reference: "a0000000-0000-4000-8000-000000000002",
    sha256: "a".repeat(64),
    byte_count: 24000,
  },
  policy: {
    version: 1 as const,
    privacy: "REMOTE_ALLOWED" as const,
    network_required: true,
    region: "fixture",
    route: "COMMERCIAL_REMOTE" as const,
    budget_currency: "USD",
    budget_nanos: "10000000",
    max_attempts: 1,
    deadline: "2026-10-27T00:00:13Z",
  },
});
it("uses the existing technical Model Task request and an independently registered consumer/schema", () => {
  const binding = bindFlightEnrichmentModelTask(input());
  expect(modelTaskRequestSchema.parse(binding.request)).toEqual(binding.request);
  expect(binding.request.consumer_id).toBe("flight-enrichment");
  expect(binding.request.input.reference).toBe(input().material.reference);
  expect(binding.request).not.toHaveProperty("request_id");
  expect(binding.request_sha256).toBe(persistenceDigest(binding.request));
  expect(binding.request.schema.sha256).toBe(enrichmentOutputSchemaSha256);
});
it.each([
  { max_attempts: 2 },
  { budget_currency: "NZD" },
  { budget_nanos: "10000001" },
  { budget_nanos: "0" },
  { deadline: null },
  { network_required: false },
])("does not create an advisory policy exception for %j", (change) => {
  const value = input();
  expect(() =>
    bindFlightEnrichmentModelTask({ ...value, policy: { ...value.policy, ...change } }),
  ).toThrow();
});
it("rejects material beyond the package bound", () => {
  const value = input();
  expect(() =>
    bindFlightEnrichmentModelTask({
      ...value,
      material: { ...value.material, byte_count: 24001 },
    }),
  ).toThrow("MODEL_POLICY");
});
it("pins the SQL output descriptor to the same package/schema source symbol", () => {
  const sql = readFileSync(
    new URL(
      "../../../docs/ops/native-flight-enrichment-20261027/PROFILE_SCOPE_CANDIDATE.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const literal = /select '(\{"id":"FLIGHT_ENRICHMENT_PROPOSAL_V1"[^']+\})'::jsonb/.exec(
    sql,
  )?.[1];
  expect(literal).toBeDefined();
  expect(JSON.parse(literal!)).toEqual(enrichmentOutputSchemaDescriptor);
  expect(
    createHash("sha256").update(ENRICHMENT_EXTRACTION_SYSTEM_PROMPT).digest("hex"),
  ).toBe(upstream.extractionPromptSha256);
  expect(sql).toContain(`select '${upstream.extractionPromptSha256}'::text`);
});
