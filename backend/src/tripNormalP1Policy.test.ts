import { expect, it } from "vitest";
import { isNormalP1Gate, isReviewedP1Gate } from "./tripNormalP1Policy";
it("requires a separately matching single-family reviewed capability for P3", () => {
  const gate = {
    runtime_enabled: true,
    enabled_commands: ["CREATE_ITEM"],
    enabled_families: ["P1"],
    enabled_admission_modes: ["REVIEWED_SOURCE"],
  };
  expect(isReviewedP1Gate(gate)).toBe(true);
  expect(isReviewedP1Gate(gate, "P3")).toBe(false);
  const p3 = { ...gate, enabled_families: ["P3"] };
  expect(isReviewedP1Gate(p3)).toBe(false);
  expect(isReviewedP1Gate(p3, "P3")).toBe(true);
  expect(isNormalP1Gate(p3)).toBe(false);
  expect(isReviewedP1Gate({ ...p3, enabled_families: ["P1", "P3"] }, "P3")).toBe(false);
  expect(isReviewedP1Gate({ ...p3, runtime_enabled: false }, "P3")).toBe(false);
});
