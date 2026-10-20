import { describe, expect, it } from "vitest";
import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceipt } from "./parseReceipt";
import { parseReceiptDocumentB1 } from "./receiptParserB1";
import {
  parseReceiptDateMerchantB3,
  type ReceiptParseContextB3,
} from "./receiptParserB3";

type Row = [text: string, y?: number, x?: number, width?: number];
const document = (rows: Row[]): OcrDocument => ({
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
const parse = (rows: Row[], context: ReceiptParseContextB3 = {}) => {
  const result = parseReceipt(document(rows), context);
  return {
    ...result,
    dateStatus: result.status.date,
    merchantStatus: result.status.merchant,
  };
};

type DateFixture = {
  name: string;
  rows: Row[];
  expected: string | null;
  context?: ReceiptParseContextB3;
  status: "clear" | "ambiguous" | "none";
};
const dateFixtures: DateFixture[] = [
  { name: "ISO", rows: [["DATE 2026-09-27"]], expected: "2026-09-27", status: "clear" },
  {
    name: "NZ day first",
    rows: [["DATE 27/09/2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "US month first",
    rows: [["DATE 09/27/2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "ambiguous numeric",
    rows: [["DATE 03/04/2026"]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "ambiguous with context",
    rows: [["DATE 03/04/2026"]],
    expected: "2026-04-03",
    status: "clear",
    context: {
      journeyStartDate: "2026-04-03",
      journeyEndDate: "2026-04-03",
      draftDate: "2026-04-03",
    },
  },
  {
    name: "Chinese transaction",
    rows: [["交易日期 2026年9月27日"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "Japanese transaction",
    rows: [["取引日 2026年09月27日"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "adjacent time",
    rows: [["PURCHASE DATE 27/09/2026 18:42"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "card expiry separate",
    rows: [["CARD EXPIRY 10/2028"], ["TRANSACTION DATE 27/09/2026", 0.2]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "promotion date",
    rows: [["PROMOTION VALID UNTIL 28/09/2026"], ["PURCHASE DATE 27/09/2026", 0.2]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "hotel payment",
    rows: [
      ["CHECK IN 25/09/2026"],
      ["CHECK OUT 27/09/2026", 0.2],
      ["PAYMENT 27/09/2026", 0.3],
    ],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "printed versus purchase",
    rows: [["PURCHASE DATE 27/09/2026"], ["PRINTED 28/09/2026", 0.2]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "two labelled dates on one line",
    rows: [["PURCHASE DATE 27/09/2026 PRINTED 28/09/2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "invalid February",
    rows: [["DATE 31/02/2026"]],
    expected: null,
    status: "none",
  },
  { name: "invalid month", rows: [["DATE 2026-13-20"]], expected: null, status: "none" },
  {
    name: "invalid leap day",
    rows: [["DATE 2026-02-29"]],
    expected: null,
    status: "none",
  },
  {
    name: "valid leap day",
    rows: [["DATE 2028-02-29"]],
    expected: "2028-02-29",
    status: "clear",
  },
  { name: "no credible date", rows: [["TOTAL 86.40"]], expected: null, status: "none" },
  {
    name: "two digit year with anchor",
    rows: [["DATE 27/09/26"]],
    expected: "2026-09-27",
    status: "clear",
    context: { referenceDate: "2026-09-27" },
  },
  {
    name: "two digit year without anchor",
    rows: [["DATE 27/09/26"]],
    expected: null,
    status: "none",
  },
  {
    name: "textual month first",
    rows: [["DATE Sep 27, 2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "textual day first",
    rows: [["DATE 27 September 2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "French abbreviated month",
    rows: [["DATE 14 AOÛ 2017"]],
    expected: "2017-08-14",
    status: "clear",
  },
  {
    name: "dot date",
    rows: [["DATE 27.09.2026"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "unlabeled unique date",
    rows: [["2026-09-27"]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "two competing transaction dates",
    rows: [["TRANSACTION DATE 27/09/2026"], ["TRANSACTION DATE 28/09/2026", 0.2]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "statement period versus purchase",
    rows: [["STATEMENT PERIOD 01/09/2026"], ["PURCHASE DATE 27/09/2026", 0.2]],
    expected: "2026-09-27",
    status: "clear",
  },
  {
    name: "label on preceding line",
    rows: [
      ["TRANSACTION DATE", 0.1],
      ["27/09/2026", 0.127],
    ],
    expected: "2026-09-27",
    status: "clear",
  },
];

type MerchantFixture = {
  name: string;
  rows: Row[];
  expected: string | null;
  status: "clear" | "ambiguous" | "none";
};
const merchantFixtures: MerchantFixture[] = [
  {
    name: "English storefront",
    rows: [["COUNTDOWN"]],
    expected: "COUNTDOWN",
    status: "clear",
  },
  {
    name: "tax invoice above brand",
    rows: [["TAX INVOICE"], ["Starbucks", 0.2]],
    expected: "Starbucks",
    status: "clear",
  },
  {
    name: "brand address phone",
    rows: [["Hotel ABC"], ["12 Queen Street", 0.2], ["PHONE 021 234 5678", 0.3]],
    expected: "Hotel ABC",
    status: "clear",
  },
  {
    name: "brand GST NZBN",
    rows: [["Cafe Maple"], ["GST 123456789", 0.2], ["NZBN 9429000000000", 0.3]],
    expected: "Cafe Maple",
    status: "clear",
  },
  { name: "Chinese", rows: [["海底捞"]], expected: "海底捞", status: "clear" },
  { name: "Japanese", rows: [["一風堂"]], expected: "一風堂", status: "clear" },
  { name: "mixed script", rows: [["ABC咖啡"]], expected: "ABC咖啡", status: "clear" },
  {
    name: "generic headers only",
    rows: [["RECEIPT"], ["THANK YOU", 0.2]],
    expected: null,
    status: "none",
  },
  {
    name: "no credible merchant",
    rows: [["TOTAL 86.40"], ["09:42", 0.2]],
    expected: null,
    status: "none",
  },
  {
    name: "competing brands",
    rows: [["Cafe Maple"], ["Hotel ABC", 0.2]],
    expected: null,
    status: "ambiguous",
  },
  {
    name: "same line split fragments",
    rows: [
      ["STAR", 0.1, 0.05, 0.08],
      ["BUCKS", 0.1, 0.131, 0.1],
    ],
    expected: "STARBUCKS",
    status: "clear",
  },
  {
    name: "payment copy",
    rows: [["MERCHANT COPY"], ["TRANSACTION APPROVED", 0.2], ["EFTPOS", 0.3]],
    expected: null,
    status: "none",
  },
  {
    name: "slogan above brand",
    rows: [["THANK YOU FOR VISITING"], ["Cafe Maple", 0.2]],
    expected: "Cafe Maple",
    status: "clear",
  },
  {
    name: "screenshot controls above brand",
    rows: [["PHOTOS"], ["EDIT IMAGE", 0.15], ["Cafe Maple", 0.2]],
    expected: "Cafe Maple",
    status: "clear",
  },
];

describe("receipt parser B3", () => {
  it.each(dateFixtures)("dates: $name", ({ rows, context, expected, status }) => {
    const result = parse(rows, context);
    expect(result.dateStatus).toBe(status);
    if (expected) expect(result.dateCandidates[0]?.date).toBe(expected);
  });

  it.each(merchantFixtures)("merchants: $name", ({ rows, expected, status }) => {
    const result = parse(rows);
    expect(result.merchantStatus).toBe(status);
    if (expected) expect(result.merchantCandidates[0]?.name).toBe(expected);
  });

  it("preserves both numeric interpretations and exact source evidence", () => {
    const result = parse([["DATE 03/04/2026"]]);
    expect(result.dateCandidates.map((item) => item.date)).toEqual([
      "2026-03-04",
      "2026-04-03",
    ]);
    expect(result.warnings).toContain("AMBIGUOUS_DATE_ORDER");
    expect(result.dateCandidates[0].evidence).toEqual([
      { observationId: "o0", lineId: "l0", start: 5, end: 15 },
      { observationId: "o0", lineId: "l0", start: 0, end: 4 },
    ]);
  });

  it("uses context to rank without removing the other date", () => {
    const result = parse([["DATE 03/04/2026"]], {
      journeyStartDate: "2026-04-03",
      journeyEndDate: "2026-04-03",
      draftDate: "2026-04-03",
    });
    expect(result.dateCandidates.map((item) => item.date)).toEqual([
      "2026-04-03",
      "2026-03-04",
    ]);
    expect(result.dateCandidates[0].reasons).toEqual(
      expect.arrayContaining(["JOURNEY_RANGE_HINT", "EXPENSE_DATE_HINT"]),
    );
  });

  it("penalizes a full card expiry date and keeps locale ambiguity explicit", () => {
    const expiry = parse([
      ["CARD EXPIRY DATE 28/09/2028"],
      ["PURCHASE DATE 27/09/2026", 0.2],
    ]);
    expect(expiry.dateCandidates[0].date).toBe("2026-09-27");
    expect(
      expiry.dateCandidates.find((item) => item.date === "2028-09-28")?.reasons,
    ).toContain("EXPIRY_DATE_PENALTY");
    const locale = parse([["DATE 03/04/2026"]], { locale: "en-US" });
    expect(locale.dateCandidates).toHaveLength(2);
    expect(locale.dateStatus).toBe("ambiguous");
  });

  it("does not let Journey context settle conflicting transaction labels", () => {
    const result = parse(
      [["TRANSACTION DATE 27/09/2026"], ["TRANSACTION DATE 28/09/2026", 0.2]],
      {
        journeyStartDate: "2026-09-27",
        journeyEndDate: "2026-09-27",
        draftDate: "2026-09-27",
      },
    );
    expect(result.dateStatus).toBe("ambiguous");
    expect(result.warnings).toContain("CONFLICTING_TRANSACTION_DATES");
  });

  it("keeps semantic ordering stable when OCR observation order changes", () => {
    const rows: Row[] = [
      ["PURCHASE DATE 27/09/2026", 0.3],
      ["PRINTED 28/09/2026", 0.4],
      ["Cafe Maple", 0.1],
    ];
    const project = (items: Row[]) => {
      const result = parse(items);
      return {
        dates: result.dateCandidates.map(({ date, score, reasons }) => ({
          date,
          score,
          reasons,
        })),
        merchants: result.merchantCandidates.map(({ name, score, reasons }) => ({
          name,
          score,
          reasons,
        })),
      };
    };
    expect(project(rows)).toEqual(project([...rows].reverse()));
  });

  it("uses a genuinely taller header to resolve two plausible names", () => {
    const input = document([
      ["Cafe Maple", 0.1],
      ["Hotel ABC", 0.2],
    ]);
    input.observations[0].boundingBox.height = 0.045;
    const result = parseReceiptDateMerchantB3(parseReceiptDocumentB1(input));
    expect(result.merchantStatus).toBe("clear");
    expect(result.merchantCandidates[0]).toMatchObject({ name: "Cafe Maple" });
    expect(result.merchantCandidates[0].reasons).toContain("PROMINENT_HEADER");
  });

  it("keeps both same-line OCR fragments and repeated-name evidence", () => {
    const split = parse([
      ["STAR", 0.1, 0.05, 0.08],
      ["BUCKS", 0.1, 0.131, 0.1],
    ]);
    expect(
      split.merchantCandidates[0].evidence.map((item) => item.observationId),
    ).toEqual(["o0", "o1"]);
    const repeated = parse([["Cafe Maple"], ["Cafe Maple", 0.2]]);
    expect(repeated.merchantCandidates).toHaveLength(1);
    expect(repeated.merchantCandidates[0].reasons).toContain("REPEATED_NAME");
  });

  it("reports exclusion reasons by evidence ID without retaining excluded text", () => {
    const result = parse([
      ["TAX INVOICE"],
      ["12 Queen Street", 0.2],
      ["GST 123456789", 0.3],
      ["Cafe Maple", 0.4],
    ]);
    expect(result.merchantExclusions.map((item) => item.reasons)).toEqual([
      ["GENERIC_RECEIPT_HEADER_PENALTY"],
      ["ADDRESS_PENALTY"],
      ["TAX_ID_PENALTY"],
    ]);
    expect(result.merchantExclusions[0].evidence[0].observationId).toBe("o0");
    expect(JSON.stringify(result.merchantExclusions)).not.toContain("Queen Street");
  });

  it("reports separate test-only synthetic evaluation counts", () => {
    const evaluate = <T extends DateFixture | MerchantFixture>(
      fixtures: T[],
      field: "date" | "merchant",
    ) => {
      const summary = {
        fixtureCount: fixtures.length,
        topCorrect: 0,
        presentNotTop: 0,
        correctAbstain: 0,
        incorrectConfidentSelection: 0,
      };
      for (const fixture of fixtures) {
        const result = parse(
          fixture.rows,
          "context" in fixture ? fixture.context : undefined,
        );
        const candidates =
          field === "date"
            ? result.dateCandidates.map((item) => item.date)
            : result.merchantCandidates.map((item) => item.name);
        const status = field === "date" ? result.dateStatus : result.merchantStatus;
        if (fixture.expected === null) {
          if (status !== "clear") summary.correctAbstain++;
          else summary.incorrectConfidentSelection++;
        } else if (status === "clear" && candidates[0] === fixture.expected)
          summary.topCorrect++;
        else if (candidates.includes(fixture.expected)) summary.presentNotTop++;
        else if (status === "clear") summary.incorrectConfidentSelection++;
      }
      return summary;
    };
    expect(evaluate(dateFixtures, "date")).toEqual({
      fixtureCount: 28,
      topCorrect: 21,
      presentNotTop: 0,
      correctAbstain: 7,
      incorrectConfidentSelection: 0,
    });
    expect(evaluate(merchantFixtures, "merchant")).toEqual({
      fixtureCount: 14,
      topCorrect: 10,
      presentNotTop: 0,
      correctAbstain: 4,
      incorrectConfidentSelection: 0,
    });
  });
});
