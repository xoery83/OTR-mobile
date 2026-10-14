import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripCoverVisual } from "./TripCoverVisual";

const state = vi.hoisted(() => ({ failed: null as number | null }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    state.failed,
    (source: number) => {
      state.failed = source;
    },
  ],
}));
vi.mock("react-native", () => ({
  Image: "Image",
  View: "View",
  StyleSheet: {
    absoluteFill: {},
    create: (styles: unknown) => styles,
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (create: (colors: typeof lightPalette) => unknown) =>
    create(lightPalette),
}));
type Node = ReactElement<{ children?: ReactNode; onError?(): void }>;
function descendants(node: ReactNode): Node[] {
  if (!isValidElement(node)) return [];
  const element = node as Node;
  return [element, ...Children.toArray(element.props.children).flatMap(descendants)];
}
beforeEach(() => {
  state.failed = null;
});
it("retains overlay content after image failure and allows another selected cover to render", () => {
  const props = { source: 1, style: {}, children: "trip-title" };
  const image = descendants(TripCoverVisual(props)).find(
    (node) => node.type === "Image",
  )!;
  image.props.onError!();
  const fallback = descendants(TripCoverVisual(props));
  expect(fallback.some((node) => node.type === "Image")).toBe(false);
  expect(fallback.some((node) => node.type === "AppIcon")).toBe(true);
  expect(fallback.some((node) => node.props.children === "trip-title")).toBe(true);
  expect(
    descendants(TripCoverVisual({ ...props, source: 2 })).some(
      (node) => node.type === "Image",
    ),
  ).toBe(true);
});
