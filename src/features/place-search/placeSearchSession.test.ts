import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApplePlaceCandidate } from "@/data/places/applePlaceProvider";
import { PlaceSearchSession, relaxedPlaceQuery } from "./placeSearchSession";
const candidate = (
  kind: "completion" | "mapItem" = "completion",
  generation = 1,
): ApplePlaceCandidate => ({
  provider: "apple",
  handle: "00000000-0000-4000-8000-000000000001",
  title: "Sky Tower",
  secondary: "Auckland",
  kind,
  sessionId: "00000000-0000-4000-8000-000000000002",
  generation,
});
function provider() {
  let generation = 0;
  return {
    complete: vi.fn(async () => [candidate("completion", ++generation)]),
    search: vi.fn(async () => [candidate("mapItem", ++generation)]),
    resolve: vi.fn(async (selected: ApplePlaceCandidate) => {
      if (selected.generation !== generation) throw new Error("STALE_HANDLE");
      return {
        ...selected,
        kind: "mapItem" as const,
        address: "Victoria Street West, Auckland",
      };
    }),
    cancel: vi.fn(() => {
      generation++;
    }),
    close: vi.fn(),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("debounces 450ms, suppresses short text, and clears/cancels both provider sessions", async () => {
  const quick = provider(),
    more = provider(),
    changed = vi.fn(),
    session = new PlaceSearchSession(quick, more, changed);
  session.update({ text: "S" });
  await vi.advanceTimersByTimeAsync(500);
  expect(quick.complete).not.toHaveBeenCalled();
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(449);
  expect(quick.complete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(quick.complete).toHaveBeenCalledOnce();
  expect(session.state.rows).toHaveLength(1);
  session.update({ text: "" });
  expect(session.state.rows).toEqual([]);
  expect(more.cancel).toHaveBeenCalled();
  session.close();
  expect(quick.close).toHaveBeenCalledOnce();
  expect(more.close).toHaveBeenCalledOnce();
});
it("More uses its own session; Back preserves actual quick completion handle and cached More", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  const row = session.state.rows[0],
    cancelled = quick.cancel.mock.calls.length;
  await session.searchMore();
  expect(more.search).toHaveBeenCalledOnce();
  expect(quick.cancel.mock.calls.length).toBe(cancelled);
  session.backToQuick();
  expect(session.state.rows[0]).toBe(row);
  expect(quick.complete).toHaveBeenCalledOnce();
  expect(await session.resolve(row)).toMatchObject({
    address: "Victoria Street West, Auckland",
  });
  await session.searchMore();
  expect(more.search).toHaveBeenCalledOnce();
});
it("does not resolve a stale row after query change or publish a late callback after clear", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  const row = session.state.rows[0];
  session.update({ text: "Other query" });
  expect(await session.resolve(row)).toBeNull();
  let finish!: (rows: ApplePlaceCandidate[]) => void;
  quick.complete.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(450);
  session.update({ text: "" });
  finish([candidate()]);
  await Promise.resolve();
  expect(session.state.rows).toEqual([]);
});
it("caps Quick at five and explicit More at twenty without pagination", async () => {
  const quick = provider(),
    more = provider();
  quick.complete.mockResolvedValue(Array.from({ length: 9 }, () => candidate()));
  more.search.mockResolvedValue(Array.from({ length: 30 }, () => candidate("mapItem")));
  const session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Auckland" });
  await vi.advanceTimersByTimeAsync(450);
  expect(session.state.rows).toHaveLength(5);
  await session.searchMore();
  expect(session.state.rows).toHaveLength(20);
  expect(more.search).toHaveBeenCalledOnce();
});
it("uses at most one conservative automatic trailing-intent relaxation", async () => {
  const quick = provider(),
    more = provider();
  quick.complete.mockResolvedValue([]);
  const session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "SkyCity location" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(2);
  expect(session.state.status).toBe("EMPTY");
  expect(relaxedPlaceQuery({ text: "Dinner with Friends" })).toBeNull();
  expect(relaxedPlaceQuery({ text: "Sky Tower tour" })).toBeNull();
});

it("does not overlap explicit More with a pending quick request", async () => {
  const quick = provider(),
    more = provider();
  let finish!: (rows: ApplePlaceCandidate[]) => void;
  quick.complete.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  await session.searchMore();
  expect(more.search).not.toHaveBeenCalled();
  finish([candidate()]);
  await Promise.resolve();
  await session.searchMore();
  expect(more.search).toHaveBeenCalledOnce();
});

it("reuses the same normalized query/context instead of refetching on an unchanged Worldwide choice", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  session.update({ text: " sky  tower " });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledOnce();
  session.update({ text: "Sky Tower", region: { latitude: -36.8, longitude: 174.7 } });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(2);
});

it("drops a late selection resolution after clear and leaves the new draft query empty", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  const row = session.state.rows[0];
  let finish!: (value: Awaited<ReturnType<typeof quick.resolve>>) => void;
  quick.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = session.resolve(row);
  session.update({ text: "" });
  finish({ ...row, kind: "mapItem", address: "Old address" });
  expect(await pending).toBeNull();
  expect(session.state.rows).toEqual([]);
});

it("known offline state does not dispatch either provider and still permits later online recovery", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Sky Tower" }, 450, false);
  await vi.advanceTimersByTimeAsync(450);
  await session.searchMore();
  expect(quick.complete).not.toHaveBeenCalled();
  expect(more.search).not.toHaveBeenCalled();
  expect(session.state.error).toBe("OFFLINE");
  session.update({ text: "Sky Tower" }, 450, true);
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledOnce();
});

it("does not reuse a general POI cache after switching to destination-area intent", async () => {
  const quick = provider(),
    more = provider(),
    session = new PlaceSearchSession(quick, more, vi.fn());
  session.update({ text: "Nelson" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(1);
  session.update({ text: "Nelson", intent: "destinationArea" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(2);
  expect(quick.complete).toHaveBeenLastCalledWith(
    { text: "Nelson", intent: "destinationArea" },
    expect.any(AbortSignal),
  );
  session.update({ text: "Nelson", intent: "destinationArea" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(2);
  session.update({ text: "Nelson" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).toHaveBeenCalledTimes(3);
});
