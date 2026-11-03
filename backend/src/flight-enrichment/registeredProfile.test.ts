import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import profile from "./registeredProfile.json";
import upstream from "./UPSTREAM.json";
import {
  registeredFlightEnrichmentProfile,
  flightEnrichmentProfileSha256,
} from "./registeredProfile";
import { persistenceDigest } from "../externalIntegrationPersistence";
import { DEEPSEEK_FLIGHT_DESTINATION } from "../deepSeekFlight";
import { DEEPSEEK_FLIGHT_SEARCH_DESTINATION } from "../flightHttpsTransport";
import { DEFAULT_PLAN } from "./ports";
it("pins the delivered consumer, closed default and per-request resource bounds", () => {
  expect(profile.package_sha256).toBe(upstream.archiveSha256);
  expect(profile).toMatchObject({
    consumer_id: "flight-enrichment",
    execution_scope: "FLIGHT_ENRICHMENT_V1",
    default_state: "CLOSED",
    max_search_calls: DEFAULT_PLAN.maxSearchCalls,
    max_llm_calls: DEFAULT_PLAN.maxLlmCalls,
    target_nanos: DEFAULT_PLAN.targetNanos,
    max_request_bytes: 24000,
    max_response_bytes: 131072,
    max_output_tokens: 1200,
    search_url: DEEPSEEK_FLIGHT_SEARCH_DESTINATION,
    extraction_url: DEEPSEEK_FLIGHT_DESTINATION,
  });
  expect(profile.credential_reference).not.toContain("flight-import");
  expect(flightEnrichmentProfileSha256).toBe(persistenceDigest(profile));
  expect(
    Object.isFrozen(registeredFlightEnrichmentProfile.accepted_returned_models),
  ).toBe(true);
});
it("keeps SQL registration and Node profile identical without admitting Import", () => {
  const sql = readFileSync(
    new URL(
      "../../../docs/ops/native-flight-enrichment-20261027/PROFILE_SCOPE_CANDIDATE.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const literal =
    /select '(\{"version":1,"consumer_id":"flight-enrichment"[^']+\})'::jsonb/.exec(
      sql,
    )?.[1];
  expect(literal).toBeDefined();
  expect(JSON.parse(literal!)).toEqual(profile);
  expect(sql).not.toContain(
    "create or replace function public.flight_activation_reserve_call",
  );
});
