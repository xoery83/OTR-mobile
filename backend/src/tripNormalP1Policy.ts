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

// Explicit normal Manual profiles; recognizing a profile never enables its SQL policy.
export const normalP3Commands = [...normalP1Commands, "SET_STAY_DETAILS"] as const;
export const normalP4Commands = [...normalP3Commands, "SET_RENTAL_DETAILS"] as const;
export const normalP5Commands = [...normalP4Commands, "SET_TRANSPORT_DETAILS"] as const;
export const normalP6Commands = [...normalP4Commands, "SET_ACTIVITY_DETAILS"] as const;
export const normalP5P6Commands = [...normalP5Commands, "SET_ACTIVITY_DETAILS"] as const;
export const normalP2SparseCommands = [
  ...normalP5P6Commands,
  "CREATE_SPARSE_FLIGHT",
  "SET_AUTHORED_FLIGHT_DETAILS",
] as const;
export function normalManualCapabilities(gate: Record<string, unknown> | undefined) {
  if (isNormalP1Gate(gate)) return { commands: [...normalP1Commands], families: ["P1"] };
  const rental = JSON.stringify(gate?.enabled_families) === '["P1","P3","P4"]';
  const transport = JSON.stringify(gate?.enabled_families) === '["P1","P3","P4","P5"]';
  const activity = JSON.stringify(gate?.enabled_families) === '["P1","P3","P4","P6"]';
  const combined =
    JSON.stringify(gate?.enabled_families) === '["P1","P3","P4","P5","P6"]';
  const sparse =
    JSON.stringify(gate?.enabled_families) === '["P1","P2","P3","P4","P5","P6"]';
  const commands = sparse
    ? normalP2SparseCommands
    : combined
      ? normalP5P6Commands
      : activity
        ? normalP6Commands
        : transport
          ? normalP5Commands
          : rental
            ? normalP4Commands
            : normalP3Commands;
  const families = sparse
    ? ["P1", "P2", "P3", "P4", "P5", "P6"]
    : combined
      ? ["P1", "P3", "P4", "P5", "P6"]
      : activity
        ? ["P1", "P3", "P4", "P6"]
        : transport
          ? ["P1", "P3", "P4", "P5"]
          : rental
            ? ["P1", "P3", "P4"]
            : ["P1", "P3"];
  if (
    gate?.runtime_enabled !== true ||
    JSON.stringify(gate.enabled_families) !== JSON.stringify(families) ||
    JSON.stringify(gate.enabled_admission_modes) !== '["MANUAL"]' ||
    !Array.isArray(gate.enabled_commands) ||
    gate.enabled_commands.length !== commands.length ||
    !commands.every((name) => (gate.enabled_commands as unknown[]).includes(name))
  )
    return null;
  return { commands: [...commands], families };
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
