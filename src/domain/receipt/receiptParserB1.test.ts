import { describe, expect, it, vi } from "vitest";
import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceipt } from "./parseReceipt";

type Row = [text: string, x?: number, y?: number, width?: number, confidence?: number];
const document = (...rows: Row[]): OcrDocument => ({
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 1800,
  durationMs: 80,
  supportedLanguages: ["en-US", "zh-Hans", "ja-JP"],
  observations: rows.map(([text, x = 0.05, y = 0.1, width = 0.8, confidence = 0.9]) => ({
    text,
    confidence,
    boundingBox: { x, y, width, height: 0.025 },
  })),
});
const parseB1 = (input: OcrDocument, context: { journeyCurrency?: string } = {}) =>
  parseReceipt(input, context).document;
const values = (input: OcrDocument) =>
  parseB1(input).numericCandidates.map((candidate) => candidate.decimal);

describe("receipt parser B1", () => {
  it("orders shuffled OCR fragments by geometry and assigns transient evidence IDs", () => {
    const parsed = parseB1(
      document(
        ["86.40", 0.72, 0.2, 0.15],
        ["SYNTHETIC MARKET", 0.05, 0.05, 0.5],
        ["TOTAL", 0.05, 0.2, 0.2],
      ),
    );
    expect(parsed.lines.map((line) => line.text)).toEqual([
      "SYNTHETIC MARKET",
      "TOTAL 86.40",
    ]);
    expect(parsed.lines[1].fragments.map((item) => item.id)).toEqual(["o2", "o0"]);
    expect(parsed.lines[1].boundingBox).toMatchObject({ x: 0.05, y: 0.2 });
    expect(parsed.numericCandidates[0].evidence).toEqual([
      { observationId: "o0", lineId: "l1", start: 0, end: 5 },
    ]);
  });

  it("joins nearby split characters without corrupting CJK or Latin labels", () => {
    const parsed = parseB1(
      document(
        ["合", 0.05, 0.1, 0.02],
        ["計", 0.071, 0.1, 0.02],
        ["TO", 0.05, 0.2, 0.03],
        ["TAL", 0.081, 0.2, 0.05],
        ["86.40", 0.7, 0.2, 0.15],
      ),
    );
    expect(parsed.lines.map((line) => line.text)).toEqual(["合計", "TOTAL 86.40"]);
  });

  it.each([
    ["86.40", "86.40"],
    ["86,40", "86.40"],
    ["1,234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1,234,567", "1234567"],
    ["1.234.567", "1234567"],
    ["€1.234,56", "1234.56"],
    ["NZ$1,234.56", "1234.56"],
    ["RMB 86.40", "86.40"],
    ["CNY 86.40", "86.40"],
    ["86.40 NZD", "86.40"],
    ["￥８，５２０", "8520"],
  ])("normalizes %s exactly to %s", (raw, expected) => {
    expect(values(document([raw]))).toContain(expected);
  });

  it("preserves a one-separator three-digit ambiguity", () => {
    const parsed = parseB1(document(["1,234"]));
    expect(parsed.numericCandidates.map((item) => item.decimal)).toEqual([
      "1234",
      "1.234",
    ]);
    expect(
      parsed.numericCandidates.every((item) =>
        item.reasons.includes("NUMERIC_FORMAT_AMBIGUOUS"),
      ),
    ).toBe(true);
    expect(parsed.warnings).toContain("AMBIGUOUS_AMOUNT_SEPARATOR");
    expect(values(document(["¥8,520"]))).toEqual(["8520", "8.520"]);
    expect(values(document(["12,50"]))).toEqual(["12.50"]);
  });

  it("associates attached and nearby currencies, but not a context hint", () => {
    const parsed = parseB1(
      document(
        ["NZ$86.40", 0.05, 0.1, 0.25],
        ["86.40 NZD", 0.05, 0.2, 0.3],
        ["€", 0.05, 0.3, 0.02],
        ["12,50", 0.09, 0.3, 0.12],
      ),
      { journeyCurrency: "AUD" },
    );
    expect(
      parsed.numericCandidates.map((item) => item.currencyCandidateIds.length),
    ).toEqual([1, 1, 1]);
    expect(
      parsed.currencyCandidates.find(
        (item) => item.code === "AUD" && item.source === "context",
      )?.numericCandidateIds,
    ).toEqual([]);
    expect(
      parsed.currencyCandidates.some(
        (item) => item.code === "NZD" && item.strength === "region-symbol",
      ),
    ).toBe(true);
    expect(
      parsed.currencyCandidates.some(
        (item) => item.code === "EUR" && item.strength === "distinct-symbol",
      ),
    ).toBe(true);
  });

  it("keeps bare dollar and yen ambiguous while explicit USD outranks an NZD hint", () => {
    const bare = parseB1(document(["$86.40"], ["¥8,520", 0.05, 0.2]), {
      journeyCurrency: "NZD",
    });
    expect(bare.currencyCandidates.find((item) => item.raw === "$")).toMatchObject({
      code: null,
      strength: "ambiguous-symbol",
    });
    expect(
      bare.currencyCandidates.find((item) => item.raw === "¥")?.possibleCodes,
    ).toEqual(["JPY", "CNY"]);
    expect(bare.currencyCandidates.find((item) => item.source === "context")?.code).toBe(
      "NZD",
    );
    const conflict = parseB1(document(["USD 86.40"]), {
      journeyCurrency: "NZD",
    });
    expect(conflict.currencyCandidates.map((item) => [item.code, item.score])).toEqual([
      ["USD", 75],
      ["NZD", 10],
    ]);
  });

  it("extracts Japanese, Chinese, mixed-script, and qualified symbol evidence", () => {
    const parsed = parseB1(
      document(
        ["合計 ¥8,520", 0.05, 0.1],
        ["总计 RMB 86.40", 0.05, 0.2],
        ["TOTAL CNY 86.40", 0.05, 0.3],
        ["お支払金額 円8520", 0.05, 0.4],
        ["A$12.50", 0.05, 0.5],
        ["US$13.50", 0.05, 0.6],
        ["CN¥14", 0.05, 0.7],
        ["86.40元", 0.05, 0.8],
      ),
    );
    expect(parsed.currencyCandidates.map((item) => item.code)).toEqual(
      expect.arrayContaining(["CNY", "JPY", "AUD", "USD"]),
    );
    expect(
      parsed.currencyCandidates.some(
        (item) => item.strength === "ambiguous-symbol" && item.raw === "¥",
      ),
    ).toBe(true);
    expect(parsed.numericCandidates.map((item) => item.decimal)).toContain("86.40");
    expect(parsed.numericCandidates.map((item) => item.decimal)).toContain("8520");
  });

  it("keeps duplicate values and subtotal/tax/total values as separate occurrences for B2", () => {
    const parsed = parseB1(
      document(
        ["SUBTOTAL 75.13", 0.05, 0.1],
        ["GST 11.27", 0.05, 0.2],
        ["TOTAL 86.40", 0.05, 0.3],
        ["EFTPOS 86.40", 0.05, 0.4],
      ),
    );
    expect(parsed.numericCandidates.map((item) => item.decimal)).toEqual([
      "75.13",
      "11.27",
      "86.40",
      "86.40",
    ]);
    expect(parsed.numericCandidates[2].evidence).not.toEqual(
      parsed.numericCandidates[3].evidence,
    );
    expect(
      parsed.numericCandidates.every(
        (item) => !item.reasons.some((reason) => reason.includes("TOTAL")),
      ),
    ).toBe(true);
  });

  it("retains a card payment amount while filtering card identifiers", () => {
    expect(
      values(document(["CARD PAYMENT 86.40"], ["CARD 123456789012", 0.05, 0.2])),
    ).toEqual(["86.40"]);
  });

  it("filters obvious contact, reference, date, time, percent, and quantity numbers", () => {
    const parsed = parseB1(
      document(
        ["PHONE 021 123 4567", 0.05, 0.1],
        ["REF 1234567890123456", 0.05, 0.2],
        ["DATE 2026-09-27", 0.05, 0.3],
        ["时间 2026年9月27日", 0.05, 0.4],
        ["TIME 12:30", 0.05, 0.5],
        ["DISCOUNT 10%", 0.05, 0.6],
        ["QTY 2 PRICE 86.40", 0.05, 0.7],
      ),
    );
    expect(parsed.numericCandidates.map((item) => item.decimal)).toEqual(["86.40"]);
  });

  it("handles empty, noisy, and invalid observations without network or runtime state", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const empty = parseB1(document());
    expect(empty).toMatchObject({
      lines: [],
      numericCandidates: [],
      currencyCandidates: [],
      warnings: [],
    });
    const noisy = document(["TOTAL 86.40"], ["%%%", 0.05, 0.2]);
    noisy.observations.push({
      text: "BAD",
      confidence: 0.9,
      boundingBox: { x: NaN, y: 0, width: 0.2, height: 0.02 },
    });
    expect(parseB1(noisy)).toMatchObject({
      warnings: ["IGNORED_OBSERVATION"],
    });
    expect(parseB1(noisy).numericCandidates.map((item) => item.decimal)).toEqual([
      "86.40",
    ]);
    const first = document(["NZD 10.00", 0.05, 0.1], ["USD 20.00", 0.05, 0.2]);
    const reordered = { ...first, observations: [...first.observations].reverse() };
    expect(parseB1(first).lines.map((item) => item.text)).toEqual(
      parseB1(reordered).lines.map((item) => item.text),
    );
    expect(values(first)).toEqual(values(reordered));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
