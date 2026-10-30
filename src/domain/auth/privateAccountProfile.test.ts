import { expect, it } from "vitest";
import { privateAccountProfileFieldsSchema } from "./privateAccountProfile";

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
