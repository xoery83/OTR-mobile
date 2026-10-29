import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import type {
  ManualActivityDraft,
  ManualActivityRepository,
} from "@/data/repositories/manualActivityRepository";
import { activityFactsFromItem } from "./activityReadPresentation";
type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readTripDayFeed>>["trip"]>>;
export type P6DetailState = {
  generation: number;
  tripId: string;
  itemId: string;
  presentation: {
    title: string;
    pending: boolean;
    note?: string;
    facts: NonNullable<ReturnType<typeof activityFactsFromItem>>;
  };
  editor: { repository: ManualActivityRepository; draft: ManualActivityDraft } | null;
};
export async function loadP6Detail(
  input: {
    tripId: string;
    itemId: string;
    generation: number;
  },
  ports: {
    read(id: string): Promise<Read>;
    repository(): Promise<ManualActivityRepository>;
    generation(): number;
    onReadable?(state: P6DetailState): void;
  },
): Promise<P6DetailState | null> {
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
  if (
    !item ||
    item.tripId !== tripId ||
    !Number.isSafeInteger(item.itemRevision) ||
    Number(item.itemRevision) < 1
  )
    throw new Error("P6_UNAVAILABLE");
  const facts = activityFactsFromItem(item);
  if (!facts || ["cancelled", "skipped"].includes(String(item.status)))
    throw new Error("P6_UNAVAILABLE");
  const presentation = {
    title: String(item.title),
    facts,
    pending: item.localState === "PENDING",
    ...(typeof item.description === "string" ? { note: item.description } : {}),
  };
  if (accepted?.source.localTargetIds?.includes(itemId)) presentation.pending = true;
  if (current()) ports.onReadable?.({ ...input, presentation, editor: null });
  let editor: P6DetailState["editor"] = null;
  try {
    const repository = await ports.repository();
    if (!current()) return null;
    const draft = await repository.read(tripId, itemId, Number(item.itemRevision));
    if (draft.itemId === itemId) editor = { repository, draft };
  } catch {
    /* Read authority never grants edit authority. */
  }
  return current() ? { ...input, presentation, editor } : null;
}
