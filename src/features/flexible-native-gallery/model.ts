export type Coordinate = Readonly<{ latitude: number; longitude: number }>;
export type Resource = Readonly<{
  id: string;
  name: string;
  category?: string;
  location?: string;
  coordinates?: Coordinate;
  image?: "garden" | "cafe";
  relevant: boolean;
}>;
export function resourceSnapshot(resource: Resource): Resource {
  return Object.freeze({
    ...resource,
    coordinates: resource.coordinates
      ? Object.freeze({ ...resource.coordinates })
      : undefined,
  });
}
export type Block = {
  id: string;
  title: string;
  start: number;
  end: number;
  area?: string;
};
export type Basket = {
  id: string;
  name: string;
  resources: string[];
  published: boolean;
};
export type GalleryState = {
  resources: Resource[];
  my: string[];
  saved: string[];
  block: Block | null;
  serial: number;
  promotion: "idle" | "pending" | "failed" | "accepted";
  promoted: string | null;
  undo: Partial<
    Pick<GalleryState, "my" | "saved" | "block" | "promoted" | "promotion">
  > | null;
};
export type Action =
  | { type: "add" | "remove" | "heart"; id: string }
  | { type: "custom"; name: string }
  | { type: "create" }
  | { type: "resize"; edge: "start" | "end"; minute: number }
  | { type: "title"; value: string }
  | { type: "delete" }
  | { type: "promotion"; outcome: GalleryState["promotion"]; id: string }
  | { type: "undo" };
export const validCoordinates = (p?: Coordinate): p is Coordinate =>
  !!p &&
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.latitude) <= 90 &&
  Math.abs(p.longitude) <= 180;
export function straightLine(origin?: Coordinate, target?: Coordinate): number | null {
  if (!validCoordinates(origin) || !validCoordinates(target)) return null;
  const rad = Math.PI / 180;
  const dLat = (target.latitude - origin.latitude) * rad;
  const dLon = (target.longitude - origin.longitude) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(origin.latitude * rad) *
      Math.cos(target.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))));
}
export function resizePreview(
  block: Block,
  edge: "start" | "end",
  dy: number,
  x: number,
) {
  if (x > 44 || x < 0 || !Number.isFinite(dy) || !Number.isFinite(x)) return null;
  // shortcut: fixture ruler uses 8pt per 15 minutes, calibrate on hardware before production.
  const minute = Math.round((block[edge] + (dy / 8) * 15) / 15) * 15;
  return minute >= 0 &&
    minute <= 1440 &&
    (edge === "start" ? minute <= block.end - 15 : minute >= block.start + 15)
    ? minute
    : null;
}
export function reduceGallery(state: GalleryState, action: Action): GalleryState {
  const exists = "id" in action && state.resources.some((r) => r.id === action.id);
  switch (action.type) {
    case "add":
      if (!exists || state.my.includes(action.id)) return state;
      return {
        ...state,
        my: [...state.my, action.id],
        saved: state.saved.includes(action.id)
          ? state.saved
          : [...state.saved, action.id],
        undo: { my: state.my, saved: state.saved },
      };
    case "remove":
      if (!state.my.includes(action.id)) return state;
      return {
        ...state,
        my: state.my.filter((id) => id !== action.id),
        undo: { my: state.my },
      };
    case "heart":
      if (!exists) return state;
      return {
        ...state,
        saved: state.saved.includes(action.id)
          ? state.saved.filter((id) => id !== action.id)
          : [...state.saved, action.id],
        undo: { saved: state.saved },
      };
    case "custom": {
      const name = action.name.trim();
      if (!name || name.length > 200) return state;
      const existing = state.resources.find((r) => r.name === name);
      if (existing)
        return state.saved.includes(existing.id)
          ? state
          : {
              ...state,
              saved: [...state.saved, existing.id],
              undo: { saved: state.saved },
            };
      const id = `custom-${state.serial}`;
      return {
        ...state,
        serial: state.serial + 1,
        resources: [...state.resources, { id, name, relevant: false }],
        saved: [...state.saved, id],
        undo: { saved: state.saved },
      };
    }
    case "create":
      if (state.block) return state;
      return {
        ...state,
        block: {
          id: `block-${state.serial}`,
          title: "",
          start: 780,
          end: 1080,
          area: "Saint-Germain",
        },
        serial: state.serial + 1,
        undo: { block: null },
      };
    case "resize":
      if (
        !state.block ||
        !Number.isInteger(action.minute) ||
        action.minute % 15 ||
        action.minute < 0 ||
        action.minute > 1440 ||
        (action.edge === "start"
          ? action.minute > state.block.end - 15
          : action.minute < state.block.start + 15)
      )
        return state;
      return {
        ...state,
        block: { ...state.block, [action.edge]: action.minute },
        undo: { block: state.block },
      };
    case "title":
      if (!state.block || !action.value.trim()) return state;
      return {
        ...state,
        block: { ...state.block, title: action.value.trim().slice(0, 200) },
        undo: { block: state.block },
      };
    case "delete":
      return { ...state, block: null, undo: { block: state.block } };
    case "promotion":
      if (!state.my.includes(action.id) || state.promoted || action.outcome === "idle")
        return state;
      return {
        ...state,
        promotion: action.outcome,
        ...(action.outcome === "accepted"
          ? {
              promoted: action.id,
              my: state.my.filter((id) => id !== action.id),
              undo: {
                my: state.my,
                promoted: state.promoted,
                promotion: state.promotion,
              },
            }
          : {}),
      };
    case "undo":
      return state.undo ? { ...state, ...state.undo, undo: null } : state;
  }
}
export function poolResources(
  state: GalleryState,
  mode: "recommended" | "saved" | "search",
  query: string,
  batch = 0,
) {
  const resources = state.resources.filter((r) =>
    mode === "saved"
      ? state.saved.includes(r.id)
      : mode === "search"
        ? !!query.trim() &&
          r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        : !r.id.startsWith("custom-"),
  );
  return mode === "saved"
    ? [...resources.filter((r) => r.relevant), ...resources.filter((r) => !r.relevant)]
    : mode === "recommended"
      ? [
          ...resources.slice(batch % Math.max(1, resources.length)),
          ...resources.slice(0, batch % Math.max(1, resources.length)),
        ].slice(0, 10)
      : resources;
}

export const choiceFocusKey = (blockId: string, source: string, resourceId: string) =>
  JSON.stringify(["FLEXIBLE_CHOICE", blockId, source, resourceId]);
