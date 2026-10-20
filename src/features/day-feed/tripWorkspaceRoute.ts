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

// Presentation-only context, never an admission or capability grant.
export function isSelectedTripHome(params: unknown): boolean {
  if (!params || typeof params !== "object") return false;
  const { tripId, view } = params as { tripId?: unknown; view?: unknown };
  return (
    typeof tripId === "string" &&
    Boolean(tripId.trim()) &&
    view !== "trips" &&
    view !== "create" &&
    view !== "day"
  );
}
