import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { closedItemCapabilities } from "@/domain/trip/tripCoreV2Day";
import type { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { LocalCoreItemPreview } from "./LocalCoreItemPreview";

vi.mock("react-native", () => ({
  Modal: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => createElement("div", null, p.children),
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: () => null,
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const item = (family: "P1" | "P3", description: string | null) => {
  const value: NonNullable<ReturnType<typeof projectCoreItem>> = {
    itemId: "item-preview",
    tripId: "trip-preview",
    itemRevision: 1,
    title: "Visit the museum",
    family,
    description,
    status: "PLANNED",
    hidden: false,
    localState: "PENDING",
    participation: { mode: "WHOLE_GROUP", personIds: [] },
    schedule: { shape: "POINT" },
    details: {},
    bookingSummaries: [],
    entitlementSummaries: [],
    documentSummaries: [],
    instructionShortcuts: [],
    expenseLinkIds: [],
    capabilities: closedItemCapabilities,
  };
  return value;
};

it("shows saved P1 Notes exactly and hides absent or non-P1 Notes", () => {
  const render = (family: "P1" | "P3", description: string | null) =>
    renderToStaticMarkup(
      createElement(LocalCoreItemPreview, {
        item: item(family, description),
        onClose: () => {},
      }),
    );
  expect(render("P1", "Meet at 9.\nBring tickets.")).toContain("tripCreate.planNotes");
  expect(render("P1", "Meet at 9.\nBring tickets.")).toContain(
    "Meet at 9.\nBring tickets.",
  );
  expect(render("P1", "  ")).not.toContain("tripCreate.planNotes");
  expect(render("P3", "Private note")).not.toContain("tripCreate.planNotes");
});
