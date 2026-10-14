import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { MyTripsList } from "./MyTripsList";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  fontScale: 1,
  buttons: [] as { label: string; onPress(): void }[],
  texts: [] as { children: ReactNode; numberOfLines?: number }[],
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: state.fontScale }),
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
  UiText: (p: {
    children: ReactNode;
    numberOfLines?: number;
    accessibilityRole?: string;
  }) => {
    state.texts.push(p);
    return createElement(
      "span",
      { role: p.accessibilityRole === "header" ? "heading" : undefined },
      p.children,
    );
  },
  UiButton: (p: { label: string; onPress(): void }) => {
    state.buttons.push(p);
    return createElement("button", null, p.label);
  },
}));
vi.mock("@/ui/locale", () => ({
  t: (
    key: string,
    params?: {
      name?: string;
      date?: string;
      destination?: string;
      start?: string;
      end?: string;
    },
  ) =>
    key === "myTrips.dateRange"
      ? `${params?.start} – ${params?.end}`
      : key === "myTrips.compactDetails"
        ? `${key}: ${params?.date} · ${params?.destination}`
        : params?.name
          ? `${key}: ${params.name}`
          : params?.date
            ? `${key}: ${params.date}`
            : key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/visual", () => ({ visual: { space: {}, radius: {}, type: {} } }));
vi.mock("./tripCovers", () => ({
  tripCoverId: () => "city",
  tripCoverSource: () => 1,
  builtInTripCoverSource: () => 1,
}));
vi.mock("./TripCoverVisual", () => ({
  TripCoverVisual: (p: { children?: ReactNode }) =>
    createElement("div", null, p.children),
}));

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
          destination: "Sydney",
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
  expect(html).toContain("myTrips.undated");
  expect(html).toContain("myTrips.cachedDateSummary");
  expect(html).toContain("Sydney");
  const summary = state.texts.find((p) =>
    String(p.children).includes("myTrips.compactDetails"),
  );
  expect(summary?.children).toContain("myTrips.cachedDateSummary");
  expect(summary?.children).toContain("Sydney");
  expect(summary?.numberOfLines).toBe(2);
  expect(html).toContain("Shared cached Trip");
  expect(html).toContain("myTrips.datesToBeDecided");
  expect(html).not.toContain("myTrips.emptyTitle");
  expect(html).not.toContain("myTrips.openToday");
  state.buttons.find((button) => button.label.includes("Shared cached Trip"))!.onPress();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("remote-trip");
});

it("groups known cached dates with local cards, preserves Past limit, and grants Today only to local qualified cards", () => {
  state.buttons = [];
  const summary = (id: string, startDate: string | null, endDate: string | null) => ({
    id,
    name: id,
    destination: null,
    startDate,
    endDate,
    createdAt: null,
    localStatus: null,
    selectedCoverAssetId: null,
    remoteListed: true,
  });
  const onOpen = vi.fn(),
    onOpenToday = vi.fn();
  const local = {
    ...summary("local-active", "2026-10-12", "2026-10-16"),
    createdAt: "2026-10-01",
    serverId: null,
    updatedAt: "2026-10-01",
    deletedAt: null,
    syncStatus: "PENDING_CREATE" as const,
    syncVersion: 0,
    baseCurrency: null,
    ownerPersonId: null,
  };
  const html = renderToStaticMarkup(
    createElement(MyTripsList, {
      trips: [local],
      remoteTrips: [
        summary("remote-active", "2026-10-12", "2026-10-16"),
        summary("remote-upcoming", "2026-11-01", "2026-11-02"),
        summary("remote-undated", null, null),
        ...[1, 2, 3, 4].map((day) =>
          summary(`past-${day}`, `2026-09-0${day}`, `2026-09-0${day}`),
        ),
      ],
      today: "2026-10-14",
      eligibleToday: {
        "local-active": { date: "2026-10-14", zone: "UTC" },
        "remote-active": { date: "2026-10-14", zone: "UTC" },
      },
      onOpen,
      onOpenToday,
      onCreate: vi.fn(),
    }),
  );
  const headings = [...html.matchAll(/<span role="heading">([^<]+)<\/span>/g)].map(
    (match) => match[1],
  );
  expect(headings).toEqual([
    "myTrips.active",
    "myTrips.upcoming",
    "myTrips.undated",
    "myTrips.past",
  ]);
  expect(html).toContain("remote-active");
  expect(html).toContain("past-4");
  expect(html).not.toContain("past-1");
  expect(html).toContain("myTrips.seeAllPast");
  const today = state.buttons.filter((button) => button.label === "myTrips.openToday");
  expect(today).toHaveLength(1);
  today[0].onPress();
  expect(onOpenToday).toHaveBeenCalledExactlyOnceWith("local-active");
  state.buttons.find((button) => button.label.includes("remote-active"))!.onPress();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("remote-active");
});

it("lets scaled compact metadata grow intrinsically while preserving both known dates and destination", () => {
  try {
    for (const fontScale of [1, 1.118, 2.143]) {
      state.fontScale = fontScale;
      state.texts = [];
      const html = renderToStaticMarkup(
        createElement(MyTripsList, {
          trips: [],
          remoteTrips: [
            {
              id: "known-upcoming",
              name: "Known upcoming",
              destination: "Sydney Harbour and Northern Beaches",
              startDate: "2026-11-20",
              endDate: "2026-11-22",
              createdAt: null,
              localStatus: null,
              selectedCoverAssetId: null,
              remoteListed: true,
            },
          ],
          today: "2026-10-14",
          eligibleToday: {},
          onOpen: vi.fn(),
          onOpenToday: vi.fn(),
          onCreate: vi.fn(),
        }),
      );
      const metadata = state.texts.find((p) =>
        String(p.children).includes("myTrips.compactDetails"),
      );
      expect(metadata?.children).toContain("2026-11-20");
      expect(metadata?.children).toContain("2026-11-22");
      expect(metadata?.children).toContain("Sydney Harbour and Northern Beaches");
      expect(metadata?.numberOfLines).toBe(fontScale > 1 ? undefined : 2);
      expect(html).not.toContain("myTrips.openToday");
    }
  } finally {
    state.fontScale = 1;
  }
});
