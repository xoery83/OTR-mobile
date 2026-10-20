import { afterEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@/data/api/client";
import {
  classifyJourneyCurrencyPreviewFailure,
  ledgerCurrencyRepository,
} from "./ledgerCurrencyRepository";

const token = vi.hoisted(() => vi.fn());
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: token }));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedger: vi.fn(),
  revalidateJourneyLedger: vi.fn(),
}));
vi.mock("./defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: vi.fn(),
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  token.mockReset();
});

it.each(["", "not a URL"])(
  "classifies a missing or invalid public API base before auth or fetch (%s)",
  async (baseUrl) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", baseUrl);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    let failure: unknown;
    try {
      await ledgerCurrencyRepository.preview(
        "10000000-0000-4000-8000-000000000001",
        "EUR",
      );
    } catch (error) {
      failure = error;
    }
    expect(classifyJourneyCurrencyPreviewFailure(failure)).toEqual({
      kind: "CONFIG_UNAVAILABLE",
    });
    expect(String(failure)).not.toContain(baseUrl || "EXPO_PUBLIC_OTR_API_BASE_URL");
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each([
  [new ApiClientError("network detail", "network"), { kind: "CONNECTIVITY" }],
  [new ApiClientError("timeout detail", "timeout"), { kind: "CONNECTIVITY" }],
  [
    new ApiClientError("auth detail", "http", 401, "AUTH_REQUIRED"),
    { kind: "AUTH", status: 401, code: "AUTH_REQUIRED" },
  ],
  [
    new ApiClientError("permission detail", "http", 403, "TRIP_WRITE_FORBIDDEN"),
    { kind: "FORBIDDEN", status: 403, code: "TRIP_WRITE_FORBIDDEN" },
  ],
  [
    new ApiClientError("conflict detail", "http", 409, "JOURNEY_CURRENCY_CONFLICT"),
    { kind: "CONFLICT", status: 409, code: "JOURNEY_CURRENCY_CONFLICT" },
  ],
  [
    new ApiClientError("service detail", "http", 503, "BACKEND_UNAVAILABLE"),
    { kind: "SERVICE", status: 503, code: "BACKEND_UNAVAILABLE" },
  ],
  [
    new ApiClientError("body detail", "validation", 200, "secret field path"),
    { kind: "INVALID_RESPONSE", status: 200 },
  ],
  [
    new ApiClientError("private detail", "http", 418, "RAW_PRIVATE_CODE"),
    { kind: "UNKNOWN", status: 418 },
  ],
  [new Error("private detail"), { kind: "UNKNOWN" }],
])("returns only safe preview failure fields", (error, expected) => {
  const classified = classifyJourneyCurrencyPreviewFailure(error);
  expect(classified).toEqual(expected);
  expect(JSON.stringify(classified)).not.toContain("detail");
  expect(JSON.stringify(classified)).not.toContain("RAW_PRIVATE_CODE");
});
