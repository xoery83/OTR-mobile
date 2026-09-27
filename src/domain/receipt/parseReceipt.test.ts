import { expect, it } from "vitest";
import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceipt } from "./parseReceipt";

it("composes the accepted B1, B2, and B3 results without changing their evidence", () => {
  const document: OcrDocument = {
    engine: "apple-vision",
    engineRevision: 3,
    imageWidth: 1200,
    imageHeight: 1800,
    durationMs: 8,
    supportedLanguages: ["en-US"],
    observations: [
      {
        text: "Cafe Maple",
        confidence: 0.9,
        boundingBox: { x: 0.05, y: 0.05, width: 0.4, height: 0.04 },
      },
      {
        text: "PURCHASE DATE 27/09/2026",
        confidence: 0.9,
        boundingBox: { x: 0.05, y: 0.15, width: 0.6, height: 0.025 },
      },
      {
        text: "TOTAL NZ$86.40",
        confidence: 0.9,
        boundingBox: { x: 0.05, y: 0.3, width: 0.6, height: 0.025 },
      },
    ],
  };
  const result = parseReceipt(document);
  expect(result.parserVersion).toBe("receipt-b4.2");
  expect(result.document.numericCandidates[0].decimal).toBe("86.40");
  expect(result.amountCandidates[0]).toMatchObject({
    decimal: "86.40",
    currency: "NZD",
    minorUnits: 8640,
  });
  expect(result.currencyCandidates[0].code).toBe("NZD");
  expect(result.dateCandidates[0].date).toBe("2026-09-27");
  expect(result.merchantCandidates[0].name).toBe("Cafe Maple");
  expect(result.status).toEqual({
    amount: "clear",
    currency: "clear",
    date: "clear",
    merchant: "clear",
  });
  expect(result.amountCandidates[0].evidence[0].observationId).toBe("o2");
});
