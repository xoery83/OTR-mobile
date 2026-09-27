import { expect, it } from "vitest";
import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceipt, parseReceiptEvidenceSet } from "./parseReceipt";

function document(...texts: string[]): OcrDocument {
  return {
    engine: "apple-vision",
    engineRevision: 3,
    imageWidth: 1200,
    imageHeight: 1800,
    durationMs: 8,
    supportedLanguages: ["en-US"],
    observations: texts.map((text, index) => ({
      text,
      confidence: 0.9,
      boundingBox: { x: 0.05, y: 0.05 + index * 0.1, width: 0.65, height: 0.03 },
    })),
  };
}

const set = (...documents: { documentId: string; document: OcrDocument }[]) =>
  parseReceiptEvidenceSet({ documents });

it("preserves one-document B4.2 candidates and statuses with scoped identities", () => {
  const input = document("Cafe Maple", "PURCHASE DATE 27/09/2026", "TOTAL NZ$86.40");
  const single = parseReceipt(input);
  const combined = set({ documentId: "d1", document: input });
  expect(combined.status).toEqual(single.status);
  expect(
    combined.amountCandidates.map(
      ({ decimal, currency, minorUnits, score, reasons }) => ({
        decimal,
        currency,
        minorUnits,
        score,
        reasons,
      }),
    ),
  ).toEqual(
    single.amountCandidates.map(({ decimal, currency, minorUnits, score, reasons }) => ({
      decimal,
      currency,
      minorUnits,
      score,
      reasons,
    })),
  );
  expect(combined.merchantCandidates.map(({ name, score }) => ({ name, score }))).toEqual(
    single.merchantCandidates.map(({ name, score }) => ({ name, score })),
  );
  expect(combined.dateCandidates.map(({ date, score }) => ({ date, score }))).toEqual(
    single.dateCandidates.map(({ date, score }) => ({ date, score })),
  );
  expect(combined.amountCandidates[0].evidence[0].observationId).toBe("d1:o2");
  expect(combined.document.lines[0].id).toBe("d1:l0");
  const separateCode = document("TOTAL 86.40", "CURRENCY NZD");
  expect(
    set({ documentId: "d1", document: separateCode }).amountCandidates[0].currency,
  ).toBe(parseReceipt(separateCode).amountCandidates[0].currency);
});

it("combines merchant/date from one part and final total from another", () => {
  const result = set(
    {
      documentId: "header",
      document: document("Cafe Maple", "PURCHASE DATE 27/09/2026", "SUBTOTAL 70.00"),
    },
    { documentId: "footer", document: document("TOTAL 86.40", "CARD PAYMENT 86.40") },
  );
  expect(result.merchantCandidates[0].name).toBe("Cafe Maple");
  expect(result.dateCandidates[0].date).toBe("2026-09-27");
  expect(result.amountCandidates[0].decimal).toBe("86.40");
  expect(result.amountCandidates[0].evidence[0].observationId).toMatch(/^footer:/);
  expect(result.status.amount).toBe("clear");
});

it("scopes all evidence IDs and keeps conflicting totals ambiguous", () => {
  const result = set(
    { documentId: "first", document: document("TOTAL 75.00") },
    { documentId: "second", document: document("TOTAL 86.40") },
  );
  expect(result.amountCandidates.map((item) => item.decimal)).toEqual(["75.00", "86.40"]);
  expect(result.status.amount).toBe("ambiguous");
  expect(result.warnings).toContain("CONFLICTING_TOTALS");
  const observations = result.document.lines.flatMap((line) =>
    line.fragments.map((item) => item.id),
  );
  expect(new Set(observations).size).toBe(observations.length);
  expect(observations).toEqual(["first:o0", "second:o0"]);
});

it("does not reinforce a duplicated overlapping total or merchant across photos", () => {
  const one = set({
    documentId: "first",
    document: document("Cafe Maple", "TOTAL 86.40"),
  });
  const two = set(
    { documentId: "first", document: document("Cafe Maple", "TOTAL 86.40") },
    { documentId: "second", document: document("Cafe Maple", "TOTAL 86.40") },
  );
  expect(two.amountCandidates[0].score).toBe(one.amountCandidates[0].score);
  expect(two.amountCandidates[0].reasons).not.toContain("DUPLICATE_FINAL_AMOUNT");
  expect(two.merchantCandidates[0].score).toBe(one.merchantCandidates[0].score);
  expect(two.merchantCandidates[0].reasons).not.toContain("REPEATED_NAME");
  expect(two.amountCandidates[0].evidence.map((item) => item.observationId)).toEqual(
    expect.arrayContaining(["first:o1", "second:o1"]),
  );
});

it("retains same-date evidence from overlapping photos without extra points", () => {
  const one = set({
    documentId: "first",
    document: document("PURCHASE DATE 27/09/2026"),
  });
  const two = set(
    { documentId: "first", document: document("PURCHASE DATE 27/09/2026") },
    { documentId: "second", document: document("PURCHASE DATE 27/09/2026") },
  );
  expect(two.dateCandidates[0].score).toBe(one.dateCandidates[0].score);
  expect(two.dateCandidates[0].evidence.map((item) => item.observationId)).toEqual(
    expect.arrayContaining(["first:o0", "second:o0"]),
  );
});

it("pairs an unmarked total with a unique explicit code from another part", () => {
  const result = set(
    { documentId: "total", document: document("TOTAL 86.40") },
    { documentId: "code", document: document("CURRENCY NZD") },
  );
  expect(result.amountCandidates[0]).toMatchObject({
    decimal: "86.40",
    currency: "NZD",
    minorUnits: 8640,
  });
  expect(result.amountCandidates[0].evidence.map((item) => item.observationId)).toEqual(
    expect.arrayContaining(["total:o0", "code:o0"]),
  );
  const conflicted = set(
    { documentId: "total", document: document("TOTAL 86.40") },
    { documentId: "code1", document: document("NZD") },
    { documentId: "code2", document: document("USD") },
  );
  expect(conflicted.amountCandidates[0].currency).toBeNull();
  expect(conflicted.status.currency).toBe("ambiguous");
});

it("keeps adjacency and stable evidence identity inside each document", () => {
  const header = document("TOTAL");
  const value = document("86.40");
  const forward = set(
    { documentId: "header", document: header },
    { documentId: "value", document: value },
  );
  const reversed = set(
    { documentId: "value", document: value },
    { documentId: "header", document: header },
  );
  expect(forward.amountCandidates[0].reasons).not.toContain("ADJACENT_LINE_VALUE");
  expect(forward.amountCandidates[0].score).toBe(reversed.amountCandidates[0].score);
  expect(forward.amountCandidates[0].evidence).toEqual(
    reversed.amountCandidates[0].evidence,
  );
});

it("keeps different strong merchants ambiguous across parts", () => {
  const prominent = document("Cafe Maple", "PHONE 12345678");
  prominent.observations[0].boundingBox.height = 0.08;
  prominent.observations[1].boundingBox.height = 0.02;
  const result = set(
    { documentId: "first", document: prominent },
    { documentId: "second", document: document("Mountain Books") },
  );
  expect(result.merchantCandidates.map((item) => item.name)).toEqual([
    "Cafe Maple",
    "Mountain Books",
  ]);
  expect(
    result.merchantCandidates[0].score - result.merchantCandidates[1].score,
  ).toBeGreaterThanOrEqual(15);
  expect(result.status.merchant).toBe("ambiguous");
});

it("rejects duplicate identities, unsafe IDs and a fourth document", () => {
  const input = document("TOTAL 1.00");
  expect(() =>
    set({ documentId: "d1", document: input }, { documentId: "d1", document: input }),
  ).toThrow();
  expect(() => set({ documentId: "d:1", document: input })).toThrow();
  expect(() =>
    set(...[1, 2, 3, 4].map((n) => ({ documentId: `d${n}`, document: input }))),
  ).toThrow();
});
