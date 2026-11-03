import { expect, it, vi } from "vitest";
import {
  applyStaySuggestions,
  type StaySuggestionBinding,
  type SyntheticStayResult,
} from "./p3FormSuggestions";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";
const binding: StaySuggestionBinding = {
  formId: "form",
  tripId: "trip",
  itemId: "item",
  generation: 1,
  revision: 0,
  mode: "CREATE",
};
const fields: ManualStayFields = {
  title: "Mine",
  startDate: "",
  endDate: "",
  startTime: null,
  endTime: null,
  location: null,
  description: "My note",
  participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  stayDetails: {
    propertyName: null,
    permittedCheckinFrom: null,
    permittedCheckinUntil: null,
    permittedCheckoutBy: null,
  },
};
const result = (): SyntheticStayResult => ({
  kind: "SYNTHETIC_STAY_SUGGESTIONS",
  binding: { ...binding },
  candidates: [
    {
      id: "one",
      fields: {
        title: "Synthetic hotel",
        location: "Synthetic street",
        startDate: "2026-11-03",
        endDate: "2026-11-05",
        startTime: "17:00",
        endTime: "10:00",
        description: "Synthetic note",
      },
    },
    { id: "two", fields: { title: "Other hotel", startTime: "18:00" } },
  ],
});
it("adopts only explicitly selected fields; preserves original draft/participants and maps property name", () => {
  const before = structuredClone(fields);
  const next = applyStaySuggestions(
    result(),
    binding,
    "one",
    ["title", "location", "startDate", "endDate", "startTime", "endTime"],
    fields,
  )!;
  expect(next).toMatchObject({
    title: "Synthetic hotel",
    description: "My note",
    stayDetails: { propertyName: "Synthetic hotel" },
  });
  expect(next.participation).toEqual(fields.participation);
  expect(fields).toEqual(before);
});
it("keeps each candidate's choices independent and does not merge candidates", () => {
  expect(applyStaySuggestions(result(), binding, "two", ["title"], fields)).toMatchObject(
    { title: "Other hotel", startTime: null },
  );
});
it.each(["formId", "tripId", "itemId", "generation", "revision", "mode"] as const)(
  "rejects changed %s, including edit-away-and-back revision",
  (key) => {
    const current = {
      ...binding,
      [key]: typeof binding[key] === "number" ? 2 : "changed",
    } as StaySuggestionBinding;
    expect(applyStaySuggestions(result(), current, "one", ["title"], fields)).toBeNull();
  },
);
it("requires exact explicit Edit target", () => {
  const current = { ...binding, mode: "EDIT" as const };
  const response = result();
  response.binding = current;
  expect(applyStaySuggestions(response, current, "one", ["title"], fields)).toBeNull();
  response.candidates[0].targetItemId = "item";
  expect(applyStaySuggestions(response, current, "one", ["title"], fields)?.title).toBe(
    "Synthetic hotel",
  );
});
it("rejects bad clocks, reversed dates and duplicate candidate identity", () => {
  const response = result();
  response.candidates[0].fields.startTime = "99:00";
  expect(
    applyStaySuggestions(response, binding, "one", ["startTime"], fields),
  ).toBeNull();
  response.candidates[0].fields.endDate = "2026-11-01";
  expect(
    applyStaySuggestions(response, binding, "one", ["startDate", "endDate"], fields),
  ).toBeNull();
  response.candidates[1].id = "one";
  expect(applyStaySuggestions(response, binding, "one", ["title"], fields)).toBeNull();
});

vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
