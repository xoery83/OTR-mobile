import { expect, it } from "vitest";
import { measureFlightEnrichmentResponse } from "./metering";
const prices = {
  searchNanosPerRequest: "750000",
  inputNanosPerMillion: "300000000",
  cachedInputNanosPerMillion: "6000000",
  outputNanosPerMillion: "1200000000",
  acceptedReturnedModels: ["deepseek-flash"],
};
const bytes = (raw: unknown) => Buffer.from(JSON.stringify(raw));
it("charges one successful nonempty Search unit, without inventing LLM tokens", () => {
  const { observation: o } = measureFlightEnrichmentResponse(
    "SEARCH",
    bytes({ results: [{ url: "bad but provider returned a result" }] }),
    200,
    prices,
  );
  expect(o).toMatchObject({
    cost_nanos: "750000",
    cost_quality: "ESTIMATED",
    billing_status: "UNRECONCILED",
    total_tokens: 0,
    modelId: null,
  });
});
it.each([200, 429, 500])(
  "does not bill an observed empty or unsuccessful Search (%s)",
  (status) => {
    expect(
      measureFlightEnrichmentResponse("SEARCH", bytes({ results: [] }), status, prices)
        .observation,
    ).toMatchObject({ cost_nanos: "0", billing_status: "NOT_BILLED" });
  },
);
it("malformed successful Search is UNKNOWN rather than free", () => {
  expect(
    measureFlightEnrichmentResponse("SEARCH", Buffer.from("not json"), 200, prices)
      .observation,
  ).toMatchObject({
    cost_nanos: null,
    cost_quality: "UNKNOWN",
    billing_status: "UNKNOWN",
  });
});
it("uses canonical snake_case usage and bills disjoint cache-miss/cache-hit/output once", () => {
  const result = measureFlightEnrichmentResponse(
    "EXTRACTION",
    bytes({
      model: "deepseek-flash",
      id: "req1",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 10,
        prompt_cache_miss_tokens: 90,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    }),
    200,
    prices,
  );
  expect(result.modelAccepted).toBe(true);
  expect(result.observation).toMatchObject({
    cost_nanos: "51060",
    input_tokens: 100,
    cached_input_tokens: 10,
    output_tokens: 20,
    total_tokens: 120,
    usage_quality: "ACTUAL_REPORTED",
  });
});
it.each(["unapproved", undefined])(
  "unbound model %s preserves measured tokens without assigning another model's price",
  (model) => {
    const result = measureFlightEnrichmentResponse(
      "EXTRACTION",
      bytes({
        model,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 0,
        },
      }),
      200,
      prices,
    );
    expect(result.modelAccepted).toBe(false);
    expect(result.observation).toMatchObject({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      cost_nanos: null,
      cost_quality: "UNKNOWN",
      billing_status: "UNRECONCILED",
    });
  },
);
it("does not invent zero cost for inconsistent/missing Extraction usage", () => {
  const result = measureFlightEnrichmentResponse(
    "EXTRACTION",
    bytes({
      model: "deepseek-flash",
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 99 },
    }),
    200,
    prices,
  );
  expect(result.observation).toMatchObject({
    input_tokens: null,
    cost_nanos: null,
    cost_quality: "UNKNOWN",
  });
});


it("keeps Search price and actual Extraction usage when token pricing is disabled", () => {
  const withoutExtractionPrice = {
    ...prices,
    inputNanosPerMillion: null,
    cachedInputNanosPerMillion: null,
    outputNanosPerMillion: null,
  };
  const search = measureFlightEnrichmentResponse("SEARCH", bytes({ results: [{}] }), 200, withoutExtractionPrice);
  expect(search.observation.cost_nanos).toBe("750000");
  const extraction = measureFlightEnrichmentResponse("EXTRACTION", bytes({
    model: "deepseek-flash",
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_cache_hit_tokens: 10 },
  }), 200, withoutExtractionPrice);
  expect(extraction.modelAccepted).toBe(true);
  expect(extraction.observation).toMatchObject({
    input_tokens: 100,
    output_tokens: 20,
    cost_nanos: null,
    cost_quality: "UNKNOWN",
  });
});
