import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  createDefaultManualPlanRepository,
  type ManualPlanFields,
  readTripDayFeed,
} from "@/data/auth/localTripAccess";
import { createDefaultManualStayRepository } from "@/data/repositories/manualStayRepository";
import { localStayMoveItem } from "./localStayPresentation";
import { stayMoveProposal } from "./bookingReadPresentation";
import type { DayListHandle } from "./WindowedDayList";
import { useP1Move } from "./useP1Move";
import { p1CivilMoveItem, p1CivilDuration, p1CivilProposal } from "./p1CivilMove";
import type { PlacementRow } from "./p1MoveCursor";
type Read = Awaited<ReturnType<Awaited<ReturnType<typeof readTripDayFeed>>["trip"]>>;
export function useP1CivilMove(
  list: RefObject<DayListHandle | null>,
  read: Read | null,
  tripId: string,
  generation: number,
  dates: readonly string[],
  top: number,
  bottom: number,
  onSaved: () => void,
  onFinish: () => void,
) {
  const projection =
    read?.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
    read.observed.projection.version === 2
      ? read.observed.projection
      : null;
  const items = (
    read?.scope.generation === generation &&
    read.localManual?.scope.tripId === tripId &&
    read.localManual.scope.accountId === read.scope.accountId &&
    read.localManual.scope.generation === generation
      ? read.localManual.items
      : []
  ).filter((item) => item.family === "P1" || item.family === "P3");
  const key = JSON.stringify([
    tripId,
    generation,
    read?.scope.accountId,
    read?.localManual?.source.fingerprint,
    projection?.source,
  ]);
  const liveKey = useRef(key);
  useLayoutEffect(() => {
    liveKey.current = key;
  }, [key]);
  const [preparationRevision, setPreparationRevision] = useState(0);
  const [prepared, setPrepared] = useState<{
    key: string;
    drafts: Map<
      string,
      {
        save(
          changes: Partial<
            Pick<ManualPlanFields, "startDate" | "startTime" | "endDate" | "endTime">
          >,
        ): Promise<unknown>;
      }
    >;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const repository = await createDefaultManualPlanRepository();
      const entries = await Promise.all(
        items
          .filter((item) =>
            item.family === "P3"
              ? !!localStayMoveItem(item, "CHECKIN") ||
                !!localStayMoveItem(item, "CHECKOUT")
              : !!p1CivilMoveItem(item),
          )
          .map(async (item) => {
            try {
              if (item.family === "P3") {
                const repository = await createDefaultManualStayRepository();
                const draft = await repository.read(
                  tripId,
                  item.itemId,
                  item.itemRevision as number,
                );
                return [
                  item.itemId,
                  {
                    save: (
                      changes: Partial<
                        Pick<
                          ManualPlanFields,
                          "startDate" | "startTime" | "endDate" | "endTime"
                        >
                      >,
                    ) =>
                      repository.save(draft, {
                        ...draft.fields,
                        ...changes,
                        startDate: draft.fields.startDate,
                        endDate: draft.fields.endDate,
                      }),
                  },
                ] as const;
              }
              const draft = await repository.read(
                tripId,
                item.itemId,
                item.itemRevision as number,
              );
              return [
                item.itemId,
                {
                  save: (
                    changes: Partial<
                      Pick<
                        ManualPlanFields,
                        "startDate" | "startTime" | "endDate" | "endTime"
                      >
                    >,
                  ) => repository.save(draft, { ...draft.fields, ...changes }),
                },
              ] as const;
            } catch (error) {
              if (typeof __DEV__ !== "undefined" && __DEV__)
                console.info(
                  JSON.stringify({
                    event: "p1_move_edit_unavailable",
                    code: error instanceof Error ? error.message : "UNKNOWN",
                  }),
                );
              return null;
            }
          }),
      );
      if (active && liveKey.current === key && generation === getAccountGeneration()) {
        if (typeof __DEV__ !== "undefined" && __DEV__)
          console.info(
            JSON.stringify({
              event: "p1_move_prepared",
              items: items.length,
              editable: entries.filter(Boolean).length,
            }),
          );
        setPrepared({
          key,
          drafts: new Map(
            entries.filter((entry): entry is NonNullable<typeof entry> => !!entry),
          ),
        });
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
    // The owning read fingerprint/revision pins this complete item snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preparationRevision]);
  const current = () =>
    liveKey.current === key &&
    generation === getAccountGeneration() &&
    prepared?.key === key;
  const rows: PlacementRow[] = dates.flatMap((date) => [
    { key: `day:${date}`, date, itemId: "", minute: null },
    ...(read?.localManual?.rows(date) ?? []).map((row) => ({
      key: `local:${JSON.stringify(row.rowKey)}`,
      date,
      itemId:
        row.family === "P3" ? `${row.itemRef}:${row.rowKey.projectionRole}` : row.itemRef,
      minute: null,
    })),
  ]);
  const sourceFor = (id: string) =>
    items.find((item) =>
      item.family === "P1"
        ? item.itemId === id
        : `${item.itemId}:CHECKIN` === id || `${item.itemId}:CHECKOUT` === id,
    );
  const candidateFor = (id: string) => {
    const item = sourceFor(id);
    if (!item || !current() || !prepared?.drafts.has(item.itemId)) return undefined;
    if (item.family === "P1") return p1CivilMoveItem(item);
    return localStayMoveItem(
      item,
      id === `${item.itemId}:CHECKOUT` ? "CHECKOUT" : "CHECKIN",
    );
  };
  const move = useP1Move(
    list,
    key,
    top,
    bottom,
    {
      item: candidateFor,
      rows: () => rows,
      duration: (item) => (item.dateScope === "SAME_DAY" ? null : p1CivilDuration(item)),
      propose: (item, date, minute) =>
        item.dateScope === "SAME_DAY"
          ? stayMoveProposal(item, date, minute)
          : p1CivilProposal(item, date, minute),
      same: (item, p) =>
        p.status === "READY" && item.date === p.date && item.time === p.time,
      onDismiss: () => {
        // A failed attempt freezes its draft. A new target must read a new revision/draft.
        setPrepared(null);
        setPreparationRevision((value) => value + 1);
        onSaved();
      },
      commit: async (item, proposal) => {
        const source = sourceFor(item.id);
        const opened = source && prepared?.drafts.get(source.itemId);
        if (
          !current() ||
          !opened ||
          proposal.status !== "READY" ||
          !proposal.date ||
          !proposal.time
        )
          throw new Error("P1_MOVE_SCOPE_CHANGED");
        if (item.dateScope === "SAME_DAY") {
          if (proposal.date !== item.date || proposal.endDate)
            throw new Error("P3_MOVE_DATE_CHANGED");
          await opened.save(
            item.id === `${source!.itemId}:CHECKOUT`
              ? { endTime: proposal.time }
              : { startTime: proposal.time },
          );
        } else
          await opened.save({
            startDate: proposal.date,
            startTime: proposal.time,
            endDate: proposal.endDate ?? null,
            endTime: proposal.endTime ?? null,
          });
        if (current()) onSaved();
      },
    },
    onFinish,
  );
  return {
    ...move,
    canMove: (id: string) => !!candidateFor(id),
  };
}
