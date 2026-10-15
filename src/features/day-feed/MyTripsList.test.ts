import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { MyTripsList } from "./MyTripsList";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  fontScale: 1,
  push: vi.fn(),
  buttons: [] as { label: string; onPress(): void }[],
  texts: [] as { children: ReactNode; numberOfLines?: number }[],
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: state.fontScale }),
  FlatList: (p: {
    data: unknown[];
    renderItem(p: { item: unknown }): ReactNode;
    ListEmptyComponent: ReactNode;
  }) =>
    createElement(
      "main",
      null,
      p.data.length
        ? p.data.map((item, i) =>
            createElement("div", { key: i }, p.renderItem({ item })),
          )
        : p.ListEmptyComponent,
    ),
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
      count?: number;
    },
  ) =>
    key === "myTrips.seeAllPastCount"
      ? `${key}: ${params?.count}`
      : key === "myTrips.dateRange"
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
    String(p.children).includes("myTrips.cachedDateSummary"),
  );
  expect(summary?.numberOfLines).toBe(1);
  expect(state.texts.find((p) => p.children === "Sydney")?.numberOfLines).toBe(1);
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
  expect(html).toContain("myTrips.seeAllPastCount: 4");
  const today = state.buttons.filter((button) => button.label === "myTrips.openToday");
  expect(today).toHaveLength(1);
  today[0].onPress();
  expect(onOpenToday).toHaveBeenCalledExactlyOnceWith("local-active");
  state.buttons.find((button) => button.label.includes("remote-active"))!.onPress();
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("remote-active");
});

it("keeps dates and destinations in separate single lines with full accessible names at every font scale", () => {
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
        String(p.children).includes("myTrips.cachedDateSummary"),
      );
      expect(metadata?.children).toContain("2026-11-20");
      expect(metadata?.children).toContain("2026-11-22");
      expect(metadata?.numberOfLines).toBe(1);
      const destination = state.texts.find(
        (p) => p.children === "Sydney Harbour and Northern Beaches",
      );
      expect(destination?.numberOfLines).toBe(1);
      expect(html).toContain("Sydney Harbour and Northern Beaches");
      expect(html).not.toContain("myTrips.openToday");
    }
  } finally {
    state.fontScale = 1;
  }
});

vi.mock("expo-router", () => ({ router: { navigate: vi.fn(), push: state.push } }));

const pastFixture = (id: string) => ({
  id,
  name: `Past ${id}`,
  destination: "Auckland / Tokyo / Kyoto / Osaka",
  startDate: "2026-09-01",
  endDate: "2026-09-02",
  createdAt: null,
  localStatus: null,
  selectedCoverAssetId: null,
  remoteListed: true as const,
});
for (const count of [0, 1, 3, 4, 7]) {
  it(`shows only the first three of ${count} Past trips and pushes the full list only above three`, () => {
    state.buttons = [];
    state.push.mockClear();
    const props = {
      trips: [],
      remoteTrips: Array.from({ length: count }, (_, i) => pastFixture(String(i))),
      today: "2026-10-15",
      eligibleToday: {},
      onOpen: vi.fn(),
      onOpenToday: vi.fn(),
      onCreate: vi.fn(),
    };
    renderToStaticMarkup(createElement(MyTripsList, props));
    expect(
      state.buttons.filter((b) => b.label.startsWith("myTrips.openTripDetails")),
    ).toHaveLength(Math.min(count, 3));
    const more = state.buttons.find((b) => b.label.startsWith("myTrips.seeAllPastCount"));
    expect(Boolean(more)).toBe(count > 3);
    if (more) {
      expect(more.label).toContain(String(count));
      more.onPress();
      expect(state.push).toHaveBeenCalledWith("/past-trips");
    }
    state.buttons = [];
    const all = renderToStaticMarkup(
      createElement(MyTripsList, { ...props, pastOnly: true }),
    );
    expect(
      state.buttons.filter((b) => b.label.startsWith("myTrips.openTripDetails")),
    ).toHaveLength(count);
    expect(all).not.toContain("myTrips.seeAllPastCount");
    expect(all).not.toContain("myTrips.emptyTitle");
  });
}
it("shows all four Upcoming and undated rows, two heroes, and full long CJK/English accessible names", () => {
  state.buttons = [];
  state.texts = [];
  const longName = "与朋友的海岸山地家庭旅行 Auckland Coast and Mountain Family Journey";
  const upcoming = Array.from({ length: 4 }, (_, i) => ({
    ...pastFixture(`future${i}`),
    name: `${longName}${i}`,
    startDate: "2027-01-01",
    endDate: "2027-01-03",
  }));
  const undated = Array.from({ length: 4 }, (_, i) => ({
    ...pastFixture(`undated${i}`),
    startDate: null,
    endDate: null,
  }));
  const active = Array.from({ length: 2 }, (_, i) => ({
    ...pastFixture(`active${i}`),
    startDate: "2026-10-01",
    endDate: "2026-10-30",
  }));
  renderToStaticMarkup(
    createElement(MyTripsList, {
      trips: [],
      remoteTrips: [...upcoming, ...undated, ...active],
      today: "2026-10-15",
      eligibleToday: {},
      onOpen: vi.fn(),
      onOpenToday: vi.fn(),
      onCreate: vi.fn(),
    }),
  );
  expect(
    state.buttons.filter((b) => b.label.startsWith("myTrips.openTripDetails")),
  ).toHaveLength(10);
  expect(state.buttons.some((b) => b.label.includes(longName))).toBe(true);
  expect(state.buttons.some((b) => b.label.includes("seeAll"))).toBe(false);
  expect(state.texts.find((p) => p.children === upcoming[0].name)?.numberOfLines).toBe(2);
});
