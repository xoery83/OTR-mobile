import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { createTripRepository } from "@/data/repositories/tripRepository";
import {
  createTripPreparationSetupRepository,
  type TripPreparationSetup,
} from "@/data/repositories/tripPreparationSetupRepository";
import type { Trip } from "@/domain/trip/types";
import { UiText } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { Modal } from "react-native";
import { SheetHeader } from "@/components/SheetHeader";
import { TripBasicEditor } from "./TripBasicEditor";
import { TripMetadataFields } from "./TripMetadataFields";
import { TripCoverPicker } from "./TripCoverPicker";
import { TripMembersSummary } from "./TripSetupRows";
import { TripMembersSheet } from "./TripMembersSheet";

const hooks = vi.hoisted(() => ({
  values: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    const values = hooks.values;
    return [
      values[i],
      (value: any) => {
        values[i] = value;
      },
    ];
  },
  useRef: (initial: any) => (hooks.refs[hooks.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  View: "View",
  Modal: "Modal",
  ScrollView: "ScrollView",
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("@/ui/controls", () => ({
  UiText: "UiText",
  UiButton: "UiButton",
  UiSection: "UiSection",
}));
vi.mock("@/ui/forms", () => ({ UiFormRow: "UiFormRow" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, params: any = {}) => [key, ...Object.values(params)].join(":"),
  formatUiNumber: String,
}));
vi.mock("./TripMetadataFields", () => ({ TripMetadataFields: "TripMetadataFields" }));
vi.mock("./TripCoverPicker", () => ({ TripCoverPicker: "TripCoverPicker" }));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: "TripCoverVisual" }));
vi.mock("./tripCovers", () => ({ tripCoverSource: () => 1 }));
vi.mock("./TripCalendarRangeField", () => ({ tripRangeLabel: () => "range" }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: vi.fn(),
  readLocalSession: vi.fn(),
}));

type Node = ReactElement<any>;
function nodes(node: ReactNode): Node[] {
  return isValidElement(node)
    ? [node as Node, ...Children.toArray((node as Node).props.children).flatMap(nodes)]
    : [];
}
function remount() {
  hooks.values = [];
  hooks.refs = [];
  hooks.cursor = hooks.refCursor = 0;
}
beforeEach(remount);
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const sql of connections.splice(0)) {
    try {
      sql.close();
    } catch {}
  }
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
function fixture(path = ":memory:", originalAccount = randomUUID(), initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let account = originalAccount,
    failQueue = false;
  const database = {
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      if (failQueue && query.startsWith("INSERT INTO sync_operations")) {
        failQueue = false;
        throw new Error("QUEUE_WRITE_FAILED");
      }
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const identity = async () => account;
  const repo = createTripRepository(
    database,
    identity,
    { captureContext: vi.fn(), enqueue: vi.fn(), pending: vi.fn() },
    () => "2026-10-17T10:00:00Z",
    async () => "Creator",
  );
  return {
    sql,
    repo,
    originalAccount,
    setup: createTripPreparationSetupRepository(database, identity),
    failNextQueue: () => {
      failQueue = true;
    },
    switchAccount: () => {
      account = randomUUID();
      advanceAccountGeneration();
    },
  };
}
function editor(f: ReturnType<typeof fixture>, trip: Trip) {
  const legacy = vi.fn();
  const apply = vi.fn<Parameters<typeof TripBasicEditor>[0]["onSaveMetadata"]>(
    async (before, after, cover, operationId) => {
      await f.repo.updateMetadata({ operationId, tripId: trip.id, before, after }, cover);
    },
  );
  const render = () => {
    hooks.cursor = hooks.refCursor = 0;
    return nodes(
      TripBasicEditor({
        trip,
        metadataEditable: true,
        onSaveMetadata: apply,
        onSelectCover: legacy,
      }),
    );
  };
  const fields = () => render().find((n) => n.type === TripMetadataFields)!.props;
  const select = (id: string) =>
    render()
      .find((n) => n.type === TripCoverPicker)!
      .props.onSelect(id);
  const save = () =>
    render()
      .find((n) => n.type === SheetHeader)!
      .props.onRight();
  const settled = () =>
    vi.waitFor(() =>
      expect(render().some((n) => n.props.children === "actionIsland.savedLocally")).toBe(
        true,
      ),
    );
  return { render, fields, select, save, settled, apply, legacy };
}
const create = () => ({
  operationId: randomUUID(),
  tripId: randomUUID(),
  name: "Original",
  destination: null,
  startDate: null,
  endDate: null,
});

it("keeps canceled cover/name drafts out of SQLite, saves both once, and reopens a cover-only change without a Hosted metadata intent", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-editor-ui-"));
  folders.push(folder);
  const path = join(folder, "trip.db"),
    f = fixture(path);
  const trip = await f.repo.createTrip(create());
  let ui = editor(f, trip);
  ui.fields().onName("Canceled name");
  await ui.select("coast");
  expect(await f.repo.getTrip(trip.id)).toMatchObject({
    name: "Original",
    selectedCoverAssetId: null,
  });
  expect(ui.apply).not.toHaveBeenCalled();
  expect(ui.legacy).not.toHaveBeenCalled();
  // Parent conditionally unmounts Editor on Close; reopening gets fresh saved props.
  remount();
  ui = editor(f, (await f.repo.getTrip(trip.id))!);
  expect(ui.fields().name).toBe("Original");
  expect(
    ui.render().find((n) => n.type === TripCoverPicker)!.props.selectedRaw,
  ).toBeNull();
  ui.fields().onName("Saved name");
  await ui.select("coast");
  ui.save();
  ui.save();
  await ui.settled();
  expect(ui.apply).toHaveBeenCalledTimes(1);
  expect(ui.apply.mock.calls[0][2]).toEqual({ before: null, after: "coast" });
  expect(await f.repo.getTrip(trip.id)).toMatchObject({
    name: "Saved name",
    selectedCoverAssetId: "coast",
  });
  await ui.select("city");
  ui.save();
  await ui.settled();
  expect(ui.apply.mock.calls[1][2]).toEqual({ before: "coast", after: "city" });
  const metadata = f.sql
    .prepare(
      "SELECT payload_json FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
    )
    .all();
  expect(metadata).toHaveLength(1);
  expect(String(metadata[0].payload_json)).not.toContain("cover");
  expect(
    f.sql
      .prepare(
        "SELECT count(*) n FROM sync_operations WHERE operation_type='TRIP_COVER_LOCAL_SAVE'",
      )
      .get()?.n,
  ).toBe(1);
  f.sql.close();
  const cold = fixture(path, f.originalAccount, false);
  expect(await cold.repo.getTrip(trip.id)).toMatchObject({
    name: "Saved name",
    selectedCoverAssetId: "city",
  });
});

it("retains both failed drafts and reuses the original atomic operation identity on retry", async () => {
  const f = fixture(),
    trip = await f.repo.createTrip(create()),
    ui = editor(f, trip);
  ui.fields().onName("Keep draft");
  await ui.select("mountain");
  f.failNextQueue();
  ui.save();
  await vi.waitFor(() =>
    expect(ui.render().some((n) => n.props.children === "tripCreate.saveFailed")).toBe(
      true,
    ),
  );
  expect(await f.repo.getTrip(trip.id)).toMatchObject({
    name: "Original",
    selectedCoverAssetId: null,
  });
  expect(ui.fields().name).toBe("Keep draft");
  expect(ui.render().find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBe(
    "mountain",
  );
  ui.save();
  await ui.settled();
  expect(ui.apply.mock.calls[1]).toEqual(ui.apply.mock.calls[0]);
  expect(await f.repo.getTrip(trip.id)).toMatchObject({
    name: "Keep draft",
    selectedCoverAssetId: "mountain",
  });
});

it("opens a real actor plus three local named people and clears the sheet on account or Trip context replacement", async () => {
  const f = fixture();
  const trip = await f.repo.createTrip({
    ...create(),
    travelers: ["One", "", "Two", "", "Three", "", ""].map((displayName) => ({
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName,
    })),
  });
  const setup = await f.setup.read(trip.id);
  if (setup.members.state !== "AVAILABLE") throw new Error("missing real roster");
  expect(setup.members.namedCount).toBe(4);
  expect(setup.members.people.filter((p) => p.isCurrentActor)).toHaveLength(1);
  let mounted: string | null = null;
  function summary(value: TripPreparationSetup | null, id = trip.id) {
    const scoped = TripMembersSummary({
      setup: value,
      tripId: id,
      generation: getAccountGeneration(),
    });
    if (mounted !== scoped.key) {
      mounted = scoped.key;
      remount();
    }
    hooks.cursor = hooks.refCursor = 0;
    return nodes((scoped.type as any)(scoped.props));
  }
  summary(setup)
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  let sheet = summary(setup).find((n) => n.type === TripMembersSheet)!;
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.members).toBe(setup.members);
  const close = vi.fn();
  const body = nodes(TripMembersSheet({ ...sheet.props, onClose: close }));
  const labels = body.filter((n) => n.type === UiText).map((n) => n.props.children);
  expect(labels).toContain("Creator");
  expect(labels).toEqual(expect.arrayContaining(["One", "Two", "Three"]));
  expect(labels.filter((s) => s === "tripMembers.localPending")).toHaveLength(3);
  expect(labels).toContain("tripMembers.currentActor");
  expect(body.find((n) => n.type === Modal)!.props.presentationStyle).toBe("pageSheet");
  body.find((n) => n.type === SheetHeader)!.props.onLeft();
  expect(close).toHaveBeenCalledOnce();
  sheet = summary(setup, randomUUID()).find((n) => n.type === TripMembersSheet)!;
  expect(sheet.props.visible).toBe(false);
  expect(sheet.props.members).toBeNull();
  summary(setup)
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  f.switchAccount();
  sheet = summary(setup).find((n) => n.type === TripMembersSheet)!;
  expect(sheet.props.visible).toBe(false);
  expect(sheet.props.members).toBeNull();
  const unknown = await f.setup.read(trip.id);
  expect(unknown.members.state).toBe("UNKNOWN");
  const unknownLabels = nodes(
    TripMembersSheet({ visible: true, members: unknown.members, onClose: close }),
  )
    .filter((n) => n.type === UiText)
    .map((n) => n.props.children);
  expect(unknownLabels).toContain("tripForm.membersUnknown");
  expect(unknownLabels).not.toContain("tripForm.namedPeople:0");
  expect(unknownLabels).not.toContain("Creator");
});
