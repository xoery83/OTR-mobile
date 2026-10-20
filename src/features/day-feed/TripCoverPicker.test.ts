import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripCoverPicker } from "./TripCoverPicker";
const state = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  refs: [] as any[],
  refCursor: 0,
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
      },
    ];
  },
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
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
  state.values = [];
  state.refs = [];
  state.cursor = state.refCursor = 0;
});
function render(
  onSelect = vi.fn().mockResolvedValue(undefined),
  onChoosePhoto?: () => Promise<boolean>,
  selectedRaw: string | null | undefined = "city",
) {
  state.cursor = state.refCursor = 0;
  return nodes(
    TripCoverPicker({ trip: { id: "qa" }, selectedRaw, onSelect, onChoosePhoto }),
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
it("does not fabricate a manual image when AUTO is turned off without a selection", () => {
  const select = vi.fn();
  render(select, undefined, null)
    .find((n) => n.props.accessibilityLabel === "myTrips.chooseCover")!
    .props.onPress();
  let v = render(select, undefined, null);
  v.find((n) => n.type === "Switch")!.props.onValueChange(false);
  v = render(select, undefined, null);
  expect(select).not.toHaveBeenCalled();
  expect(v.find((n) => n.type === "Switch")!.props.value).toBe(true);
  expect(v.some((n) => n.props.children === "coverLibrary.chooseManual")).toBe(true);
});
