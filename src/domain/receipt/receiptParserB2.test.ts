import { describe, expect, it } from "vitest";
import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceipt } from "./parseReceipt";

type Row = [text: string, y?: number, x?: number, width?: number];
const doc = (rows: Row[]): OcrDocument => ({
  engine: "apple-vision",
  engineRevision: 3,
  imageWidth: 1200,
  imageHeight: 1800,
  durationMs: 1,
  supportedLanguages: ["en-US", "zh-Hans", "ja-JP"],
  observations: rows.map(([text, y = 0.1, x = 0.05, width = 0.8]) => ({
    text,
    confidence: 0.9,
    boundingBox: { x, y, width, height: 0.025 },
  })),
});
const rank = (rows: Row[], journeyCurrency?: string) => {
  const result = parseReceipt(doc(rows), { journeyCurrency });
  return {
    amountCandidates: result.amountCandidates,
    status: result.status.amount,
    warnings: result.warnings,
  };
};

type Fixture = {
  name: string;
  rows: Row[];
  expected: string | null;
  status: "clear" | "ambiguous" | "none";
  currency?: string;
  hint?: string;
};
const fixtures: Fixture[] = [
  {
    name: "subtotal GST total",
    rows: [["SUBTOTAL 75.13"], ["GST 11.27", 0.2], ["TOTAL 86.40", 0.3]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "subtotal tax grand total",
    rows: [["SUBTOTAL 80.00"], ["TAX 6.40", 0.2], ["GRAND TOTAL 86.40", 0.3]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "repeated EFTPOS",
    rows: [["TOTAL 86.40"], ["EFTPOS 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "card payment",
    rows: [["TOTAL 86.40"], ["CARD PAYMENT 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "due and paid",
    rows: [["AMOUNT DUE 86.40"], ["AMOUNT PAID 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "cash tendered larger",
    rows: [["TOTAL 86.40"], ["CASH TENDERED 100.00", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "change",
    rows: [["TOTAL 86.40"], ["CHANGE 13.60", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "separate tip",
    rows: [["TIP 15.00"], ["TOTAL 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "separate surcharge",
    rows: [["SURCHARGE 1.40"], ["TOTAL 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "discount and savings",
    rows: [["DISCOUNT 12.00"], ["SAVINGS 12.00", 0.2], ["TOTAL 86.40", 0.3]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "loyalty balance larger",
    rows: [["LOYALTY BALANCE 900.00"], ["TOTAL 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  { name: "unlabeled amount", rows: [["€86.40"]], expected: null, status: "ambiguous" },
  {
    name: "no credible amount",
    rows: [["SUBTOTAL 75.13"], ["TAX 11.27", 0.2]],
    expected: null,
    status: "ambiguous",
  },
  { name: "blank", rows: [], expected: null, status: "none" },
  {
    name: "conflicting totals",
    rows: [["TOTAL 86.40"], ["TOTAL 96.40", 0.2]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "USD over NZD hint",
    rows: [["TOTAL USD 86.40"]],
    expected: "86.40",
    status: "clear",
    currency: "USD",
    hint: "NZD",
  },
  {
    name: "bare dollar with NZD hint",
    rows: [["TOTAL $86.40"]],
    expected: "86.40",
    status: "clear",
    currency: "NZD",
    hint: "NZD",
  },
  {
    name: "Japanese total",
    rows: [["お支払金額 円8520"]],
    expected: "8520",
    status: "clear",
    currency: "JPY",
  },
  {
    name: "Chinese simplified total",
    rows: [["总计 CNY 86.40"]],
    expected: "86.40",
    status: "clear",
    currency: "CNY",
  },
  {
    name: "Chinese traditional due",
    rows: [["應付 CNY 86.40"]],
    expected: "86.40",
    status: "clear",
    currency: "CNY",
  },
  {
    name: "Chinese integer due after colon",
    rows: [["應付:128"]],
    expected: "128",
    status: "clear",
  },
  {
    name: "Chinese cash payment after split labels",
    rows: [["支付:現金:288"]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "Japanese integer total without currency",
    rows: [["合計:8520"]],
    expected: "8520",
    status: "clear",
  },
  {
    name: "CJK subtotal and change",
    rows: [["小計 円8000"], ["お釣り 円1480", 0.2], ["合計 円8520", 0.3]],
    expected: "8520",
    status: "clear",
    currency: "JPY",
  },
  {
    name: "European decimal comma",
    rows: [["TOTAL €86,40"]],
    expected: "86.40",
    status: "clear",
    currency: "EUR",
  },
  {
    name: "European grouped",
    rows: [["TOTAL €1.234,56"]],
    expected: "1234.56",
    status: "clear",
    currency: "EUR",
  },
  {
    name: "US grouped",
    rows: [["TOTAL NZ$1,234.56"]],
    expected: "1234.56",
    status: "clear",
    currency: "NZD",
  },
  {
    name: "ambiguous separator",
    rows: [["TOTAL 1,234"]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "same value different currencies",
    rows: [["TOTAL USD 86.40"], ["TOTAL NZD 86.40", 0.2]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "large reference",
    rows: [["REF 999999999999"], ["TOTAL 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "generic amount weaker",
    rows: [["AMOUNT 75.13"], ["TOTAL 86.40", 0.2]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "value before label",
    rows: [["86.40 TOTAL"]],
    expected: "86.40",
    status: "clear",
  },
  {
    name: "adjacent next line",
    rows: [
      ["TOTAL", 0.1],
      ["86.40", 0.127],
    ],
    expected: "86.40",
    status: "clear",
  },
];

describe("receipt parser B2", () => {
  it.each(fixtures)("ranks $name", ({ rows, expected, status, currency, hint }) => {
    const result = rank(rows, hint);
    expect(result.status).toBe(status);
    if (expected) {
      expect(result.amountCandidates[0]?.decimal).toBe(expected);
      if (currency) expect(result.amountCandidates[0]?.currency).toBe(currency);
    }
  });

  it("keeps both final occurrences and their label reasons in one candidate", () => {
    const result = rank([["TOTAL 86.40"], ["EFTPOS 86.40", 0.2]]);
    expect(result.amountCandidates).toHaveLength(1);
    expect(result.amountCandidates[0].numericCandidateIds).toHaveLength(2);
    expect([
      ...new Set(result.amountCandidates[0].evidence.map((item) => item.observationId)),
    ]).toEqual(["o0", "o1"]);
    expect(result.amountCandidates[0].reasons).toEqual(
      expect.arrayContaining([
        "EXPLICIT_TOTAL",
        "PAYMENT_MATCH",
        "DUPLICATE_FINAL_AMOUNT",
      ]),
    );
  });

  it("does not reinforce a matching subtotal as a second final amount", () => {
    const result = rank([["SUBTOTAL 86.40"], ["TOTAL 86.40", 0.2]]);
    expect(result.amountCandidates).toHaveLength(1);
    expect(result.amountCandidates[0].reasons).not.toContain("DUPLICATE_FINAL_AMOUNT");
  });

  it("does not apply distant or preceding-line labels to unrelated values", () => {
    const distant = rank([["TOTAL"], ["UNRELATED", 0.2], ["86.40", 0.3]]);
    expect(distant.status).toBe("ambiguous");
    expect(distant.amountCandidates[0].reasons).not.toContain("EXPLICIT_TOTAL");
    const previous = rank([["86.40"], ["TOTAL", 0.2]]);
    expect(previous.status).toBe("ambiguous");
  });

  it("keeps conflicting explicit values and currencies separate", () => {
    const totals = rank([["TOTAL 86.40"], ["TOTAL 96.40", 0.2]]);
    expect(totals.warnings).toContain("CONFLICTING_TOTALS");
    const currencies = rank([["TOTAL USD 86.40"], ["TOTAL NZD 86.40", 0.2]]);
    expect(currencies.amountCandidates).toHaveLength(2);
    expect(currencies.status).toBe("ambiguous");
  });

  it("retains bare yen and unresolved separator ambiguity", () => {
    const yen = rank([["合計 ¥8520"]]);
    expect(yen.status).toBe("ambiguous");
    expect(yen.warnings).toContain("AMBIGUOUS_CURRENCY_SYMBOL");
    const separator = rank([["TOTAL 1,234"]]);
    expect(separator.status).toBe("ambiguous");
    expect(separator.warnings).toContain("AMBIGUOUS_AMOUNT_SEPARATOR");
    const yenInteger = rank([["合計 JPY 8,520"]]);
    expect(yenInteger.status).toBe("clear");
    expect(yenInteger.amountCandidates[0].minorUnits).toBe(8520);
  });

  it("associates the nearest label when a line has two amounts", () => {
    const result = rank([["SUBTOTAL 75.13 TOTAL 86.40"]]);
    expect(result.status).toBe("clear");
    expect(result.amountCandidates[0].decimal).toBe("86.40");
    expect(result.amountCandidates[1].reasons).toContain("SUBTOTAL_PENALTY");
  });

  it("does not let a distant label claim an unrelated amount", () => {
    const result = rank([["TOTAL 12.00 item code 77 88.00"]]);
    expect(result.amountCandidates[0].decimal).toBe("12.00");
    expect(
      result.amountCandidates.find((item) => item.decimal === "88.00")?.reasons,
    ).not.toContain("EXPLICIT_TOTAL");
  });

  it("abstains when a second plausible final value conflicts", () => {
    const result = rank([["TOTAL 29.40"], ["PAYMENT 21.10", 0.2]]);
    expect(result.status).toBe("ambiguous");
    expect(result.warnings).toContain("CONFLICTING_TOTALS");
  });

  it("orders deterministically across observation order", () => {
    const rows: Row[] = [
      ["GST 11.27", 0.2],
      ["TOTAL 86.40", 0.3],
      ["SUBTOTAL 75.13", 0.1],
    ];
    expect(
      rank(rows).amountCandidates.map(({ decimal, currency, score, reasons }) => ({
        decimal,
        currency,
        score,
        reasons,
      })),
    ).toEqual(
      rank([...rows].reverse()).amountCandidates.map(
        ({ decimal, currency, score, reasons }) => ({
          decimal,
          currency,
          score,
          reasons,
        }),
      ),
    );
  });

  it("reports a test-only synthetic evaluation summary", () => {
    const summary = {
      fixtureCount: fixtures.length,
      topCorrect: 0,
      presentNotTop: 0,
      correctAbstain: 0,
      incorrectConfidentSelection: 0,
    };
    for (const fixture of fixtures) {
      const result = rank(fixture.rows, fixture.hint);
      if (fixture.expected === null) {
        if (result.status !== "clear") summary.correctAbstain++;
        else summary.incorrectConfidentSelection++;
      } else if (
        result.status === "clear" &&
        result.amountCandidates[0]?.decimal === fixture.expected &&
        (!fixture.currency || result.amountCandidates[0]?.currency === fixture.currency)
      )
        summary.topCorrect++;
      else if (
        result.amountCandidates.some(
          (candidate) =>
            candidate.decimal === fixture.expected &&
            (!fixture.currency || candidate.currency === fixture.currency),
        )
      )
        summary.presentNotTop++;
      else if (result.status === "clear") summary.incorrectConfidentSelection++;
    }
    expect(summary).toEqual({
      fixtureCount: 33,
      topCorrect: 26,
      presentNotTop: 0,
      correctAbstain: 7,
      incorrectConfidentSelection: 0,
    });
  });
});
