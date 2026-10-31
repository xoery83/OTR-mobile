import { expect, it } from "vitest";
import { privateAccountProfileFieldsSchema, privateProfileChanges, privateProfileDraft } from "./privateAccountProfile";

it.each([{}, { displayName: "" }, { displayName: null, travelDocumentName: null }])(
  "allows an incomplete profile without creating a registration requirement",
  (value) => expect(privateAccountProfileFieldsSchema.parse(value)).toEqual(value),
);

it("keeps private display and travel-document names independent and preserves original Unicode", () => {
  const value = {
    displayName: "  小林 e\u0301  ",
    travelDocumentName: {
      mode: "SPLIT" as const,
      familyName: "林",
      givenNames: "علي ᐃᓄᒃ",
    },
  };
  expect(privateAccountProfileFieldsSchema.parse(value)).toEqual(value);
  expect(
    privateAccountProfileFieldsSchema.parse({ displayName: value.displayName }),
  ).not.toHaveProperty("travelDocumentName");
});

it("supports an unsplit name and does not require both family and given names", () => {
  expect(
    privateAccountProfileFieldsSchema.parse({
      travelDocumentName: { mode: "UNSPLIT", fullName: "Björk Guðmundsdóttir" },
    }).travelDocumentName,
  ).toEqual({ mode: "UNSPLIT", fullName: "Björk Guðmundsdóttir" });
  expect(
    privateAccountProfileFieldsSchema.parse({
      travelDocumentName: { mode: "SPLIT", familyName: null, givenNames: "Sukarno" },
    }).travelDocumentName,
  ).toMatchObject({ familyName: null, givenNames: "Sukarno" });
});

it("rejects ambiguous split/unsplit fields instead of silently discarding a name", () => {
  expect(
    privateAccountProfileFieldsSchema.safeParse({
      travelDocumentName: { mode: "UNSPLIT", fullName: "林", familyName: "林" },
    }).success,
  ).toBe(false);
});

it.each(["accountId", "personId", "role", "connectedAccountId", "accessToken"])(
  "does not accept identity or credential authority in profile values: %s",
  (key) =>
    expect(
      privateAccountProfileFieldsSchema.safeParse({ [key]: "untrusted" }).success,
    ).toBe(false),
);

it("rejects a value that cannot be stored without changing its characters", () => {
  expect(
    privateAccountProfileFieldsSchema.safeParse({ displayName: "林\0" }).success,
  ).toBe(false);
});

it.each([{}, { displayName: null, travelDocumentName: null }])(
  "keeps an untouched optional profile empty without an artificial document name",
  (fields) => expect(privateProfileChanges(fields, privateProfileDraft(fields))).toEqual({}),
);

it("edits or clears display name without touching the independent document name", () => {
  const fields = { displayName: "林", travelDocumentName: { mode: "UNSPLIT" as const, fullName: "علي" } };
  expect(privateProfileChanges(fields, { ...privateProfileDraft(fields), displayName: "" }))
    .toEqual({ displayName: "" });
});

it("preserves exact original characters when switching name format", () => {
  const fields = { travelDocumentName: { mode: "SPLIT" as const, familyName: "林", givenNames: null } };
  expect(privateProfileChanges(fields, { ...privateProfileDraft(fields), mode: "UNSPLIT", fullName: "  e\u0301 林  " }))
    .toEqual({ travelDocumentName: { mode: "UNSPLIT", fullName: "  e\u0301 林  " } });
});

it("does not submit hidden format edits or rewrite untouched nullable split names", () => {
  const fields = { travelDocumentName: { mode: "SPLIT" as const, familyName: null, givenNames: "Sukarno" } };
  expect(privateProfileChanges(fields, { ...privateProfileDraft(fields), fullName: "retained local draft" }))
    .toEqual({});
  expect(privateProfileChanges(fields, { ...privateProfileDraft(fields), familyName: "林" }))
    .toEqual({ travelDocumentName: { mode: "SPLIT", familyName: "林", givenNames: "Sukarno" } });
  expect(privateProfileChanges(fields, { ...privateProfileDraft(fields), givenNames: "علي" }))
    .toEqual({ travelDocumentName: { mode: "SPLIT", familyName: null, givenNames: "علي" } });
});

it("rejects invalid stored or draft values before building a patch", () => {
  expect(() => privateProfileChanges({}, { ...privateProfileDraft(), displayName: "\0" })).toThrow();
  expect(() => privateProfileChanges({ displayName: "\0" }, privateProfileDraft())).toThrow();
});
