// Existing manual Core mutations only; capability negotiation never creates authority.
export const normalP1Commands = [
  "CREATE_ITEM",
  "SET_ITEM_TEXT",
  "SET_ITEM_SCHEDULE",
  "SET_ITEM_PLACE",
  "SET_ITEM_PARTICIPATION",
] as const;
export function isNormalP1Gate(gate: Record<string, unknown> | undefined): boolean {
  if (
    !gate ||
    JSON.stringify(gate.enabled_families) !== '["P1"]' ||
    JSON.stringify(gate.enabled_admission_modes) !== '["MANUAL"]' ||
    !Array.isArray(gate.enabled_commands)
  )
    return false;
  const commands = gate.enabled_commands;
  return (
    commands.length === normalP1Commands.length &&
    normalP1Commands.every((name) => commands.includes(name))
  );
}

// Additive owning Import qualification; Manual permission never enables this mode.
export function isReviewedP1Gate(
  gate: Record<string, unknown> | undefined,
  family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" = "P1",
): boolean {
  return (
    gate?.runtime_enabled === true &&
    JSON.stringify(gate.enabled_commands) ===
      JSON.stringify([family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM"]) &&
    JSON.stringify(gate.enabled_families) === JSON.stringify([family]) &&
    JSON.stringify(gate.enabled_admission_modes) === '["REVIEWED_SOURCE"]'
  );
}
