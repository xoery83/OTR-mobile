import { expect, it } from "vitest";
import {
  isNormalP1Gate,
  isReviewedP1Gate,
  normalManualCapabilities,
  normalP3Commands,
  normalP4Commands,
  normalP5P6Commands,
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

it("recognizes exact P4 Manual profile only with Rental command and no Flight or Source extension", () => {
  const gate = {
    runtime_enabled: true,
    enabled_commands: [...normalP4Commands],
    enabled_families: ["P1", "P3", "P4"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(normalManualCapabilities(gate)).toEqual({
    commands: [...normalP4Commands],
    families: ["P1", "P3", "P4"],
  });
  for (const altered of [
    { ...gate, runtime_enabled: false },
    { ...gate, enabled_commands: [...normalP3Commands] },
    { ...gate, enabled_commands: [...normalP4Commands, "QUALIFY_FLIGHT"] },
    { ...gate, enabled_families: ["P1", "P3", "P4", "P5"] },
    { ...gate, enabled_admission_modes: ["REVIEWED_SOURCE"] },
  ])
    expect(normalManualCapabilities(altered)).toBeNull();
});

it("recognizes only the exact normal P5 profile, retaining separate Flight and Source authority", () => {
  const commands = [...normalP4Commands, "SET_TRANSPORT_DETAILS"];
  const gate = {
    runtime_enabled: true,
    enabled_commands: commands,
    enabled_families: ["P1", "P3", "P4", "P5"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(normalManualCapabilities(gate)).toEqual({
    commands,
    families: gate.enabled_families,
  });
  for (const changed of [
    { ...gate, runtime_enabled: false },
    { ...gate, enabled_commands: [...normalP4Commands] },
    { ...gate, enabled_commands: [...commands, "CREATE_SPARSE_FLIGHT"] },
    { ...gate, enabled_families: ["P5"] },
    { ...gate, enabled_families: [...gate.enabled_families, "P2"] },
    { ...gate, enabled_admission_modes: ["MANUAL", "REVIEWED_SOURCE"] },
  ])
    expect(normalManualCapabilities(changed)).toBeNull();
});

it("recognizes an independent P6 Manual profile without opening blocked P5", () => {
  const commands = [...normalP4Commands, "SET_ACTIVITY_DETAILS"];
  const gate = {
    runtime_enabled: true,
    enabled_commands: commands,
    enabled_families: ["P1", "P3", "P4", "P6"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(normalManualCapabilities(gate)).toEqual({
    commands,
    families: gate.enabled_families,
  });
  for (const changed of [
    { ...gate, runtime_enabled: false },
    { ...gate, enabled_commands: [...normalP4Commands] },
    { ...gate, enabled_commands: [...commands, "SET_TRANSPORT_DETAILS"] },
    { ...gate, enabled_families: ["P1", "P3", "P4", "P5", "P6"] },
    { ...gate, enabled_families: ["P6"] },
    { ...gate, enabled_families: [...gate.enabled_families, "P2"] },
    { ...gate, enabled_admission_modes: ["MANUAL", "REVIEWED_SOURCE"] },
  ])
    expect(normalManualCapabilities(changed)).toBeNull();
});

it("recognizes exact additive P5/P6 Manual union without widening Source or Flight", () => {
  const gate = {
    runtime_enabled: true,
    enabled_commands: [...normalP5P6Commands],
    enabled_families: ["P1", "P3", "P4", "P5", "P6"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(normalManualCapabilities(gate)).toEqual({
    commands: [...normalP5P6Commands],
    families: gate.enabled_families,
  });
  for (const change of [
    { ...gate, runtime_enabled: false },
    {
      ...gate,
      enabled_commands: gate.enabled_commands.filter(
        (c) => c !== "SET_TRANSPORT_DETAILS",
      ),
    },
    {
      ...gate,
      enabled_commands: gate.enabled_commands.filter((c) => c !== "SET_ACTIVITY_DETAILS"),
    },
    { ...gate, enabled_commands: [...gate.enabled_commands, "QUALIFY_FLIGHT"] },
    { ...gate, enabled_commands: [...gate.enabled_commands, "CREATE_SPARSE_FLIGHT"] },
    {
      ...gate,
      enabled_commands: gate.enabled_commands.map((c) =>
        c === "SET_ACTIVITY_DETAILS" ? "CREATE_ITEM" : c,
      ),
    },
    { ...gate, enabled_families: ["P1", "P2", "P3", "P4", "P5", "P6"] },
    { ...gate, enabled_admission_modes: ["MANUAL", "REVIEWED_SOURCE"] },
    { ...gate, enabled_admission_modes: ["REVIEWED_SOURCE"] },
  ])
    expect(normalManualCapabilities(change)).toBeNull();
  for (const family of ["P1", "P2", "P3", "P4", "P5", "P6"] as const)
    expect(isReviewedP1Gate(gate, family)).toBe(false);
});
