import { describe, expect, it } from "vitest";
import {
  photoImportDecisionSchema,
  resolvePhotoImportDecision,
  screenPhotoImportRelevance,
  type PhotoImportDecision,
} from "./photoImportRelevance";

const pin = {
  accountId: "account-a",
  batchId: "11111111-1111-4111-8111-111111111111",
  inputId: "22222222-2222-4222-8222-222222222222",
  ordinal: 2,
  captureId: "capture-a",
  captureRevision: 1,
  payloadId: "payload-a",
  sha256: "a".repeat(64),
  byteCount: 123,
  mediaType: "image/jpeg" as const,
};
const observation = (text: string, confidence = 0.95) => ({ text, confidence });
const decision = (): PhotoImportDecision => ({
  version: 1,
  pin,
  relevance: { status: "UNCERTAIN", reason: "NO_CLEAR_RELEVANCE" },
  choice: "UNDECIDED",
});

describe("Photo OCR relevance is a hint, not a parser", () => {
  it.each([
    "Hotel booking confirmation",
    "NZ501 AKL → CHC",
    "入住 2026-11-02",
    "搭乗のご案内",
    "Airport map",
  ])("retains a readable travel clue: %s", (text) => {
    expect(screenPhotoImportRelevance([observation(text)])).toEqual({
      status: "RELEVANT",
      reason: "TRAVEL_TEXT_CLUE",
    });
  });
  it.each(
    [
      [],
      [observation("Hotel booking", 0.2)],
      [observation("?")],
      [observation("Everyday photo")],
      [observation("of 2026")],
      [observation("unknown language text", 0.3)],
      [{ text: "Flight", confidence: NaN }],
    ].map((raw) => ({ raw })),
  )("keeps empty, sparse or unreliable OCR uncertain: $raw", ({ raw }) => {
    expect(screenPhotoImportRelevance(raw).status).toBe("UNCERTAIN");
  });
  it("does not mistake high-confidence recipe text for proof that visual travel information is absent", () => {
    expect(
      screenPhotoImportRelevance([
        observation("Recipe for a cooking class: Ingredients"),
        observation("Flour, water and salt. Instructions for the full recipe follow."),
        observation(
          "Directions: knead and bake until ready. Repeat for every participant.",
        ),
      ]),
    ).toEqual({ status: "UNCERTAIN", reason: "NO_CLEAR_RELEVANCE" });
  });
  it("bounds oversized OCR and never emits candidate fields or OCR text", () => {
    expect(screenPhotoImportRelevance([observation("hotel".repeat(60000))]).status).toBe(
      "UNCERTAIN",
    );
    expect(
      Object.keys(screenPhotoImportRelevance([observation("Hotel check-in Nov 2")])),
    ).toEqual(["status", "reason"]);
  });
});

describe("explicit Photo decisions remain bound to the exact original", () => {
  it("requires an explicit choice for uncertain content, and Continue is only image qualification", () => {
    expect(resolvePhotoImportDecision(decision(), pin)).toBe("WAIT_FOR_USER");
    expect(
      resolvePhotoImportDecision({ ...decision(), choice: "CONTINUE_WITH_AI" }, pin),
    ).toBe("QUALIFY_ORIGINAL_IMAGE");
    expect(resolvePhotoImportDecision({ ...decision(), choice: "SKIP" }, pin)).toBe(
      "KEEP_ORIGINAL",
    );
  });
  it("Skip wins over a positive hint; explicit AI intent can override a separately confirmed negative hint", () => {
    const relevant = {
      ...decision(),
      relevance: { status: "RELEVANT", reason: "TRAVEL_TEXT_CLUE" },
    };
    expect(resolvePhotoImportDecision(relevant, pin)).toBe("QUALIFY_ORIGINAL_IMAGE");
    expect(resolvePhotoImportDecision({ ...relevant, choice: "SKIP" }, pin)).toBe(
      "KEEP_ORIGINAL",
    );
    const unrelated = {
      ...decision(),
      relevance: { status: "IRRELEVANT", reason: "CONFIRMED_UNRELATED_CONTENT" },
    };
    expect(resolvePhotoImportDecision(unrelated, pin)).toBe("KEEP_ORIGINAL");
    expect(
      resolvePhotoImportDecision({ ...unrelated, choice: "CONTINUE_WITH_AI" }, pin),
    ).toBe("QUALIFY_ORIGINAL_IMAGE");
  });
  it("roundtrips choice and original order without claiming a durable store or model receipt", () => {
    const chosen = { ...decision(), choice: "CONTINUE_WITH_AI" };
    const restored = photoImportDecisionSchema.parse(JSON.parse(JSON.stringify(chosen)));
    expect(restored).toEqual(chosen);
    expect(restored.pin.ordinal).toBe(2);
    expect(resolvePhotoImportDecision(restored, pin)).toBe("QUALIFY_ORIGINAL_IMAGE");
    expect(() =>
      photoImportDecisionSchema.parse({ ...chosen, modelCompleted: true }),
    ).toThrow();
  });
  it.each([
    "accountId",
    "batchId",
    "inputId",
    "ordinal",
    "captureId",
    "captureRevision",
    "payloadId",
    "sha256",
    "byteCount",
    "mediaType",
  ] as const)("rejects a recovered decision against changed %s", (key) => {
    const changed = {
      ...pin,
      [key]:
        key === "ordinal"
          ? 3
          : key === "captureRevision"
            ? 2
            : key === "byteCount"
              ? 124
              : key === "sha256"
                ? "b".repeat(64)
                : key === "mediaType"
                  ? "image/png"
                  : key === "batchId" || key === "inputId"
                    ? "33333333-3333-4333-8333-333333333333"
                    : "other",
    };
    expect(() => resolvePhotoImportDecision(decision(), changed)).toThrow(
      "PHOTO_IMPORT_ORIGINAL_CHANGED",
    );
  });
  it("rejects forged relevance/reason combinations and unknown choices", () => {
    expect(() =>
      resolvePhotoImportDecision({ ...decision(), choice: "AUTO_SAVE" }, pin),
    ).toThrow();
    expect(() =>
      resolvePhotoImportDecision(
        {
          ...decision(),
          relevance: { status: "IRRELEVANT", reason: "OCR_INSUFFICIENT" },
        },
        pin,
      ),
    ).toThrow();
  });
});
