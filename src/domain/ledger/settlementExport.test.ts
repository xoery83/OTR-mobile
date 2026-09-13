import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildSettlementStatement,
  canonicalSettlementStatementJson,
  type SettlementLineageSnapshot,
  type SettlementStatement,
} from "./settlementStatement";
import {
  buildSettlementExportDocument,
  settlementExportCsv,
  settlementExportHtml,
} from "./settlementExport";

const statement: SettlementStatement = {
  schemaVersion: 1,
  journeyId: "journey-secret",
  rootSettlementId: "root-secret",
  headSettlementId: "root-secret",
  throughTimestamp: "2026-09-12T00:00:00.000Z",
  settlementCurrency: "NZD",
  settlementScale: 2,
  algorithmVersion: "ledger-settlement-greedy-v1",
  eligibilityVersion: "ledger-settlement-eligibility-v1",
  adjustmentState: "CURRENT",
  fullySettled: true,
  outstandingBalances: [],
  lineage: [
    {
      id: "root-secret",
      kind: "ROOT",
      sequence: 0,
      parentAdjustmentId: null,
      inputDigest: "a".repeat(64),
      priorInputDigest: null,
      adjustmentReason: null,
      finalizedAt: "2026-09-12T00:00:00.000Z",
      balances: [
        {
          memberId: "member-secret",
          displayNameSnapshot: '=HYPERLINK("bad")',
          paidMinor: 100,
          owedMinor: 100,
          transferredMinor: 0,
          netMinor: 0,
          currency: "NZD",
          scale: 2,
        },
      ],
      adjustmentDeltas: [],
      inputs: [],
      transfers: [],
      auditEvents: [
        {
          id: "audit-secret",
          eventType: "FINALIZED",
          actorMemberId: "member-secret",
          reason: "+private,\nreason",
          transferId: null,
          paymentId: null,
          dischargeId: null,
          authority: null,
          revision: 1,
          createdAt: "2026-09-12T00:00:00.000Z",
        },
      ],
    },
  ],
};

describe("Stage 7.3 export rendering", () => {
  it("uses RFC 4180 escaping and protects user text from formulas", () => {
    const csv = settlementExportCsv(buildSettlementExportDocument(statement, "MEMBER"));
    expect(csv.startsWith("\uFEFFrecord_type")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(csv).toContain(`"'+private,\nreason"`);
    expect(csv).toContain("\r\n");
  });

  it("removes linkable member/entity identities and user text when de-identified", () => {
    const document = buildSettlementExportDocument(statement, "DE_IDENTIFIED");
    const csv = settlementExportCsv(document);
    const html = settlementExportHtml(document);
    for (const secret of [
      "journey-secret",
      "root-secret",
      "member-secret",
      "audit-secret",
      '=HYPERLINK("bad")',
      "+private,\nreason",
    ]) {
      expect(csv).not.toContain(secret);
      expect(html).not.toContain(secret);
    }
    expect(csv).toContain("Member A");
    deepLinkFree(csv);
  });

  it("matches Statement digest source, CSV bytes and normalized PDF content across clients", () => {
    const clientA = buildSettlementStatement(source(false));
    const clientB = buildSettlementStatement(source(true));
    const digest = (value: SettlementStatement) =>
      createHash("sha256").update(canonicalSettlementStatementJson(value)).digest("hex");
    expect(digest(clientA)).toBe(digest(clientB));
    for (const privacy of ["MEMBER", "DE_IDENTIFIED"] as const) {
      const left = buildSettlementExportDocument(clientA, privacy);
      const right = buildSettlementExportDocument(clientB, privacy);
      expect(settlementExportCsv(left)).toBe(settlementExportCsv(right));
      expect(settlementExportHtml(left)).toBe(settlementExportHtml(right));
      expect(settlementExportCsv(left)).not.toContain("account-user-secret");
    }
  });
});

function deepLinkFree(value: string) {
  expect(value).not.toMatch(/https?:\/\//);
  expect(value).not.toMatch(/otrmobile:\/\//);
}

function source(reverse: boolean): SettlementLineageSnapshot[] {
  const balances = [
    {
      memberId: "member-a",
      displayNameSnapshot: "Alice",
      paidMinor: 100,
      owedMinor: 0,
      transferredMinor: 0 as const,
      netMinor: 100,
      currency: "NZD",
      scale: 2,
    },
    {
      memberId: "member-b",
      displayNameSnapshot: "Bob",
      paidMinor: 0,
      owedMinor: 100,
      transferredMinor: 0 as const,
      netMinor: -100,
      currency: "NZD",
      scale: 2,
    },
  ];
  const audits: SettlementLineageSnapshot["auditEvents"] = [
    {
      id: "audit-a",
      eventType: "FINALIZED",
      actorUserId: "account-user-secret",
      actorMemberId: "member-a",
      reason: null,
      transferId: null,
      paymentId: null,
      dischargeId: null,
      authority: null,
      revision: 1,
      createdAt: "2026-09-12T00:00:00.000Z",
    },
    {
      id: "audit-b",
      eventType: "RECEIVED",
      actorUserId: "account-user-secret",
      actorMemberId: "member-b",
      reason: null,
      transferId: null,
      paymentId: null,
      dischargeId: null,
      authority: "RECIPIENT",
      revision: 2,
      createdAt: "2026-09-12T01:00:00.000Z",
    },
  ];
  return [
    {
      id: "root",
      journeyId: "journey",
      kind: "ROOT",
      rootSettlementId: null,
      lineageSequence: 0,
      status: "SETTLED",
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      algorithmVersion: "ledger-settlement-greedy-v1",
      inputDigest: "a".repeat(64),
      finalizedAt: "2026-09-12T00:00:00.000Z",
      adjustmentState: "CURRENT",
      outstandingBalances: [],
      inputs: [],
      balances: reverse ? [...balances].reverse() : balances,
      transfers: [],
      auditEvents: reverse ? [...audits].reverse() : audits,
    },
  ];
}
