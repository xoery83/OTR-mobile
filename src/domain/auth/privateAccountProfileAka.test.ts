import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  privateAccountProfileFieldsSchema,
  privateProfileChanges,
  privateProfileDraft,
} from "./privateAccountProfile";
import {
  privateAccountProfileMutationSchema,
  privateAccountProfileSnapshotSchema,
} from "../../data/api/privateAccountProfileContracts";
const operationId = "11111111-1111-4111-8111-111111111111";
it("old requests remain byte-identical and do not default an AKA array", () => {
  const old = { operationId, expectedRevision: 0, changes: { displayName: "" } };
  const parsed = privateAccountProfileMutationSchema.parse(old);
  expect(JSON.stringify(parsed)).toBe(JSON.stringify(old));
  expect(createHash("sha256").update(JSON.stringify(parsed)).digest("hex")).toBe(
    createHash("sha256").update(JSON.stringify(old)).digest("hex"),
  );
  expect(parsed.changes).not.toHaveProperty("globalAka");
  expect(privateAccountProfileFieldsSchema.parse({})).toEqual({});
});
it("preserves private AKA Unicode, duplicates, order and explicit clear without touching names", () => {
  const globalAka = ["  林 e\u0301  ", "علي", "林", "林", ""];
  expect(privateAccountProfileFieldsSchema.parse({ globalAka })).toEqual({ globalAka });
  expect(privateAccountProfileFieldsSchema.parse({ globalAka: [] })).toEqual({
    globalAka: [],
  });
  const snapshot = {
    schemaId: "otr.auth.private-profile/1",
    accountId: operationId,
    revision: 1,
    fields: {
      displayName: null,
      travelDocumentName: { mode: "UNSPLIT", fullName: "原文" },
      globalAka,
    },
  };
  expect(privateAccountProfileSnapshotSchema.parse(snapshot)).toEqual(snapshot);
});
it.each([null, "alias", [null], [1], ["bad\0"], [{ accountId: operationId }]])(
  "rejects malformed private AKA without interpreting identity: %j",
  (globalAka) => {
    expect(privateAccountProfileFieldsSchema.safeParse({ globalAka }).success).toBe(
      false,
    );
  },
);
it("does not silently publish the existing local AKA draft", () => {
  const fields = { displayName: "Name", globalAka: ["server value"] };
  expect(
    privateProfileChanges(fields, {
      ...privateProfileDraft(fields),
      globalAkaDraft: ["local edit"],
    }),
  ).toEqual({});
  expect(
    privateAccountProfileFieldsSchema.safeParse({ globalAkaDraft: ["local edit"] })
      .success,
  ).toBe(false);
});
