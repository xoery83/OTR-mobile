import type { OcrDocument } from "@/native/receiptOcr";
import { parseReceiptDocumentB1, type ReceiptDocumentB1 } from "./receiptParserB1";
import { rankReceiptAmountsB2 } from "./receiptParserB2";
import {
  parseReceiptDateMerchantB3,
  type ReceiptParseContextB3,
} from "./receiptParserB3";

export type ReceiptParseContext = ReceiptParseContextB3 & {
  journeyCurrency?: string;
};

export function parseReceipt(input: OcrDocument, context: ReceiptParseContext = {}) {
  const document: ReceiptDocumentB1 = parseReceiptDocumentB1(input, context);
  const amount = rankReceiptAmountsB2(document);
  const dateMerchant = parseReceiptDateMerchantB3(document, context);
  const receiptCodes = [
    ...new Set(
      document.currencyCandidates
        .filter((item) => item.source === "receipt" && item.code)
        .map((item) => item.code!),
    ),
  ];
  const currencyStatus =
    receiptCodes.length === 1
      ? "clear"
      : receiptCodes.length || document.currencyCandidates.length
        ? "ambiguous"
        : "none";
  return {
    parserVersion: "receipt-b4.2" as const,
    document,
    amountCandidates: amount.amountCandidates,
    currencyCandidates: document.currencyCandidates,
    dateCandidates: dateMerchant.dateCandidates,
    merchantCandidates: dateMerchant.merchantCandidates,
    merchantExclusions: dateMerchant.merchantExclusions,
    status: {
      amount: amount.status,
      currency: currencyStatus,
      date: dateMerchant.dateStatus,
      merchant: dateMerchant.merchantStatus,
    },
    warnings: [...document.warnings, ...amount.warnings, ...dateMerchant.warnings],
  };
}

export type ReceiptParseResult = ReturnType<typeof parseReceipt>;

export type ReceiptEvidenceSet = {
  documents: readonly { documentId: string; document: OcrDocument }[];
};

// Evidence IDs are transient and local to this parse. Draft IDs provide stable
// document identity when the same image is recovered and OCR runs again.
function scopeDocument(documentId: string, input: ReceiptDocumentB1): ReceiptDocumentB1 {
  const id = (localId: string) => `${documentId}:${localId}`;
  const evidence = (items: (typeof input.numericCandidates)[number]["evidence"]) =>
    items.map((item) => ({
      ...item,
      observationId: id(item.observationId),
      lineId: id(item.lineId),
    }));
  return {
    ...input,
    lines: input.lines.map((line) => ({
      ...line,
      id: id(line.id),
      documentId,
      fragments: line.fragments.map((fragment) => ({ ...fragment, id: id(fragment.id) })),
    })),
    numericCandidates: input.numericCandidates.map((candidate) => ({
      ...candidate,
      id: id(candidate.id),
      tokenId: id(candidate.tokenId),
      evidence: evidence(candidate.evidence),
      currencyCandidateIds: candidate.currencyCandidateIds.map(id),
    })),
    currencyCandidates: input.currencyCandidates.map((candidate) => ({
      ...candidate,
      id: id(candidate.id),
      evidence: evidence(candidate.evidence),
      numericCandidateIds: candidate.numericCandidateIds.map(id),
    })),
  };
}

export function parseReceiptEvidenceSet(
  input: ReceiptEvidenceSet,
  context: ReceiptParseContext = {},
) {
  if (!input.documents.length || input.documents.length > 3)
    throw new Error("A receipt evidence set requires one to three documents.");
  const ids = input.documents.map((item) => item.documentId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id)))
    throw new Error("Receipt document IDs must be unique and scope-safe.");
  const scoped = input.documents.map(({ documentId, document }) =>
    scopeDocument(documentId, parseReceiptDocumentB1(document, context)),
  );
  const combined: ReceiptDocumentB1 = {
    parserVersion: "receipt-b1",
    lines: scoped.flatMap((item) => item.lines),
    numericCandidates: scoped.flatMap((item) => item.numericCandidates),
    currencyCandidates: scoped
      .flatMap((item) => item.currencyCandidates)
      .filter(
        (item, index, all) =>
          item.source !== "context" ||
          all.findIndex((candidate) => candidate.source === "context") === index,
      ),
    warnings: [...new Set(scoped.flatMap((item) => item.warnings))],
  };
  const receiptCodes = [
    ...new Set(
      combined.currencyCandidates
        .filter((item) => item.source === "receipt" && item.code)
        .map((item) => item.code!),
    ),
  ];
  const explicitCodes = combined.currencyCandidates.filter(
    (item) => item.source === "receipt" && item.strength === "code" && item.code,
  );
  const crossLinkedIds = new Set<string>();
  if (receiptCodes.length === 1 && scoped.length > 1) {
    for (const numeric of combined.numericCandidates) {
      if (numeric.currencyCandidateIds.length) continue;
      const sourceId = numeric.evidence[0]?.lineId.split(":")[0];
      const otherDocumentCode = explicitCodes.find(
        (item) => item.evidence[0]?.lineId.split(":")[0] !== sourceId,
      );
      if (otherDocumentCode) {
        numeric.currencyCandidateIds.push(otherDocumentCode.id);
        crossLinkedIds.add(otherDocumentCode.id);
      }
    }
  }
  const amount = rankReceiptAmountsB2(combined);
  const dateMerchant = parseReceiptDateMerchantB3(combined, context);
  const conflictingStrongCandidates = <
    T extends { score: number; evidence: { lineId: string }[] },
  >(
    candidates: T[],
  ) =>
    candidates.some(
      (candidate, index) =>
        candidate.score >= 60 &&
        candidates
          .slice(index + 1)
          .some(
            (other) =>
              other.score >= 60 &&
              candidate.evidence[0]?.lineId.split(":")[0] !==
                other.evidence[0]?.lineId.split(":")[0],
          ),
    );
  const merchantConflict = conflictingStrongCandidates(dateMerchant.merchantCandidates);
  const dateConflict = conflictingStrongCandidates(dateMerchant.dateCandidates);
  for (const candidate of amount.amountCandidates) {
    for (const id of candidate.currencyCandidateIds) {
      if (!crossLinkedIds.has(id)) continue;
      const code = explicitCodes.find((item) => item.id === id);
      if (
        code &&
        !candidate.evidence.some(
          (entry) => entry.observationId === code.evidence[0]?.observationId,
        )
      )
        candidate.evidence.push(...code.evidence);
    }
  }
  const currencyStatus =
    receiptCodes.length === 1
      ? "clear"
      : receiptCodes.length || combined.currencyCandidates.length
        ? "ambiguous"
        : "none";
  return {
    parserVersion: "receipt-c1" as const,
    document: combined,
    amountCandidates: amount.amountCandidates,
    currencyCandidates: combined.currencyCandidates,
    dateCandidates: dateMerchant.dateCandidates,
    merchantCandidates: dateMerchant.merchantCandidates,
    merchantExclusions: dateMerchant.merchantExclusions,
    status: {
      amount: amount.status,
      currency: currencyStatus,
      date: dateConflict ? ("ambiguous" as const) : dateMerchant.dateStatus,
      merchant: merchantConflict ? ("ambiguous" as const) : dateMerchant.merchantStatus,
    },
    warnings: [...combined.warnings, ...amount.warnings, ...dateMerchant.warnings],
  };
}

export type ReceiptEvidenceSetResult = ReturnType<typeof parseReceiptEvidenceSet>;
