import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripCoverPicker } from "./TripCoverPicker";
const state = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  refs: [] as any[],
  refCursor: 0,
  cleanup: null as null | (() => void),
  frames: [] as (() => void)[],
  writes: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (v: any) => {
        state.values[i] = v;
        state.writes++;
      },
    ];
  },
  useEffect: (effect: () => () => void) => {
    state.cleanup ??= effect();
  },
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Modal: "Modal",
  Switch: "Switch",
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/ui/controls", () => ({ UiButton: "UiButton", UiText: "UiText" }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (create: any) => create(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, p: any = {}) =>
    key + (p.number ?? "") + (p.description ? ":" + p.description : ""),
}));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: "TripCoverVisual" }));
vi.mock("./tripCovers", () => ({
  tripCoverId: (t: any) => t.selectedCoverAssetIdRaw ?? "city",
  tripCoverSource: () => 1,
  builtInTripCoverSource: (id: string) => id,
}));
vi.mock("@/features/trip-cover/coverDecision", () => ({
  coverCatalog: [],
  rankedTripCovers: () =>
    [
      "city",
      "coast",
      "mountain",
      "cultural-oldtown",
      "wc-142191115",
      "wc-142949336",
      "wc-124361528",
    ].map((id) => ({ asset: { id } })),
}));
type Node = ReactElement<any>;
const nodes = (n: ReactNode): Node[] =>
  isValidElement(n)
    ? [n as Node, ...Children.toArray((n as Node).props.children).flatMap(nodes)]
    : [];
beforeEach(() => {
  state.cleanup?.();
  state.cleanup = null;
  state.frames = [];
  state.writes = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    state.frames.push(callback);
    return state.frames.length;
  });
  state.values = [];
  state.refs = [];
  state.cursor = state.refCursor = 0;
});
function render(
  onSelect = vi.fn().mockResolvedValue(undefined),
  onChoosePhoto?: Parameters<typeof TripCoverPicker>[0]["onChoosePhoto"],
  selectedRaw: string | null | undefined = "city",
  extra: Pick<Parameters<typeof TripCoverPicker>[0], "presentation" | "onClose"> = {},
) {
  state.cursor = state.refCursor = 0;
  return nodes(
    TripCoverPicker({
      trip: { id: "qa" },
      selectedRaw,
      onSelect,
      onChoosePhoto,
      ...extra,
    }),
  );
}
it("opens from a cover edit glyph and shows current plus exactly six other ranked images", () => {
  let v = render();
  v.find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!.props.onPress();
  v = render();
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  expect(
    v.filter((n) => n.props.accessibilityLabel?.startsWith("coverLibrary.option")),
  ).toHaveLength(6);
  expect(v.some((n) => n.props.accessibilityLabel?.includes("myTrips.cover.coast"))).toBe(
    true,
  );
  expect(
    v.some((n) => n.props.accessibilityLabel?.includes("myTrips.cover.mountain")),
  ).toBe(true);
  const choices = v
    .filter((n) => n.type === "TripCoverVisual")
    .map((n) => n.props.assetId);
  expect(choices).toEqual([
    "city",
    "city",
    "coast",
    "mountain",
    "cultural-oldtown",
    "wc-142191115",
    "wc-142949336",
    "wc-124361528",
  ]);
  expect(v.some((n) => n.props.children === "coverLibrary.preview")).toBe(false);
  expect(v.some((n) => n.props.children === "coverLibrary.ownerScope")).toBe(false);
});
it("does not stage a selection for a canceled photo choice or accept duplicate in-flight picks", async () => {
  let finish!: (chosen: boolean) => void;
  const choose = vi.fn(
    () =>
      new Promise<boolean>((r) => {
        finish = r;
      }),
  );
  const save = vi.fn().mockResolvedValue(undefined);
  render(save, choose)
    .find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!
    .props.onPress();
  let v = render(save, choose);
  const photo = v.find((n) => n.props.accessibilityLabel === "coverLibrary.choosePhoto")!;
  photo.props.onPress();
  photo.props.onPress();
  expect(choose).toHaveBeenCalledOnce();
  finish(false);
  await Promise.resolve();
  await Promise.resolve();
  v = render(save, choose);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it("uses the entire image as one edit button with the Home edit glyph and hides credits", () => {
  const v = render();
  const button = v.find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!;
  expect(button.type).toBe("Pressable");
  expect(nodes(button).filter((n) => n.type === "Pressable")).toHaveLength(1);
  expect(nodes(button).some((n) => n.type === "TripCoverVisual")).toBe(true);
  expect(nodes(button).find((n) => n.type === "AppIcon")!.props).toMatchObject({
    name: "square.and.pencil",
    color: lightPalette.mediaText,
  });
  expect(
    v.some(
      (n) =>
        n.props.label === "coverLibrary.credits" ||
        n.props.children === "coverLibrary.credits",
    ),
  ).toBe(false);
});
it("stages AUTO through the native Switch without dismissing Gallery or saving metadata", async () => {
  const select = vi.fn().mockResolvedValue(undefined);
  render(select)
    .find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!
    .props.onPress();
  let v = render(select);
  expect(v.find((n) => n.type === "Switch")!.props.value).toBe(false);
  v.find((n) => n.type === "Switch")!.props.onValueChange(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(select).toHaveBeenCalledExactlyOnceWith(null);
  v = render(select, undefined, null);
  expect(v.find((n) => n.type === "Switch")!.props.value).toBe(true);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
});
it("turning AUTO off locks the currently displayed registered image, and on clears the draft", async () => {
  const select = vi.fn().mockResolvedValue(undefined);
  render(select, undefined, null)
    .find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!
    .props.onPress();
  render(select, undefined, null)
    .find((n) => n.type === "Switch")!
    .props.onValueChange(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(select).toHaveBeenCalledExactlyOnceWith("city");
  let v = render(select, undefined, "city");
  expect(v.find((n) => n.type === "Switch")!.props.value).toBe(false);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  v.find((n) => n.type === "Switch")!.props.onValueChange(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(select).toHaveBeenLastCalledWith(null);
  v = render(select, undefined, null);
  expect(v.find((n) => n.type === "Switch")!.props.value).toBe(true);
});

it("opens the existing Gallery directly in standalone mode and closes without a write", () => {
  const save = vi.fn(),
    onClose = vi.fn();
  const v = render(save, undefined, "city", { presentation: "standalone", onClose });
  expect(v.filter((n) => n.type === "Modal")).toHaveLength(1);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  expect(v.some((n) => n.props.accessibilityLabel === "myTrips.chooseCover")).toBe(false);
  v.find((n) => n.type === "SheetHeader")!.props.onLeft();
  expect(onClose).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});
it("standalone selection closes only after its owning save succeeds, and keeps failures visible", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("owning rejection"))
    .mockResolvedValue(undefined);
  const onClose = vi.fn();
  const extra = { presentation: "standalone" as const, onClose };
  let v = render(save, undefined, "city", extra);
  v.find((n) =>
    n.props.accessibilityLabel?.startsWith("coverLibrary.option"),
  )!.props.onPress();
  await Promise.resolve();
  await Promise.resolve();
  v = render(save, undefined, "city", extra);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  expect(v.some((n) => n.props.children === "myTrips.coverFailed")).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  v.find((n) =>
    n.props.accessibilityLabel?.startsWith("coverLibrary.option"),
  )!.props.onPress();
  await Promise.resolve();
  await Promise.resolve();
  expect(save).toHaveBeenCalledTimes(2);
  expect(onClose).toHaveBeenCalledOnce();
});
it("standalone AUTO stages through the injected save and stays open for the refreshed revision", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    onClose = vi.fn();
  const extra = { presentation: "standalone" as const, onClose };
  render(save, undefined, "city", extra)
    .find((n) => n.type === "Switch")!
    .props.onValueChange(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(save).toHaveBeenCalledExactlyOnceWith(null);
  expect(onClose).not.toHaveBeenCalled();
  expect(
    render(save, undefined, null, extra).find((n) => n.type === "Switch")!.props.value,
  ).toBe(true);
});

async function paintFeedback() {
  state.frames.shift()!();
  state.frames.shift()!();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
it("shows local processing before work, blocks close/duplicates, and keeps committed Current visible", async () => {
  let finish!: (chosen: boolean) => void;
  const work = vi.fn();
  const choose = vi.fn(async (processing: () => Promise<void>) => {
    await processing();
    work();
    return new Promise<boolean>((resolve) => {
      finish = resolve;
    });
  });
  const onClose = vi.fn();
  const extra = { presentation: "standalone" as const, onClose };
  let v = render(undefined, choose, "city", extra);
  const button = v.find(
    (n) => n.props.accessibilityLabel === "coverLibrary.choosePhoto",
  )!;
  button.props.onPress();
  button.props.onPress();
  v = render(undefined, choose, "city", extra);
  expect(choose).toHaveBeenCalledOnce();
  expect(work).not.toHaveBeenCalled();
  expect(v.some((n) => n.type === "ActivityIndicator")).toBe(true);
  expect(v.some((n) => n.props.children === "coverLibrary.processingPhoto")).toBe(true);
  expect(v.find((n) => n.type === "Modal")!.props.allowSwipeDismissal).toBe(false);
  expect(v.find((n) => n.type === "SheetHeader")!.props.leftDisabled).toBe(true);
  v.find((n) => n.type === "SheetHeader")!.props.onLeft();
  expect(onClose).not.toHaveBeenCalled();
  expect(v.find((n) => n.props.tripId === "qa")!.props.rawSelection).toBe("city");
  await paintFeedback();
  expect(work).toHaveBeenCalledOnce();
  finish(true);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const committedRaw = "photo-00000000-0000-4000-8000-000000000001";
  v = render(undefined, choose, committedRaw, extra);
  expect(v.find((n) => n.props.tripId === "qa")!.props.rawSelection).toBe(committedRaw);
  expect(v.find((n) => n.type === "Modal")!.props.visible).toBe(true);
  expect(v.some((n) => n.props.children === "coverLibrary.photoSaved")).toBe(true);
  expect(v.some((n) => n.type === "ActivityIndicator")).toBe(false);
  expect(v.find((n) => n.type === "SheetHeader")!.props.leftDisabled).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});
it("keeps the old Current with the safe failure message when local photo processing fails", async () => {
  const choose = vi.fn(async (processing: () => Promise<void>) => {
    await processing();
    throw new Error("private detail");
  });
  const onClose = vi.fn(),
    extra = { presentation: "standalone" as const, onClose };
  render(undefined, choose, "city", extra)
    .find((n) => n.props.accessibilityLabel === "coverLibrary.choosePhoto")!
    .props.onPress();
  await paintFeedback();
  const v = render(undefined, choose, "city", extra);
  expect(v.find((n) => n.props.tripId === "qa")!.props.rawSelection).toBe("city");
  expect(v.some((n) => n.props.children === "myTrips.coverFailed")).toBe(true);
  expect(v.some((n) => n.props.children === "coverLibrary.photoSaved")).toBe(false);
  expect(v.find((n) => n.type === "Modal")!.props.allowSwipeDismissal).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});
it("does not close or publish photo status after the Gallery unmounts", async () => {
  const choose = vi.fn(async (processing: () => Promise<void>) => {
    await processing();
    return true;
  });
  const onClose = vi.fn();
  render(undefined, choose, "city", { presentation: "standalone", onClose })
    .find((n) => n.props.accessibilityLabel === "coverLibrary.choosePhoto")!
    .props.onPress();
  state.cleanup?.();
  const writes = state.writes;
  await paintFeedback();
  expect(state.writes).toBe(writes);
  expect(onClose).not.toHaveBeenCalled();
});
