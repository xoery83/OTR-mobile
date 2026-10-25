import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import type {
  ManualPlanDraft,
  ManualPlanRepository,
} from "@/data/repositories/manualPlanRepository";
import { localP1Presentation } from "./localP1Presentation";
type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readTripDayFeed>>["trip"]>>;
export type P1DetailState = {
  generation: number;
  tripId: string;
  itemId: string;
  presentation: NonNullable<ReturnType<typeof localP1Presentation>>;
  editor: { repository: ManualPlanRepository; draft: ManualPlanDraft } | null;
};
export async function loadP1Detail(
  input: {
    tripId: string;
    itemId: string;
    generation: number;
    occurrence: "START" | "END";
  },
  ports: {
    read(id: string): Promise<Read>;
    repository(): Promise<ManualPlanRepository>;
    generation(): number;
  },
): Promise<P1DetailState | null> {
  const { tripId, itemId, generation, occurrence } = input;
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
  if (!item || item.tripId !== tripId) throw new Error("P1_UNAVAILABLE");
  const presentation = localP1Presentation(item, occurrence);
  if (!presentation) throw new Error("P1_UNAVAILABLE");
  if (accepted?.source.localTargetIds?.includes(itemId))
    presentation.facts = { ...presentation.facts, pending: true };
  let editor: P1DetailState["editor"] = null;
  try {
    const repository = await ports.repository();
    if (!current()) return null;
    const draft = await repository.read(tripId, itemId, item.itemRevision as number);
    if (draft.itemId === itemId) editor = { repository, draft };
  } catch {
    /* Read authority never grants edit authority. */
  }
  return current() ? { ...input, presentation, editor } : null;
}
