import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { MyTripsList } from "./MyTripsList";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({ buttons: [] as { label: string; onPress(): void }[] }));
vi.mock("react-native", () => ({
  Pressable: (p: {
    accessibilityLabel: string;
    onPress(): void;
    children: ReactNode;
  }) => {
    state.buttons.push({ label: p.accessibilityLabel, onPress: p.onPress });
    return createElement("div", null, p.children);
  },
  Text: (p: { children: ReactNode }) => createElement("span", null, p.children),
  View: (p: { children: ReactNode }) => createElement("div", null, p.children),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/ui/controls", () => ({
  UiSection: (p: { title: string; children: ReactNode }) =>
    createElement("section", null, p.title, p.children),
  UiButton: () => null,
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string, params?: { name?: string }) =>
    params?.name ? `${key}: ${params.name}` : key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/visual", () => ({ visual: { space: {}, radius: {}, type: {} } }));
vi.mock("./tripCovers", () => ({
  tripCoverId: () => "city",
  tripCoverSource: () => 1,
  builtInTripCoverSource: () => 1,
}));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: () => null }));

it("keeps a cached-only Trip visible and routes its card body to the matching summary workspace", () => {
  state.buttons = [];
  const onOpen = vi.fn();
  const html = renderToStaticMarkup(
    createElement(MyTripsList, {
      trips: [],
      remoteTrips: [
        {
          id: "remote-trip",
          name: "Shared cached Trip",
          destination: null,
          startDate: "invalid-date",
          endDate: null,
          createdAt: null,
          localStatus: null,
          selectedCoverAssetId: null,
          remoteListed: true,
        },
      ],
      today: "2026-10-14",
      eligibleToday: {},
      onOpen,
      onOpenToday: vi.fn(),
      onCreate: vi.fn(),
    }),
  );
  expect(html).toContain("myTrips.cachedTrips");
  expect(html).toContain("Shared cached Trip");
  expect(html).toContain("myTrips.datesToBeDecided");
  expect(html).not.toContain("myTrips.emptyTitle");
  expect(html).not.toContain("myTrips.openToday");
  state.buttons.find((button) => button.label.includes("Shared cached Trip"))!.onPress();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("remote-trip");
});
