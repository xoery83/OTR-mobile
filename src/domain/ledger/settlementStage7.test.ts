import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  balancesFromSettlementInputs,
  buildSettlementPreview,
  buildSettlementConfirmationDiff,
  canonicalSettlementInputsJson,
  canonicalSettlementJson,
  canonicalSettlementSourceJson,
  type SettlementExpenseCandidate,
} from "./settlement";
import {
  canonicalLocalSettlementSourceJson,
  currentSettlementExpenses,
} from "./settlementSource";

const members = [
  { memberId: "b", displayNameSnapshot: "B" },
  { memberId: "a", displayNameSnapshot: "A" },
  { memberId: "c", displayNameSnapshot: "C" },
];

function expense(id: string, payerMemberId: string): SettlementExpenseCandidate {
  return {
    id,
    revision: 3,
    occurredAt: "2026-09-10T00:00:00.000Z",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    hasOpenConflict: false,
    payerMemberId,
    original: { minor: 100, currency: "NZD", scale: 2 },
    participants: members.map((member) => ({ ...member })),
    splits: [
      {
        memberId: "a",
        method: "EQUAL_PERSON",
        originalMinor: 34,
        settlementMinor: 34,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 1,
      },
      ...["b", "c"].map((memberId) => ({
        memberId,
        method: "EQUAL_PERSON" as const,
        originalMinor: 33,
        settlementMinor: 33,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      })),
    ],
    valuation: {
      id: `valuation-${id}`,
      policy: "SAME_CURRENCY",
      original: { minor: 100, currency: "NZD", scale: 2 },
      settlement: { minor: 100, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
  };
}

function preview(expenses: SettlementExpenseCandidate[], memberOrder = members) {
  return buildSettlementPreview({
    journeyId: "journey",
    throughTimestamp: "2026-09-12T00:00:00.000Z",
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 4,
    members: memberOrder,
    expenses,
  });
}

describe("Stage 7.1 settlement preview", () => {
  it("reconstructs confirmed balances from immutable inputs after later changes", () => {
    const confirmed = preview([expense("one", "a")]);
    const current = preview([expense("one", "a"), expense("two", "b")]);
    expect(balancesFromSettlementInputs(confirmed.inputs, members, "NZD", 2)).toEqual(
      confirmed.balances,
    );
    expect(confirmed.balances).not.toEqual(current.balances);
  });

  it("retains protected terminal history without treating it as current source", () => {
    const values = [
      { id: "protected", serverId: null, syncStatus: "FAILED" as const },
      { id: "pending", serverId: null, syncStatus: "PENDING_CREATE" as const },
      { id: "stale-server", serverId: "server-id", syncStatus: "FAILED" as const },
      { id: "server", serverId: "server-id", syncStatus: "SYNCED" as const },
    ];
    expect(currentSettlementExpenses(values).map(({ id }) => id)).toEqual([
      "pending",
      "server",
    ]);
    expect(values[0].syncStatus).toBe("FAILED");
  });

  it("is zero-sum and deterministic under input reordering", () => {
    const first = preview([expense("two", "b"), expense("one", "a")]);
    const second = preview(
      [expense("one", "a"), expense("two", "b")],
      [...members].reverse(),
    );
    expect(first.balances.reduce((sum, balance) => sum + balance.netMinor, 0)).toBe(0);
    expect(first.transfers).toEqual(second.transfers);
    expect(canonicalSettlementJson(first)).toBe(canonicalSettlementJson(second));
    expect(
      createHash("sha256").update(canonicalSettlementJson(first)).digest("hex"),
    ).toHaveLength(64);
  });

  it("fingerprints normalized eligible source records independent of source order", () => {
    const first = {
      journeyId: "journey",
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 4,
      members,
      expenses: [expense("two", "b"), expense("one", "a")],
    };
    expect(canonicalSettlementSourceJson(first)).toBe(
      canonicalSettlementSourceJson({
        ...first,
        expenses: [...first.expenses].reverse(),
      }),
    );
    expect(
      createHash("sha256").update(canonicalSettlementSourceJson(first)).digest("hex"),
    ).toHaveLength(64);
  });

  it("detects a divergent local source even when cursors are otherwise unchanged", () => {
    const canonical = expense("server-one", "a");
    const local = {
      ...canonical,
      id: "local-one",
      serverId: canonical.id,
      serverRevision: canonical.revision,
      creatorMemberId: null,
      title: "Server one",
      description: null,
      category: "transport",
      economicDate: null,
      deletedAt: null,
      syncStatus: "SYNCED" as const,
      createdAt: canonical.occurredAt,
      updatedAt: canonical.occurredAt,
      status: canonical.businessStatus,
      journeyId: "journey",
      paymentRecords: [],
      participants: canonical.participants.map((participant) => ({
        ...participant,
        householdIdSnapshot: null,
      })),
      valuation: canonical.valuation
        ? {
            ...canonical.valuation,
            effectiveAt: canonical.valuation.effectiveAt ?? undefined,
          }
        : null,
    };
    const source = {
      journeyId: "journey",
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 4,
      members,
      expenses: [canonical],
    };
    expect(
      canonicalLocalSettlementSourceJson(
        "journey",
        source.throughTimestamp,
        [local],
        new Set(),
      ),
    ).toBe(canonicalSettlementSourceJson(source));
    expect(
      canonicalLocalSettlementSourceJson(
        "journey",
        source.throughTimestamp,
        [{ ...local, original: { ...local.original, minor: 101 } }],
        new Set(),
      ),
    ).not.toBe(canonicalSettlementSourceJson(source));
  });

  it("classifies financial input equality without revision-only noise", () => {
    const [input] = preview([expense("one", "a")]).inputs;
    expect(canonicalSettlementInputsJson([input])).toBe(
      canonicalSettlementInputsJson([{ ...input, expenseRevision: 99 }]),
    );
    expect(canonicalSettlementInputsJson([input])).not.toBe(
      canonicalSettlementInputsJson([
        { ...input, settlement: { ...input.settlement, minor: 101 } },
      ]),
    );
  });

  it("classifies confirmation changes by source eligibility, not deletion", () => {
    const one = preview([expense("one", "a")]).inputs[0];
    const two = preview([expense("two", "b")]).inputs[0];
    expect(
      buildSettlementConfirmationDiff(
        [one, two],
        [
          { ...one, expenseRevision: 99 },
          {
            ...preview([expense("three", "a")]).inputs[0],
            settlement: { ...one.settlement, minor: 101 },
          },
        ],
      ),
    ).toEqual([
      { expenseId: "three", change: "ADDED" },
      { expenseId: "two", change: "REMOVED" },
    ]);
    expect(
      buildSettlementConfirmationDiff(
        [one],
        [{ ...one, settlement: { ...one.settlement, minor: 101 } }],
      ),
    ).toEqual([{ expenseId: "one", change: "CHANGED" }]);
  });

  it("reports an accepted valued Expense becoming rate-required as removed", () => {
    const accepted = expense("one", "a");
    const confirmed = preview([accepted]).inputs;
    const current = buildSettlementPreview({
      journeyId: "journey",
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 4,
      members,
      expenses: [
        {
          ...accepted,
          businessStatus: "RATE_REQUIRED",
          valuation: null,
        },
      ],
    }).inputs;
    expect(buildSettlementConfirmationDiff(confirmed, current)).toEqual([
      { expenseId: "one", change: "REMOVED" },
    ]);
  });

  it("blocks unresolved rates and conflicts while excluding drafts and deletes", () => {
    const rate = {
      ...expense("rate", "a"),
      businessStatus: "RATE_REQUIRED" as const,
      valuation: null,
    };
    const conflict = { ...expense("conflict", "a"), hasOpenConflict: true };
    const deleted = { ...expense("deleted", "a"), businessStatus: "DELETED" as const };
    const draft = { ...expense("draft", "a"), businessStatus: "DRAFT" as const };
    const result = preview([rate, conflict, deleted, draft]);
    expect(result.state).toBe("PREVIEW_BLOCKED");
    expect(result.blockers).toEqual([
      { expenseId: "conflict", reason: "OPEN_CONFLICT" },
      { expenseId: "rate", reason: "RATE_REQUIRED" },
    ]);
    expect(result.exclusions).toEqual([
      { expenseId: "deleted", reason: "DELETED" },
      { expenseId: "draft", reason: "DRAFT" },
    ]);
  });

  it("excludes ACCEPTED expenses from debt with a stable non-blocking reason", () => {
    const result = preview([
      { ...expense("excluded", "a"), settlementParticipation: "EXCLUDED" },
    ]);
    expect(result.state).toBe("PREVIEW_READY");
    expect(result.inputs).toEqual([]);
    expect(result.balances.every((balance) => balance.netMinor === 0)).toBe(true);
    expect(result.transfers).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.exclusions).toEqual([
      { expenseId: "excluded", reason: "EXCLUDED_FROM_SETTLEMENT" },
    ]);
  });

  it("freezes normalized facts independently from later source mutation", () => {
    const source = expense("one", "a");
    const result = preview([source]);
    source.original.minor = 999;
    source.valuation!.settlement.minor = 999;
    source.splits[0].settlementMinor = 999;
    source.participants[0].displayNameSnapshot = "Changed";

    expect(result.inputs[0].original.minor).toBe(100);
    expect(result.inputs[0].settlement.minor).toBe(100);
    expect(result.inputs[0].splits[0]).toMatchObject({
      member: { displayNameSnapshot: "A" },
      settlementMinor: 34,
    });
  });
});
