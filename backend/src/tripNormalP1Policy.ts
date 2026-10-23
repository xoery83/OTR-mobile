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
