import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { closedItemCapabilities } from "@/domain/trip/tripCoreV2Day";
import { coreDefaults, corePlaceSchema } from "@/domain/trip/tripCoreV2";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
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
const item = (
  family: "P1" | "P3",
  description: string | null,
  details: Record<string, unknown> = {},
) => {
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
    details,
    bookingSummaries: [],
    entitlementSummaries: [],
    documentSummaries: [],
    instructionShortcuts: [],
    expenseLinkIds: [],
    capabilities: closedItemCapabilities,
  };
  return value;
};

it("shows saved P1 and P3 Notes exactly, hiding empty Notes", () => {
  const render = (
    family: "P1" | "P3",
    description: string | null,
    details?: Record<string, unknown>,
  ) =>
    renderToStaticMarkup(
      createElement(LocalCoreItemPreview, {
        item: item(family, description, details),
        onClose: () => {},
      }),
    );
  expect(render("P1", "Meet at 9.\nBring tickets.")).toContain("tripCreate.planNotes");
  expect(render("P1", "Meet at 9.\nBring tickets.")).toContain(
    "Meet at 9.\nBring tickets.",
  );
  expect(render("P1", "  ")).not.toContain("tripCreate.planNotes");
  expect(render("P3", "Private note")).toContain("tripCreate.stayNotes");
  expect(render("P3", "Private note")).toContain("Private note");
  const stayDetails = render("P3", null, {
    propertyName: "Harbour Inn",
    permittedCheckinFrom: "15:00",
    permittedCheckoutBy: "10:00",
  });
  expect(stayDetails).toContain("tripCreate.stayPropertyName");
  expect(stayDetails).toContain("tripCreate.stayArrivalFrom");
  expect(render("P3", null, { propertyName: "Visit the museum" })).not.toContain(
    "tripCreate.stayPropertyName",
  );
  expect(render("P3", null, { permittedCheckoutBy: "10:00" })).toContain(
    "tripCreate.stayCheckoutBy",
  );
});

it("renders the public P3 Core projection, including stored Stay details", () => {
  const tripId = randomUUID();
  const itemId = randomUUID();
  const actor = {
    accountId: randomUUID(),
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P3",
        core: { title: "Harbour Inn", description: "Ask for a quiet room." },
        schedule: {
          start: coreDateBoundary("2026-12-14"),
          end: coreDateBoundary("2026-12-17"),
        },
        ...coreDefaults("organizer"),
        details: {
          property_name: "Harbour Inn",
          permitted_checkin_from: "15:00",
          permitted_checkout_by: "10:00",
        },
      },
    },
    actor,
    "2026-10-21T00:00:00Z",
  ).graph;
  const projected = projectCoreItem(graph, actor, itemId);
  expect(projected).not.toBeNull();
  const markup = renderToStaticMarkup(
    createElement(LocalCoreItemPreview, { item: projected!, onClose: () => {} }),
  );
  expect(markup).toContain("tripCreate.stayArrivalFrom");
  expect(markup).toContain("15:00");
  expect(markup).toContain("tripCreate.stayCheckoutBy");
  expect(markup).toContain("10:00");
  expect(markup).toContain("Ask for a quiet room.");
});

it("renders real P4 pickup, return, vehicle and Notes projection without renaming Rental", () => {
  const tripId = randomUUID();
  const itemId = randomUUID();
  const actor = {
    accountId: randomUUID(),
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  const place = (authored_label: string) => ({
    ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, null])),
    authored_label,
  });
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P4",
        core: { title: "Family rental", description: "Keep the contract." },
        schedule: {
          start: coreDateBoundary("2026-10-20"),
          end: coreDateBoundary("2026-10-23"),
        },
        ...coreDefaults("organizer"),
        details: { actual_vehicle_model: "Actual model", verified_plate: "TEST123" },
        places: { pickup: place("Airport counter"), return: place("City office") },
      },
    },
    actor,
    "2026-10-21T00:00:00Z",
  ).graph;
  const projected = projectCoreItem(graph, actor, itemId);
  expect(projected?.title).toBe("Family rental");
  const markup = renderToStaticMarkup(
    createElement(LocalCoreItemPreview, { item: projected!, onClose: () => {} }),
  );
  expect(markup).toContain("tripCreate.rentalPickupPlace");
  expect(markup).toContain("Airport counter");
  expect(markup).toContain("tripCreate.rentalReturnPlace");
  expect(markup).toContain("City office");
  expect(markup).toContain("Actual model");
  expect(markup).toContain("TEST123");
  expect(markup).toContain("Keep the contract.");
});

it("renders a real P5 origin and preserves unknown arrival", () => {
  const tripId = randomUUID();
  const itemId = randomUUID();
  const actor = {
    accountId: randomUUID(),
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  const place = (authored_label: string) => ({
    ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, null])),
    authored_label,
  });
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P5",
        core: { title: "Train to town", description: "Use platform signs." },
        endpoints: {
          origin: {
            time: coreDateBoundary("2026-10-20"),
            place: place("Central Station"),
          },
          destination: {
            time: { ...coreDateBoundary("2026-10-20"), local_date: null },
            place: place("Unknown arrival"),
          },
        },
        service: {
          service_key: "manual.segment",
          transport_subtype: "TRAIN",
          attribution: "UNSPECIFIED",
          operator_namespace: "NAME",
          operator_issuer: "",
          operator_value: "",
          operator_literal: "",
          service_number: "",
          service_literal: "",
          codeshare_operating_key: null,
        },
        ...coreDefaults("organizer"),
      },
    },
    actor,
    "2026-10-21T00:00:00Z",
  ).graph;
  const projected = projectCoreItem(graph, actor, itemId)!;
  const markup = renderToStaticMarkup(
    createElement(LocalCoreItemPreview, { item: projected, onClose: () => {} }),
  );
  expect(markup).toContain("tripCreate.transport");
  expect(markup).toContain("Central Station");
  expect(markup).toContain("Unknown arrival");
  expect(markup).toContain("Use platform signs.");
  expect(projected.schedule).not.toHaveProperty("destination.time.localDate");
});
