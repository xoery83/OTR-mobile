import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import type {
  ManualRentalDraft,
  ManualRentalRepository,
} from "@/data/repositories/manualRentalRepository";
import { rentalFactsFromItem } from "./rentalReadPresentation";
type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readTripDayFeed>>["trip"]>>;
export type P4DetailState = {
  generation: number;
  tripId: string;
  itemId: string;
  presentation: {
    title: string;
    pending: boolean;
    note?: string;
    facts: NonNullable<ReturnType<typeof rentalFactsFromItem>>;
  };
  editor: { repository: ManualRentalRepository; draft: ManualRentalDraft } | null;
};
export async function loadP4Detail(
  input: {
    tripId: string;
    itemId: string;
    generation: number;
    occurrence: "PICKUP" | "RETURN";
  },
  ports: {
    read(id: string): Promise<Read>;
    repository(): Promise<ManualRentalRepository>;
    generation(): number;
    onReadable?(state: P4DetailState): void;
  },
): Promise<P4DetailState | null> {
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
    throw new Error("P4_UNAVAILABLE");
  const facts = rentalFactsFromItem(item);
  if (!facts || (input.occurrence === "RETURN" && !facts.return))
    throw new Error("P4_UNAVAILABLE");
  const presentation = {
    title: String(item.title),
    facts,
    pending: item.localState === "PENDING",
    ...(typeof item.description === "string" ? { note: item.description } : {}),
  };
  if (accepted?.source.localTargetIds?.includes(itemId)) presentation.pending = true;
  if (current()) ports.onReadable?.({ ...input, presentation, editor: null });
  let editor: P4DetailState["editor"] = null;
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
