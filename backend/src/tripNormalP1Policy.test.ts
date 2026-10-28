import { expect, it } from "vitest";
import {
  isNormalP1Gate,
  isReviewedP1Gate,
  normalManualCapabilities,
  normalP3Commands,
} from "./tripNormalP1Policy";
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

it("requires the separately bounded Sparse P2 reviewed capability", () => {
  const p2 = {
    runtime_enabled: true,
    enabled_commands: ["CREATE_SPARSE_FLIGHT"],
    enabled_families: ["P2"],
    enabled_admission_modes: ["REVIEWED_SOURCE"],
  };
  expect(isReviewedP1Gate(p2, "P2")).toBe(true);
  expect(isReviewedP1Gate(p2)).toBe(false);
  expect(isNormalP1Gate(p2)).toBe(false);
  for (const changed of [
    { ...p2, enabled_commands: ["CREATE_ITEM"] },
    { ...p2, enabled_commands: ["CREATE_SPARSE_FLIGHT", "QUALIFY_FLIGHT"] },
    { ...p2, enabled_admission_modes: ["MANUAL"] },
    { ...p2, runtime_enabled: false },
  ])
    expect(isReviewedP1Gate(changed, "P2")).toBe(false);
});

it("keeps reviewed P4 separate from Manual, P1, P3 and multi-family gates", () => {
  const p4 = {
    runtime_enabled: true,
    enabled_commands: ["CREATE_ITEM"],
    enabled_families: ["P4"],
    enabled_admission_modes: ["REVIEWED_SOURCE"],
  };
  expect(isReviewedP1Gate(p4, "P4")).toBe(true);
  expect(isNormalP1Gate(p4)).toBe(false);
  expect(isReviewedP1Gate(p4, "P1")).toBe(false);
  expect(isReviewedP1Gate(p4, "P3")).toBe(false);
  for (const changed of [
    { ...p4, enabled_families: ["P1"] },
    { ...p4, enabled_families: ["P3"] },
    { ...p4, enabled_families: ["P4", "P1"] },
    { ...p4, enabled_admission_modes: ["MANUAL"] },
    { ...p4, runtime_enabled: false },
  ])
    expect(isReviewedP1Gate(changed, "P4")).toBe(false);
});

it("recognizes only exact Manual P1/P3 capabilities without borrowing reviewed or Flight authority", () => {
  const gate = {
    runtime_enabled: true,
    enabled_commands: [...normalP3Commands],
    enabled_families: ["P1", "P3"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(normalManualCapabilities(gate)).toEqual({
    commands: [...normalP3Commands],
    families: ["P1", "P3"],
  });
  for (const altered of [
    { ...gate, runtime_enabled: false },
    { ...gate, enabled_families: ["P3"] },
    { ...gate, enabled_families: ["P1", "P3", "P4"] },
    { ...gate, enabled_commands: [...normalP3Commands, "QUALIFY_FLIGHT"] },
    { ...gate, enabled_commands: [...normalP3Commands, "CREATE_DOCUMENT"] },
    { ...gate, enabled_admission_modes: ["MANUAL", "REVIEWED_SOURCE"] },
  ])
    expect(normalManualCapabilities(altered)).toBeNull();
});
