import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import type {
  ManualStayDraft,
  ManualStayRepository,
} from "@/data/repositories/manualStayRepository";
import { localStayPresentation, localStayMapTargets } from "./localStayPresentation";
type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readTripDayFeed>>["trip"]>>;
export type P3DetailState = {
  generation: number;
  tripId: string;
  itemId: string;
  presentation: NonNullable<ReturnType<typeof localStayPresentation>>;
  mapTargets: ReturnType<typeof localStayMapTargets>;
  editor: { repository: ManualStayRepository; draft: ManualStayDraft } | null;
};
export async function loadP3Detail(
  input: {
    tripId: string;
    itemId: string;
    generation: number;
    occurrence: "CHECKIN" | "CHECKOUT" | "BASE";
  },
  ports: {
    read(id: string): Promise<Read>;
    repository(): Promise<ManualStayRepository>;
    generation(): number;
  },
): Promise<P3DetailState | null> {
  const { tripId, itemId, generation } = input;
  coreUuid.parse(tripId);
  coreUuid.parse(itemId);
  const current = () => generation === ports.generation();
  if (!current()) return null;
  const read = await ports.read(tripId);
  if (!current() || read.scope.generation !== generation) return null;
  const projection =
    read.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
    read.observed.projection.version === 2
      ? read.observed.projection
      : null;
  const local =
    read.localManual?.scope.accountId === read.scope.accountId &&
    read.localManual.scope.tripId === tripId &&
    read.localManual.scope.generation === generation
      ? read.localManual
      : null;
  const accepted =
    projection?.accountId === read.scope.accountId &&
    projection.tripId === tripId &&
    projection.generation === generation
      ? projection
      : null;
  const item =
    local?.items.find((item) => item.itemId === itemId) ??
    accepted?.items.find((item) => item.itemId === itemId);
  if (!item || item.tripId !== tripId) throw new Error("P3_UNAVAILABLE");
  const presentation = localStayPresentation(item);
  if (!presentation) throw new Error("P3_UNAVAILABLE");
  if (accepted?.source.localTargetIds?.includes(itemId)) presentation.pending = true;
  let editor: P3DetailState["editor"] = null;
  try {
    const repository = await ports.repository();
    if (!current()) return null;
    const draft = await repository.read(tripId, itemId, item.itemRevision as number);
    if (draft.itemId === itemId) editor = { repository, draft };
  } catch {
    /* Read authority never grants edit authority. */
  }
  return current()
    ? { ...input, presentation, mapTargets: localStayMapTargets(item), editor }
    : null;
}
