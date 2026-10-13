export type WorkspaceKind = "LOCAL" | "CACHED" | "NONE";

export type WorkspaceResolution = {
  tripId: string;
  generation: number;
  kind: WorkspaceKind;
};

export function resolvedWorkspaceKind(
  resolution: WorkspaceResolution | null,
  tripId: string,
  generation: number,
): WorkspaceKind | null {
  return resolution?.tripId === tripId && resolution.generation === generation
    ? resolution.kind
    : null;
}

export function showTripContextualActions(
  requestedTripId: string,
  kind: WorkspaceKind | null,
  acceptedTripVisible: boolean,
): boolean {
  if (!requestedTripId) return true;
  if (kind === "LOCAL") return true;
  if (kind === null || kind === "CACHED") return false;
  return acceptedTripVisible;
}
