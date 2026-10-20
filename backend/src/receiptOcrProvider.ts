import {
  receiptSuggestionSchema,
  type ReceiptSuggestion,
} from "../../src/data/api/ledgerReceiptContracts";

export type ReceiptOcrProvider = {
  extract(input: { bytes: Uint8Array; mimeType: string }): Promise<ReceiptSuggestion>;
};

export async function extractReceiptSuggestion(
  provider: ReceiptOcrProvider,
  input: { bytes: Uint8Array; mimeType: string },
) {
  if (
    !input.bytes.length ||
    !["image/jpeg", "image/png", "application/pdf"].includes(input.mimeType)
  )
    throw new Error("Receipt OCR input is invalid.");
  return receiptSuggestionSchema.parse(await provider.extract(input));
}

export function createReceiptOcrProvider(acceptanceFixture = false): ReceiptOcrProvider {
  return {
    async extract() {
      return acceptanceFixture
        ? {
            title: "Stage 5.2 OCR cafe",
            amountMinor: 8640,
            currency: "EUR",
            occurredAt: null,
            category: "food",
          }
        : {
            title: null,
            amountMinor: null,
            currency: null,
            occurredAt: null,
            category: null,
          };
    },
  };
}
