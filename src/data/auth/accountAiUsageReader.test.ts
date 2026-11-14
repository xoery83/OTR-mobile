import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { getAccountGeneration, advanceAccountGeneration } from "./accountGeneration";
import { createAccountAiUsageReader } from "./accountAiUsageReader";
import {
  accountAiUsageSnapshotSchema,
  flightUsageForAccountView,
  providerCostLabel,
  unconfiguredAiAllowance,
} from "@/domain/auth/accountAiUsage";
import type { UsageSummary } from "@/domain/intelligence/flightEnrichmentContracts";
import { AccountAiUsageView } from "@/features/auth/AccountAiUsageView";
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("react-native", () => ({
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("@/ui/controls", () => ({ UiSection: "Section", UiText: "Text" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
const scope = () => ({ accountId: randomUUID(), generation: getAccountGeneration() });
const usage = (): UsageSummary => ({
  receiptId: "receipt-flight-1",
  providerId: "deepseek",
  modelId: "chat",
  searchCalls: 1,
  llmCalls: 1,
  input_tokens: 300,
  output_tokens: 50,
  cached_input_tokens: 100,
  total_tokens: 350,
  knownCostNanos: "37500000",
  providerCostNanos: "37500000",
  costQuality: "ESTIMATED",
  billingStatus: "UNRECONCILED",
  currency: "USD",
  entitlement: "POLICY_UNFROZEN",
  cacheHit: false,
  metering: "RECORDED",
  stepReceiptIds: ["step-1"],
});
const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
it("keeps an absent Meter reader unavailable, not zero usage or zero remaining", async () => {
  const s = scope();
  const read = createAccountAiUsageReader(async () => s.accountId);
  expect(await read(s)).toEqual({ status: "UNAVAILABLE" });
  expect(unconfiguredAiAllowance).toMatchObject({
    remaining: null,
    used: null,
    reserved: null,
    cycle: null,
    enforcementEnabled: false,
  });
});
it("projects the existing Flight Meter receipt without costing or credit conversion", async () => {
  const record = flightUsageForAccountView(usage());
  expect(record).toMatchObject({
    receiptId: "receipt-flight-1",
    providerCostNanos: "37500000",
    priceScheduleId: null,
    cachedInputTokens: 100,
  });
  expect(providerCostLabel(record)).toBe("USD 0.0375");
  const s = scope();
  const read = createAccountAiUsageReader(
    async () => s.accountId,
    async () => ({
      version: 1,
      accountId: s.accountId,
      evidence: "SYNTHETIC",
      records: [record],
    }),
  );
  const result = await read(s);
  expect(result.status).toBe("READY");
  const tree = nodes(AccountAiUsageView({ scope: s, result }));
  expect(tree.some((node) => node.props.children === "aiUsage.synthetic")).toBe(true);
});
it("distinguishes a no-provider cache hit from unknown incurred cost", () => {
  const hit = flightUsageForAccountView({
    ...usage(),
    receiptId: "cache-1",
    cacheHit: true,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    total_tokens: null,
    searchCalls: 0,
    llmCalls: 0,
    knownCostNanos: "0",
    providerCostNanos: "0",
    costQuality: "NO_PROVIDER_CALL",
  });
  expect(providerCostLabel(hit)).toBe("USD 0");
  const unknown = flightUsageForAccountView({
    ...usage(),
    providerCostNanos: null,
    costQuality: "UNKNOWN",
    metering: "PENDING",
  });
  expect(providerCostLabel(unknown)).toBeNull();
  expect(unknown.providerCostNanos).toBeNull();
});
it("does not add repeated receipts or treat missing receipts as billable records", () => {
  expect(() => flightUsageForAccountView({ ...usage(), receiptId: null })).toThrow(
    "AI_USAGE_RECEIPT_REQUIRED",
  );
  const r = flightUsageForAccountView(usage());
  expect(() =>
    accountAiUsageSnapshotSchema.parse({
      version: 1,
      accountId: randomUUID(),
      evidence: "SERVER",
      records: [r, r],
    }),
  ).toThrow();
});
it("denies foreign Account results and scopes before any reader access", async () => {
  const a = scope();
  const meter = vi.fn(async () => ({
    version: 1,
    accountId: randomUUID(),
    evidence: "SERVER",
    records: [],
  }));
  const read = createAccountAiUsageReader(async () => a.accountId, meter);
  await expect(read(a)).rejects.toThrow("AI_USAGE_ACCOUNT_MISMATCH");
  meter.mockClear();
  await expect(read({ ...a, accountId: randomUUID() })).rejects.toThrow();
  expect(meter).not.toHaveBeenCalled();
});
it("rejects old Account results after a switch and does not expose them in the view", async () => {
  const a = scope();
  let finish!: (result: unknown) => void;
  const read = createAccountAiUsageReader(
    async () => a.accountId,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = read(a);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  advanceAccountGeneration();
  const snapshot = {
    version: 1 as const,
    accountId: a.accountId,
    evidence: "SERVER" as const,
    records: [],
  };
  finish(snapshot);
  await expect(pending).rejects.toThrow();
  expect(
    AccountAiUsageView({ scope: a, result: { status: "READY", snapshot } }),
  ).toBeNull();
});
it("shows real empty data separately from unavailable and masks foreign view inputs", () => {
  const a = scope();
  const snapshot = {
    version: 1 as const,
    accountId: a.accountId,
    evidence: "SERVER" as const,
    records: [],
  };
  const tree = nodes(
    AccountAiUsageView({ scope: a, result: { status: "READY", snapshot } }),
  );
  expect(tree.some((node) => node.props.children === "aiUsage.empty")).toBe(true);
  expect(
    AccountAiUsageView({
      scope: a,
      result: { status: "READY", snapshot: { ...snapshot, accountId: randomUUID() } },
    }),
  ).toBeNull();
});
it("formats large nanounit amounts without floating point loss", () => {
  const record = flightUsageForAccountView(usage());
  expect(
    providerCostLabel({ ...record, providerCostNanos: "9007199254740993123456789" }),
  ).toBe("USD 9007199254740993.123456789");
});
