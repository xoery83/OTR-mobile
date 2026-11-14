import { itemSchema } from "./contract";
import { corePlaceSchema } from "../src/domain/trip/tripCoreV2";
import { tripCreateBoundary } from "../backend/src/tripCreate";
import { buildCoreActorCollection } from "../backend/src/tripCoreV2Collection";
import { verifyGoldenReadback } from "./goldenReadback";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "../src/domain/trip/tripCoreV2Mutation";
import { coreHttpBoundary, type CoreHttpConnection } from "../backend/src/tripCoreV2Http";
import type { CoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
import {
  createMutationTools,
  prepareCreate,
  prepareUpdate,
  prepareTrip,
  mutationIdentity,
  contentDigest,
  sha,
  type BackendMutation,
  type ConfirmChanges,
} from "./mutation";
import { createBatchTools } from "./batch";
import { guardSourcePreservation } from "./preservation";
import { createReadTools as makeReadTools } from "./read";
import {
  prepareFieldCreate,
  prepareFieldUpdate,
  prepareStructuredPlaceUpdate,
  prepareSparseStayUpdate,
  fieldUpdateInput,
  assistantBatchOutput,
} from "./fieldAdapter";
import { batchOutput, mutationOutput } from "./mutationContract";
import type { createReadTools } from "./read";
const account = randomUUID(),
  trip = randomUUID(),
  person = randomUUID();
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: true,
  personId: person,
  personIds: [person],
};
it("S3 manual P3 place edit preserves omitted address and all unrelated room/time facts, recovers the original receipt", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), read: f.read });
  const created = prepareCreate(account, {
    ...create(),
    item: {
      ...create().item,
      place: "Old lodge entrance",
      place_address: "18 Example Quay",
      rooms: [
        { room_id: randomUUID(), category: "Family unit", quantity: 1, capacity: 4 },
      ],
    },
  });
  const saved = await tools.execute(
    created,
    "APPLY",
    mutationIdentity(account, created).preview_digest,
  );
  const base = projectCoreItem(f.graph(), actor, saved.item_id!);
  const before = structuredClone(f.graph());
  const p = prepareFieldUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: saved.item_id,
    expected_revision: 1,
    base_item: base,
    change: { kind: "PLACE", replacement: { label: "East entrance" } },
  });
  const preview = await tools.execute(p, "PREVIEW");
  expect(preview).toMatchObject({ outcome: "PREVIEW" });
  expect(preview.summary).toContain("entire place group's MANUAL/protected field state");
  expect(f.posts()).toBe(1);
  f.lose();
  expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "UNKNOWN",
  });
  expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 2,
  });
  expect(f.posts()).toBe(2);
  expect(f.graph().trip_stay_rooms).toEqual(before.trip_stay_rooms);
  expect(f.graph().trip_stay_details).toEqual(before.trip_stay_details);
  const unchanged = (row: Record<string, unknown>) => {
    const clone = structuredClone(row);
    delete clone.semantic_revision;
    delete clone.updated_at;
    for (const key of Object.keys(corePlaceSchema.shape)) {
      delete clone[key];
      delete (clone.field_state as Record<string, unknown>)[`itinerary_events.${key}`];
    }
    return clone;
  };
  expect(unchanged(f.graph().itinerary_events[0])).toEqual(
    unchanged(before.itinerary_events[0]),
  );
  expect(f.graph().itinerary_events[0]).toMatchObject({
    authored_label: "East entrance",
    authored_address: "18 Example Quay",
  });
  const proof = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: f.graph().trip_stay_details[0],
          receipt: JSON.parse(
            f.receipts.get(p.kind === "ITEM" ? p.command.operationId : "")!.receiptText,
          ),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(proof, p, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  const fresh = projectCoreItem(f.graph(), actor, saved.item_id!);
  const clear = prepareFieldUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: saved.item_id,
    expected_revision: 2,
    base_item: fresh,
    change: { kind: "PLACE", replacement: { label: "East entrance", address: null } },
  });
  expect(
    await tools.execute(clear, "APPLY", mutationIdentity(account, clear).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 3 });
  expect(f.graph().itinerary_events[0].authored_address).toBeNull();
});

it("S3 internal structured pipeline verifies the live full Base, recovers original receipt and preserves unrelated facts", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), read: f.read });
  const c = prepareCreate(account, {
    ...create(),
    item: {
      ...create().item,
      place: "QA lodge",
      place_address: "18 Example Quay",
      rooms: [
        { room_id: randomUUID(), category: "Family unit", quantity: 1, capacity: 4 },
      ],
    },
  });
  const saved = await tools.execute(
    c,
    "APPLY",
    mutationIdentity(account, c).preview_digest,
  );
  const readBase = () =>
    makeReadTools(account, f.read).get_trip_item_edit_base({
      trip_id: trip,
      item_id: saved.item_id,
    });
  const old = structuredClone(f.graph());
  const p = prepareStructuredPlaceUpdate({
    request_id: randomUUID(),
    base: await readBase(),
    patch: {
      authored_address_line1: "18 Example Quay",
      authored_address_line2: "Unit B",
      authored_address_postal_code: "0701",
      authored_text: "Gate beside reception",
    },
  });
  const preview = await tools.execute(p, "PREVIEW");
  expect(preview.outcome).toBe("PREVIEW");
  expect(preview.summary).toContain("entire place group's");
  expect(f.posts()).toBe(1);
  f.lose();
  expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "UNKNOWN",
  });
  expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 2,
  });
  expect(f.posts()).toBe(2);
  expect(f.graph().trip_stay_rooms).toEqual(old.trip_stay_rooms);
  expect(f.graph().trip_stay_details).toEqual(old.trip_stay_details);
  const receipt = JSON.parse(
    f.receipts.get(p.kind === "ITEM" ? p.command.operationId : "")!.receiptText,
  );
  expect(
    await verifyGoldenReadback(
      {
        rows: [
          {
            evidence: {
              itemCount: 1,
              items: f.graph().itinerary_events,
              stay: f.graph().trip_stay_details[0],
              receipt,
            },
          },
        ],
      },
      p,
      account,
    ),
  ).toHaveProperty("status", "SERVER_VERIFIED");
  const base = await readBase();
  const patch = { authored_address_postal_code: "0702", authored_address_line2: null };
  const forged = structuredClone(base);
  (forged.record.body as Record<string, unknown>).authored_address_line1 =
    "Forged omitted line";
  const invalid = prepareStructuredPlaceUpdate({
    request_id: randomUUID(),
    base: forged,
    patch,
  });
  expect(await tools.execute(invalid, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "STRUCTURED_PLACE_CURRENT_FULL_BASE_CONFLICT",
  });
  const next = prepareStructuredPlaceUpdate({ request_id: randomUUID(), base, patch });
  if (next.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  const tampered = structuredClone(next);
  (
    tampered.command.payload as { place: Record<string, unknown> }
  ).place.authored_address_line1 = "Not in patch";
  expect(
    await tools.execute(
      tampered,
      "APPLY",
      mutationIdentity(account, tampered).preview_digest,
    ),
  ).toMatchObject({
    outcome: "REJECTED",
    error_code: "STRUCTURED_PLACE_PAYLOAD_MISMATCH",
  });
  const nextPreview = await tools.execute(next, "PREVIEW");
  expect(await tools.execute(next, "APPLY", nextPreview.preview_digest)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 3,
  });
  expect(f.graph().itinerary_events[0]).toMatchObject({
    authored_label: "QA lodge",
    authored_address: "18 Example Quay",
    authored_address_line1: "18 Example Quay",
    authored_address_line2: null,
    authored_address_postal_code: "0702",
    authored_text: "Gate beside reception",
  });
  expect(f.posts()).toBe(3);
  expect(f.graph().trip_stay_rooms).toEqual(old.trip_stay_rooms);
  expect(f.graph().trip_stay_details).toEqual(old.trip_stay_details);
});

it("S3 standard SDK discovers structured manual fields and preserves single/batch original-ID recovery", async () => {
  const f = fixture(),
    setup = createMutationTools({ ...context(f.backend), read: f.read });
  const c = prepareCreate(account, {
    ...create(),
    item: { ...create().item, place: "QA lodge", place_address: "18 Example Quay" },
  });
  const saved = await setup.execute(
    c,
    "APPLY",
    mutationIdentity(account, c).preview_digest,
  );
  const approved = new Set<string>(),
    resource = "https://sdk.local.invalid/mcp";
  const handler = createMcpHandler({
    resource,
    taskAssistant: true,
    authorize: async () => ({
      accountId: account,
      clientId: "qa-client",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
    confirm: async (q) => approved.has(q.digest),
  });
  const client = new Client({ name: "structured-place-sdk-local", version: "1" });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent as Record<string, unknown>;
  };
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const discovered = await client.listTools();
    expect(
      JSON.stringify(
        discovered.tools.find((t) => t.name === "update_trip_item_fields")?.inputSchema,
      ),
    ).toContain("STRUCTURED_PLACE");
    const guide = await call("get_otr_operating_guide", { section: "FIELDS" });
    expect(guide.text).toContain("ENTIRE unchanged result");
    const capabilities = await call("get_otr_operating_guide", {
      section: "CAPABILITIES",
    });
    expect(JSON.parse(capabilities.text as string).existing_place_apply).toContain(
      "STRUCTURED_AUTHORED",
    );
    const base = await call("get_trip_item_edit_base", {
      trip_id: trip,
      item_id: saved.item_id,
    });
    const input = {
      request_id: randomUUID(),
      trip_id: trip,
      item_id: saved.item_id,
      expected_revision: 1,
      base_item: base.item,
      change: {
        kind: "STRUCTURED_PLACE",
        base,
        patch: {
          authored_address_line1: "18 Example Quay",
          authored_address_line2: "Unit B",
          authored_address_postal_code: "0701",
        },
      },
    };
    const preview = await call("update_trip_item_fields", input);
    expect(preview.outcome).toBe("PREVIEW");
    expect(f.posts()).toBe(1);
    const apply = { ...input, mode: "APPLY", preview_digest: preview.preview_digest };
    expect((await call("update_trip_item_fields", apply)).outcome).toBe(
      "NEEDS_CONFIRMATION",
    );
    expect(f.posts()).toBe(1);
    approved.add(preview.preview_digest as string);
    f.lose();
    expect((await call("update_trip_item_fields", apply)).outcome).toBe("UNKNOWN");
    expect(await call("update_trip_item_fields", apply)).toMatchObject({
      outcome: "APPLIED",
      current_revision: 2,
    });
    expect(f.posts()).toBe(2);
    const next = await call("get_trip_item_edit_base", {
      trip_id: trip,
      item_id: saved.item_id,
    });
    const plan = {
      trip_id: trip,
      changes: [
        {
          kind: "FIELD_UPDATE",
          request_id: randomUUID(),
          item_id: saved.item_id,
          expected_revision: 2,
          base_item: next.item,
          change: {
            kind: "STRUCTURED_PLACE",
            base: next,
            patch: { authored_address_postal_code: "0702", authored_address_line2: null },
          },
        },
      ],
    };
    const batchPreview = await call("preview_trip_changes", plan);
    expect(batchPreview.outcome).toBe("PREVIEW");
    expect(
      (
        await call("apply_trip_changes", {
          ...plan,
          preview_digest: batchPreview.preview_digest,
        })
      ).outcome,
    ).toBe("NEEDS_CONFIRMATION");
    approved.add(batchPreview.preview_digest as string);
    f.lose();
    expect(
      (
        await call("apply_trip_changes", {
          ...plan,
          preview_digest: batchPreview.preview_digest,
        })
      ).outcome,
    ).toBe("PARTIAL");
    const recovered = await call("apply_trip_changes", {
      ...plan,
      preview_digest: batchPreview.preview_digest,
    });
    expect(recovered.outcome).toBe("APPLIED");
    expect(recovered.operations).toMatchObject([
      { outcome: "APPLIED", current_revision: 3 },
    ]);
    expect(f.posts()).toBe(3);
    expect(f.graph().itinerary_events[0]).toMatchObject({
      authored_label: "QA lodge",
      authored_address: "18 Example Quay",
      authored_address_line1: "18 Example Quay",
      authored_address_line2: null,
      authored_address_postal_code: "0702",
    });
  } finally {
    await client.close();
  }
});

it("P4 standard SDK creates all supported rental facts and sparsely edits each detail with original receipt recovery", async () => {
  const f = fixture(),
    approved = new Set<string>();
  const resource = "https://p4-sdk.local.invalid/mcp";
  const handler = createMcpHandler({
    resource,
    taskAssistant: true,
    authorize: async () => ({
      accountId: account,
      clientId: "qa-client",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
    confirm: async (q) => approved.has(q.digest),
  });
  const client = new Client({ name: "p4-supported-fields-local", version: "1" });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent as Record<string, unknown>;
  };
  const proof = (operationId: string) => ({
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: null,
          rental: f.graph().trip_rental_details[0],
          rentalPlaces: f.graph().trip_rental_places,
          receipt: JSON.parse(f.receipts.get(operationId)!.receiptText),
        },
      },
    ],
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const discovered = await client.listTools();
    const schema = JSON.stringify(
      discovered.tools.find((t) => t.name === "update_trip_item_fields")?.inputSchema,
    );
    const guide = await call("get_otr_operating_guide", { section: "FIELDS" });
    for (const field of [
      "supplier",
      "reserved_category",
      "or_similar",
      "actual_vehicle_model",
      "verified_plate",
    ]) {
      expect(schema).toContain(field);
      expect(guide.text).toContain("item.rental." + field);
    }
    const input = {
      request_id: randomUUID(),
      trip_id: trip,
      item: {
        family: "P4",
        title: "Synthetic full rental",
        notes: "Use the signed QA desk.",
        dates: {
          start_date: "2026-12-10",
          end_date: "2026-12-12",
          start_time: "11:15",
          end_time: "09:45",
          start_zone: "Pacific/Auckland",
          end_zone: "Pacific/Auckland",
        },
        rental: {
          supplier: "QA Rentals",
          reserved_category: "Compact SUV",
          or_similar: true,
          actual_vehicle_model: "QA Model",
          verified_plate: "QA-OLD",
        },
        place: "QA pickup",
        place_address: "18 Pickup Quay",
        return_place: "QA return",
        return_address: "24 Return Road",
      },
    };
    const preparedCreate = prepareCreate(account, input);
    if (preparedCreate.kind !== "ITEM") throw Error("ITEM_REQUIRED");
    const preview = await call("create_trip_item", input);
    expect(preview.outcome).toBe("PREVIEW");
    const apply = { ...input, mode: "APPLY", preview_digest: preview.preview_digest };
    expect((await call("create_trip_item", apply)).outcome).toBe("NEEDS_CONFIRMATION");
    expect(f.posts()).toBe(0);
    approved.add(preview.preview_digest as string);
    const created = await call("create_trip_item", apply);
    expect(created).toMatchObject({
      outcome: "APPLIED",
      operation_id: preparedCreate.command.operationId,
      current_revision: 1,
    });
    expect(
      await verifyGoldenReadback(
        proof(preparedCreate.command.operationId),
        preparedCreate,
        account,
      ),
    ).toHaveProperty("status", "SERVER_VERIFIED");
    let revision = 1;
    for (const details of [
      { supplier: "QA Updated Rentals" },
      { reserved_category: "Premium SUV" },
      { or_similar: false },
      { actual_vehicle_model: "QA Updated Model" },
      { verified_plate: "QA-NEW" },
      { actual_vehicle_model: null },
    ]) {
      const before = structuredClone(f.graph());
      const base = await call("get_trip_item_edit_base", {
        trip_id: trip,
        item_id: created.item_id,
      });
      const change = {
        request_id: randomUUID(),
        trip_id: trip,
        item_id: created.item_id,
        expected_revision: revision,
        base_item: base.item,
        change: { kind: "RENTAL", details },
      };
      const prepared = prepareFieldUpdate(change);
      if (prepared.kind !== "ITEM") throw Error("ITEM_REQUIRED");
      const preview = await call("update_trip_item_fields", change);
      expect(preview.outcome).toBe("PREVIEW");
      const apply = { ...change, mode: "APPLY", preview_digest: preview.preview_digest };
      expect((await call("update_trip_item_fields", apply)).outcome).toBe(
        "NEEDS_CONFIRMATION",
      );
      expect(f.posts()).toBe(revision);
      approved.add(preview.preview_digest as string);
      f.lose();
      expect(await call("update_trip_item_fields", apply)).toMatchObject({
        outcome: "UNKNOWN",
        operation_id: prepared.command.operationId,
      });
      expect(await call("update_trip_item_fields", apply)).toMatchObject({
        outcome: "APPLIED",
        operation_id: prepared.command.operationId,
        item_id: created.item_id,
        current_revision: ++revision,
      });
      expect(f.posts()).toBe(revision);
      expect(f.graph().trip_rental_details[0]).toEqual({
        ...before.trip_rental_details[0],
        ...details,
      });
      expect(f.graph().trip_rental_places).toEqual(before.trip_rental_places);
      const {
        semantic_revision: _br,
        updated_at: _bt,
        field_state: _bs,
        ...oldRoot
      } = before.itinerary_events[0];
      const {
        semantic_revision: _ar,
        updated_at: _at,
        field_state: _as,
        ...newRoot
      } = f.graph().itinerary_events[0];
      expect(newRoot).toEqual(oldRoot);
      const changedKey = "trip_rental_details." + Object.keys(details)[0];
      const unchangedState = (state: unknown) =>
        Object.fromEntries(
          Object.entries(state as Record<string, unknown>).filter(
            ([key]) => key !== changedKey,
          ),
        );
      expect(unchangedState(f.graph().itinerary_events[0].field_state)).toEqual(
        unchangedState(before.itinerary_events[0].field_state),
      );
      expect(
        await verifyGoldenReadback(
          proof(prepared.command.operationId),
          prepared,
          account,
        ),
      ).toHaveProperty("status", "SERVER_VERIFIED");
      const wrong = structuredClone(proof(prepared.command.operationId));
      Object.assign(wrong.rows[0].evidence.rental, {
        [Object.keys(details)[0]]: "Not the saved value",
      });
      await expect(verifyGoldenReadback(wrong, prepared, account)).rejects.toThrow(
        "INDEPENDENT_EXPECTED_FIELD_MISMATCH",
      );
    }
    expect(f.graph().itinerary_events).toHaveLength(1);
    expect(f.receipts.size).toBe(7);
    expect(f.graph().trip_rental_details[0]).toMatchObject({
      or_similar: false,
      actual_vehicle_model: null,
    });
  } finally {
    await client.close();
  }
});

it("P4 standard SDK discovers RENTAL_PLACE and edits each manual endpoint with trusted confirmation", async () => {
  const f = fixture(),
    approved = new Set<string>();
  const resource = "https://p4-endpoint.local.invalid/mcp";
  const handler = createMcpHandler({
    resource,
    taskAssistant: true,
    authorize: async () => ({
      accountId: account,
      clientId: "qa-client",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
    confirm: async (q) => approved.has(q.digest),
  });
  const client = new Client({ name: "p4-endpoint-local", version: "1" });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent as Record<string, unknown>;
  };
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const tools = await client.listTools();
    expect(
      JSON.stringify(
        tools.tools.find((t) => t.name === "update_trip_item_fields")?.inputSchema,
      ),
    ).toContain("RENTAL_PLACE");
    expect((await call("get_otr_operating_guide", { section: "FIELDS" })).text).toContain(
      "RENTAL_PLACE on P4",
    );
    const createInput = {
      request_id: randomUUID(),
      trip_id: trip,
      item: {
        family: "P4",
        title: "Endpoint SDK QA",
        dates: { start_date: "2026-12-10" },
        rental: { supplier: "QA" },
        place: "Pickup",
        return_place: "Return",
      },
    };
    const createPreview = await call("create_trip_item", createInput);
    approved.add(createPreview.preview_digest as string);
    const created = await call("create_trip_item", {
      ...createInput,
      mode: "APPLY",
      preview_digest: createPreview.preview_digest,
    });
    expect(created.outcome).toBe("APPLIED");
    let revision = 1;
    for (const role of ["PICKUP", "RETURN"]) {
      const base = await call("get_trip_item_edit_base", {
        trip_id: trip,
        item_id: created.item_id,
      });
      const before = structuredClone(f.graph());
      const q = {
        request_id: randomUUID(),
        trip_id: trip,
        item_id: created.item_id,
        expected_revision: revision,
        base_item: base.item,
        change: {
          kind: "RENTAL_PLACE",
          base,
          role,
          patch: {
            authored_address_line1: `QA ${role} Road`,
            authored_address_country: "New Zealand",
          },
        },
      };
      const preview = await call("update_trip_item_fields", q);
      expect(preview.outcome).toBe("PREVIEW");
      const apply = { ...q, mode: "APPLY", preview_digest: preview.preview_digest };
      expect((await call("update_trip_item_fields", apply)).outcome).toBe(
        "NEEDS_CONFIRMATION",
      );
      expect(f.posts()).toBe(revision);
      approved.add(preview.preview_digest as string);
      f.lose();
      expect((await call("update_trip_item_fields", apply)).outcome).toBe("UNKNOWN");
      expect(await call("update_trip_item_fields", apply)).toMatchObject({
        outcome: "APPLIED",
        current_revision: ++revision,
        item_id: created.item_id,
        operation_id: q.request_id,
      });
      expect(f.posts()).toBe(revision);
      expect(f.graph().trip_rental_details).toEqual(before.trip_rental_details);
      expect(f.graph().trip_rental_places.find((r) => r.role !== role)).toEqual(
        before.trip_rental_places.find((r) => r.role !== role),
      );
      expect(f.graph().trip_rental_places.find((r) => r.role === role)).toEqual({
        ...before.trip_rental_places.find((r) => r.role === role),
        ...q.change.patch,
      });
    }
    expect(f.receipts.size).toBe(3);
  } finally {
    await client.close();
  }
});

it.each(["PICKUP", "RETURN"] as const)(
  "P4 %s manual place binds full Base, preserves the opposite source role and recovers the original receipt",
  async (role) => {
    const f = fixture(),
      tools = createMutationTools({ ...context(f.backend), read: f.read });
    const c = prepareCreate(account, {
      request_id: randomUUID(),
      trip_id: trip,
      item: {
        family: "P4",
        title: "Synthetic endpoint QA",
        dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
        rental: { supplier: "QA Rentals", or_similar: false },
        place: "Pickup desk",
        place_address: "18 Pickup Quay",
        return_place: "Return desk",
        return_address: "24 Return Road",
      },
    });
    const saved = await tools.execute(
      c,
      "APPLY",
      mutationIdentity(account, c).preview_digest,
    );
    const opposite = role === "PICKUP" ? "RETURN" : "PICKUP";
    const states = f.graph().itinerary_events[0].field_state as Record<
      string,
      Record<string, unknown>
    >;
    const sourceKey = `trip_rental_places.${opposite}.authored_label`;
    states[sourceKey] = {
      ...states[sourceKey],
      origin: "SOURCE",
      evidence_ref: "synthetic-evidence",
    };
    const base = await makeReadTools(account, f.read).get_trip_item_edit_base({
      trip_id: trip,
      item_id: saved.item_id!,
    });
    const before = structuredClone(f.graph());
    const request = {
      request_id: randomUUID(),
      trip_id: trip,
      item_id: saved.item_id,
      expected_revision: 1,
      base_item: base.item,
      change: {
        kind: "RENTAL_PLACE",
        base,
        role,
        patch: {
          authored_address_line2: "Desk B",
          authored_address_postal_code: "0701",
          authored_text: "Use side gate",
          authored_address: null,
        },
      },
    };
    const p = prepareFieldUpdate(request);
    const preview = await tools.execute(p, "PREVIEW");
    expect(preview.outcome).toBe("PREVIEW");
    expect(preview.summary).toContain("entire selected rental place group's");
    const altered = structuredClone(p);
    if (altered.kind !== "ITEM") throw Error("ITEM_REQUIRED");
    (altered.command.payload as { details: Record<string, unknown> }).details.supplier =
      "Unapproved";
    expect(await tools.execute(altered, "PREVIEW")).toMatchObject({
      error_code: "STRUCTURED_PLACE_PAYLOAD_MISMATCH",
    });
    const row = f.graph().trip_rental_places.find((r) => r.role === role)!;
    const oldAddress = row.authored_address_line2;
    row.authored_address_line2 = "Concurrent unrevisioned drift";
    expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
      error_code: "STRUCTURED_PLACE_CURRENT_FULL_BASE_CONFLICT",
    });
    row.authored_address_line2 = oldAddress;
    f.lose();
    expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
      outcome: "UNKNOWN",
    });
    expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
      outcome: "APPLIED",
      current_revision: 2,
    });
    expect(f.posts()).toBe(2);
    expect(f.graph().trip_rental_details).toEqual(before.trip_rental_details);
    expect(f.graph().trip_rental_places.find((r) => r.role === opposite)).toEqual(
      before.trip_rental_places.find((r) => r.role === opposite),
    );
    const changed = f.graph().trip_rental_places.find((r) => r.role === role)!;
    const original = before.trip_rental_places.find((r) => r.role === role)!;
    expect(changed).toEqual({ ...original, ...request.change.patch });
    const unchanged = (raw: Record<string, unknown>) => {
      const r = structuredClone(raw);
      delete r.semantic_revision;
      delete r.updated_at;
      for (const key of Object.keys(corePlaceSchema.shape))
        delete (r.field_state as Record<string, unknown>)[
          `trip_rental_places.${role}.${key}`
        ];
      return r;
    };
    expect(unchanged(f.graph().itinerary_events[0])).toEqual(
      unchanged(before.itinerary_events[0]),
    );
    if (p.kind !== "ITEM") throw Error("ITEM_REQUIRED");
    const proof = {
      rows: [
        {
          evidence: {
            itemCount: 1,
            items: f.graph().itinerary_events,
            stay: null,
            rental: f.graph().trip_rental_details[0],
            rentalPlaces: f.graph().trip_rental_places,
            receipt: JSON.parse(f.receipts.get(p.command.operationId)!.receiptText),
          },
        },
      ],
    };
    expect(await verifyGoldenReadback(proof, p, account)).toHaveProperty(
      "status",
      "SERVER_VERIFIED",
    );
    for (const patch of [
      { authored_text: "Wrong" },
      { event_id: randomUUID() },
      { trip_id: randomUUID() },
    ]) {
      const bad = structuredClone(proof);
      Object.assign(
        bad.rows[0].evidence.rentalPlaces.find((r) => r.role === role)!,
        patch,
      );
      await expect(verifyGoldenReadback(bad, p, account)).rejects.toThrow(
        "INDEPENDENT_EXPECTED_FIELD_MISMATCH",
      );
    }
    const duplicate = structuredClone(proof);
    duplicate.rows[0].evidence.rentalPlaces.push(structuredClone(changed));
    await expect(verifyGoldenReadback(duplicate, p, account)).rejects.toThrow(
      "INDEPENDENT_RENTAL_PLACE_IDENTITY_REQUIRED",
    );
    for (const modify of [
      (body: Record<string, unknown>) => {
        (body.trip_rental_places as Record<string, unknown>[]).push(
          structuredClone((body.trip_rental_places as Record<string, unknown>[])[0]),
        );
      },
      (body: Record<string, unknown>) => {
        (body.trip_rental_places as Record<string, unknown>[])[0].trip_id = randomUUID();
      },
      (body: Record<string, unknown>) => {
        body.trip_rental_places = [];
      },
      (body: Record<string, unknown>) => {
        body.trip_rental_details = [];
      },
      (body: Record<string, unknown>) => {
        (body.trip_rental_places as Record<string, unknown>[]).find(
          (r) => r.role === role,
        )!.accepted_place_id = randomUUID();
      },
      (body: Record<string, unknown>) => {
        (body.field_state as Record<string, Record<string, unknown>>)[
          `trip_rental_places.${role}.authored_label`
        ].origin = "SOURCE";
      },
      (body: Record<string, unknown>) => {
        delete (body.field_state as Record<string, unknown>)[
          `trip_rental_places.${role}.authored_label`
        ];
      },
    ]) {
      const b = structuredClone(base);
      modify(b.record.body as Record<string, unknown>);
      expect(() =>
        prepareFieldUpdate({ ...request, change: { ...request.change, base: b } }),
      ).toThrow();
    }
    const current = await makeReadTools(account, f.read).get_trip_item_edit_base({
      trip_id: trip,
      item_id: saved.item_id!,
    });
    const clear = prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: saved.item_id,
      expected_revision: 2,
      base_item: current.item,
      change: { kind: "RENTAL", details: {} },
    });
    if (clear.kind !== "ITEM") throw Error("ITEM_REQUIRED");
    clear.command = {
      ...clear.command,
      payload: {
        details: {},
        places: { [role === "PICKUP" ? "pickup" : "return"]: null },
      },
    };
    expect(
      (
        await tools.execute(
          clear,
          "APPLY",
          mutationIdentity(account, clear).preview_digest,
        )
      ).outcome,
    ).toBe("APPLIED");
    const clearProof = {
      rows: [
        {
          evidence: {
            itemCount: 1,
            items: f.graph().itinerary_events,
            stay: null,
            rental: f.graph().trip_rental_details[0],
            rentalPlaces: f.graph().trip_rental_places,
            receipt: JSON.parse(f.receipts.get(clear.command.operationId)!.receiptText),
          },
        },
      ],
    };
    await expect(verifyGoldenReadback(clearProof, clear, account)).rejects.toThrow(
      "INDEPENDENT_RENTAL_WHOLE_ROLE_CLEAR_UNSUPPORTED",
    );
  },
);

it("P4 details-only edit preserves omitted source fields and verifies its exact formal readback", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), read: f.read });
  const c = prepareCreate(account, {
    request_id: randomUUID(),
    trip_id: trip,
    item: {
      family: "P4",
      title: "Synthetic rental QA",
      dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
      rental: {
        supplier: "Synthetic QA Rentals",
        reserved_category: "Compact SUV",
        or_similar: true,
        actual_vehicle_model: "QA Model",
        verified_plate: "QA-OLD",
      },
      place: "QA rental desk",
      place_address: "18 Pickup Quay",
      return_place: "QA return desk",
      return_address: "24 Return Road",
    },
  });
  const created = await tools.execute(
    c,
    "APPLY",
    mutationIdentity(account, c).preview_digest,
  );
  const states = f.graph().itinerary_events[0].field_state as Record<
    string,
    Record<string, unknown>
  >;
  const sourceKey = "trip_rental_details.supplier";
  states[sourceKey] = {
    ...states[sourceKey],
    origin: "SOURCE",
    evidence_ref: "synthetic-rental-evidence",
  };
  const before = structuredClone(f.graph());
  expect(before.trip_rental_places.map((r) => r.role).sort()).toEqual([
    "PICKUP",
    "RETURN",
  ]);
  const base = projectCoreItem(f.graph(), actor, created.item_id!);
  const p = prepareFieldUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    base_item: base,
    change: { kind: "RENTAL", details: { verified_plate: "QA-NEW" } },
  });
  const preview = await tools.execute(p, "PREVIEW");
  expect(preview.outcome).toBe("PREVIEW");
  f.lose();
  expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
    "UNKNOWN",
  );
  expect(await tools.execute(p, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 2,
  });
  expect(f.posts()).toBe(2);
  expect(f.graph().trip_rental_places).toEqual(before.trip_rental_places);
  expect(f.graph().trip_rental_details[0]).toEqual({
    ...before.trip_rental_details[0],
    verified_plate: "QA-NEW",
  });
  for (const [key, value] of Object.entries(
    before.itinerary_events[0].field_state as Record<string, unknown>,
  ))
    if (key !== "trip_rental_details.verified_plate")
      expect(
        (f.graph().itinerary_events[0].field_state as Record<string, unknown>)[key],
      ).toEqual(value);
  const proof = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: null,
          rental: f.graph().trip_rental_details[0],
          receipt: JSON.parse(
            f.receipts.get(p.kind === "ITEM" ? p.command.operationId : "")!.receiptText,
          ),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(proof, p, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  for (const changed of [
    { verified_plate: "Wrong" },
    { event_id: randomUUID() },
    { trip_id: randomUUID() },
  ]) {
    const bad = structuredClone(proof);
    Object.assign(bad.rows[0].evidence.rental, changed);
    await expect(verifyGoldenReadback(bad, p, account)).rejects.toThrow(
      "INDEPENDENT_EXPECTED_FIELD_MISMATCH",
    );
  }
  const missing = structuredClone(proof) as {
    rows: { evidence: Record<string, unknown> }[];
  };
  missing.rows[0].evidence.rental = null;
  await expect(verifyGoldenReadback(missing, p, account)).rejects.toThrow(
    "INDEPENDENT_TYPED_ROW_MISSING",
  );
});

it.each(["source", "hidden_address", "unavailable"])(
  "S3 mandatory full-record guard blocks %s even without an optional host guard",
  async (kind) => {
    const f = fixture(),
      tools = createMutationTools({ ...context(f.backend), read: f.read });
    const createOp = prepareCreate(account, {
      ...create(),
      item: { ...create().item, place: "Old lodge" },
    });
    const saved = await tools.execute(
      createOp,
      "APPLY",
      mutationIdentity(account, createOp).preview_digest,
    );
    const p = prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: saved.item_id,
      expected_revision: 1,
      base_item: projectCoreItem(f.graph(), actor, saved.item_id!),
      change: { kind: "PLACE", replacement: { label: "New lodge" } },
    });
    expect((await tools.execute(p, "PREVIEW")).outcome).toBe("PREVIEW");
    if (kind === "source") {
      const states = f.graph().itinerary_events[0].field_state as Record<
        string,
        Record<string, unknown>
      >;
      states["itinerary_events.authored_label"] = {
        ...states["itinerary_events.authored_label"],
        origin: "SOURCE",
      };
    } else if (kind === "hidden_address")
      f.graph().itinerary_events[0].authored_address_line1 = "Hidden structured line";
    const guarded =
      kind === "unavailable"
        ? createMutationTools({
            ...context(f.backend),
            read: async (path, signal) =>
              path.endsWith("/collection")
                ? Response.json({}, { status: 503 })
                : f.read(path, signal),
          })
        : tools;
    expect(
      await guarded.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
    ).toMatchObject({
      outcome: "REJECTED",
      error_code:
        kind === "source"
          ? "SOURCE_PLACE_PATCH_REQUIRES_OWNING_PRESERVATION"
          : kind === "hidden_address"
            ? "PLACE_FIELD_PRESERVATION_REQUIRES_OWNING_PORT"
            : "PLACE_FULL_BASE_UNAVAILABLE",
    });
    expect(f.posts()).toBe(1);
  },
);
it("creates complete P3 rooms through Core, rejects incomplete independent proof and preserves rooms on a text edit", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), read: f.read });
  const rooms = [
    { room_id: randomUUID(), category: "Two-bedroom unit", quantity: 1, capacity: 4 },
    { room_id: randomUUID(), category: "Studio", quantity: 1, capacity: null },
  ];
  const prepared = prepareCreate(account, {
    ...create(),
    item: {
      ...create().item,
      rooms,
      place: "Kowhai Bay QA Lodge",
      place_address: "18 Example Quay (fictional)",
      dates: {
        start_date: "2026-12-10",
        end_date: "2026-12-12",
        start_time: "17:20",
        end_time: "09:45",
        start_zone: "Pacific/Auckland",
        end_zone: "Pacific/Auckland",
      },
      stay: {
        permitted_checkin_from: "14:00",
        permitted_checkin_until: "20:00",
        permitted_checkout_by: "10:30",
      },
    },
  });
  const identity = mutationIdentity(account, prepared);
  const preview = await tools.execute(prepared, "PREVIEW");
  expect(preview).toMatchObject({ outcome: "PREVIEW" });
  expect(f.posts()).toBe(0);
  const result = await tools.execute(prepared, "APPLY", identity.preview_digest);
  expect(result).toMatchObject({ outcome: "APPLIED", current_revision: 1 });
  const replay = await tools.execute(prepared, "APPLY", identity.preview_digest);
  expect(replay.operation_id).toBe(result.operation_id);
  expect(f.posts()).toBe(1);
  expect(f.graph().trip_stay_rooms).toHaveLength(2);
  const proof = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: f.graph().trip_stay_details[0],
          stayRooms: f.graph().trip_stay_rooms,
          receipt: JSON.parse(f.receipts.get(result.operation_id)!.receiptText),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(proof, prepared, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  const missing = structuredClone(proof);
  missing.rows[0].evidence.stayRooms = [];
  await expect(verifyGoldenReadback(missing, prepared, account)).rejects.toThrow(
    "INDEPENDENT_STAY_ROOMS_REQUIRED",
  );
  const changed = structuredClone(proof);
  changed.rows[0].evidence.stayRooms[0].capacity = 7;
  await expect(verifyGoldenReadback(changed, prepared, account)).rejects.toThrow(
    "INDEPENDENT_EXPECTED_FIELD_MISMATCH:capacity",
  );
  const before = structuredClone(f.graph());
  const edit = prepareUpdate(account, {
    request_id: randomUUID(),
    trip_id: trip,
    item_id: result.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", notes: "Quiet arrival requested." },
  });
  expect(
    await tools.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(f.graph().trip_stay_rooms).toEqual(before.trip_stay_rooms);
  expect(f.graph().trip_stay_details).toEqual(before.trip_stay_details);
  const beforeState = before.itinerary_events[0].field_state as Record<string, unknown>;
  const afterState = f.graph().itinerary_events[0].field_state as Record<string, unknown>;
  for (const [key, value] of Object.entries(beforeState))
    if (key.startsWith("trip_stay_")) expect(afterState[key]).toEqual(value);
  const schedule = prepareUpdate(account, {
    request_id: randomUUID(),
    trip_id: trip,
    item_id: result.item_id,
    expected_revision: 2,
    change: {
      kind: "SCHEDULE",
      dates: {
        start_date: "2026-12-10",
        end_date: "2026-12-12",
        start_time: "17:20",
        end_time: "10:15",
        start_zone: "Pacific/Auckland",
        end_zone: "Pacific/Auckland",
      },
    },
  });
  const updated = await tools.execute(
    schedule,
    "APPLY",
    mutationIdentity(account, schedule).preview_digest,
  );
  expect(updated).toMatchObject({
    outcome: "APPLIED",
    current_revision: 3,
    item_id: result.item_id,
  });
  expect(f.graph().trip_stay_rooms).toEqual(before.trip_stay_rooms);
  expect(f.graph().trip_stay_details).toEqual(before.trip_stay_details);
  expect(f.graph().itinerary_events[0]).toMatchObject({
    authored_label: "Kowhai Bay QA Lodge",
    authored_address: "18 Example Quay (fictional)",
    start_local_time: "17:20:00",
    end_local_time: "10:15:00",
  });
  const scheduledState = f.graph().itinerary_events[0].field_state as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(beforeState))
    if (key.startsWith("trip_stay_")) expect(scheduledState[key]).toEqual(value);
  expect(
    await verifyGoldenReadback(
      {
        rows: [
          {
            evidence: {
              ...proof.rows[0].evidence,
              items: f.graph().itinerary_events,
              receipt: JSON.parse(f.receipts.get(updated.operation_id)!.receiptText),
            },
          },
        ],
      },
      schedule,
      account,
    ),
  ).toHaveProperty("status", "SERVER_VERIFIED");
});

it("rejects duplicate room IDs, invalid counts and wrong-family rooms before dispatch", () => {
  const room = { room_id: randomUUID(), category: null, quantity: 1, capacity: null };
  for (const item of [
    { ...create().item, rooms: [room, room] },
    { ...create().item, rooms: [{ ...room, quantity: 0 }] },
    { ...create().item, rooms: [{ ...room, capacity: 1.5 }] },
    {
      ...create().item,
      rooms: Array.from({ length: 65 }, () => ({ ...room, room_id: randomUUID() })),
    },
    { ...create().item, family: "P1", property_name: undefined, rooms: [] },
  ])
    expect(() => prepareCreate(account, { ...create(), item })).toThrow();
  expect(() =>
    prepareCreate(account, {
      ...create(),
      item: {
        ...create().item,
        property_name: "界".repeat(500),
        place: "址".repeat(500),
      },
    }),
  ).not.toThrow();
  expect(() =>
    prepareCreate(account, {
      ...create(),
      item: {
        ...create().item,
        property_name: "界".repeat(501),
      },
    }),
  ).toThrow();
});

it("P3 QA profile discovers only scoped writes and rejects other families or unconfirmed Apply through the actual SDK", async () => {
  const f = fixture(),
    bindTaskDomains = vi.fn();
  const resource = "http://127.0.0.1:18799/mcp";
  const handler = createMcpHandler({
    resource,
    toolProfile: "P3_STAY_QA",
    bindTaskDomains,
    confirm: async () => false,
    authorize: async () => ({
      accountId: account,
      clientId: "local-p3-qa",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
  });
  const client = new Client({ name: "p3-scoped-protocol", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const catalog = await client.listTools();
    expect(
      catalog.tools
        .filter((t) => t.annotations?.readOnlyHint === false)
        .map((t) => t.name)
        .sort(),
    ).toEqual(["create_trip_item", "update_trip_item"]);
    expect(bindTaskDomains).not.toHaveBeenCalled();
    const guide = await client.callTool({
      name: "get_otr_operating_guide",
      arguments: { section: "CAPABILITIES" },
    });
    expect(
      JSON.parse(String((guide.structuredContent as Record<string, unknown>).text)),
    ).toMatchObject({
      active_profile: "P3_STAY_QA",
      candidate_field_tools: [],
      commercial_booking_create: "UNAVAILABLE_ITEM_RECEIPT_IS_NOT_BOOKING",
    });
    const q = create();
    const preview = await client.callTool({ name: "create_trip_item", arguments: q });
    expect(preview.structuredContent).toMatchObject({ outcome: "PREVIEW" });
    const apply = await client.callTool({
      name: "create_trip_item",
      arguments: {
        ...q,
        mode: "APPLY",
        preview_digest: (preview.structuredContent as Record<string, unknown>)
          .preview_digest,
      },
    });
    expect(apply.structuredContent).toMatchObject({ outcome: "NEEDS_CONFIRMATION" });
    const foreign = await client.callTool({
      name: "create_trip_item",
      arguments: {
        ...q,
        item: { ...q.item, family: "P1", property_name: undefined },
      },
    });
    expect(foreign.isError).toBe(true);
    expect(f.posts()).toBe(0);
    const prepared = prepareCreate(account, {
      ...create(),
      item: {
        family: "P1",
        title: "Not a stay",
        dates: { start_date: "2026-12-10" },
      },
    });
    const saved = await createMutationTools(context(f.backend)).execute(
      prepared,
      "APPLY",
      mutationIdentity(account, prepared).preview_digest,
    );
    const denied = await client.callTool({
      name: "update_trip_item",
      arguments: {
        request_id: randomUUID(),
        trip_id: trip,
        item_id: saved.item_id,
        expected_revision: 1,
        change: { kind: "TEXT", notes: "Denied by family scope" },
      },
    });
    expect(denied.structuredContent).toMatchObject({
      outcome: "REJECTED",
      error_code: "P3_PROFILE_REQUIRED",
    });
    expect(f.posts()).toBe(1);
  } finally {
    await client.close();
  }
});
it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "Phase4 %s field edit preserves other facts and recovers the original receipt",
  async (family) => {
    const f = fixture();
    const tools = createMutationTools({
      ...context(f.backend),
      read: async () =>
        Response.json(
          projectCoreItem(f.graph(), actor, f.graph().itinerary_events[0].id as string),
        ),
    });
    const prepared = prepareFieldCreate(account, {
      request_id: randomUUID(),
      trip_id: trip,
      item: {
        family,
        title: "Keep title",
        notes: "Keep notes",
        dates: {
          start_date: "2026-12-10",
          ...(["P3", "P4", "P5"].includes(family) ? { end_date: "2026-12-12" } : {}),
        },
        ...(family === "P2" ? { flight_number: "QA123" } : {}),
        ...(family === "P3"
          ? { property_name: "Old lodge", stay: { permitted_checkout_by: "10:00" } }
          : {}),
        ...(family === "P4"
          ? {
              rental: { supplier: "Old supplier", reserved_category: "Compact" },
              place: "Old pickup",
            }
          : {}),
        ...(family === "P5"
          ? {
              transport: {
                subtype: "WATER_TAXI",
                origin: "Old pier",
                destination: "Old bay",
                operator: "QA Water",
                service_number: "1",
              },
            }
          : {}),
      },
      ...(["P1", "P6"].includes(family) ? { category: "HIKE" } : {}),
      ...(family === "P6"
        ? {
            activity: {
              details: { session_label: "Morning", admission_note: "Keep admission" },
            },
          }
        : {}),
    });
    const preview = await tools.execute(prepared, "PREVIEW");
    const created = await tools.execute(prepared, "APPLY", preview.preview_digest);
    expect(created.outcome).toBe("APPLIED");
    if (["P1", "P6"].includes(family))
      expect(f.graph().itinerary_events[0].activity_category).toBe("HIKE");
    const originalGraph = structuredClone(f.graph());
    const base = itemSchema.parse(projectCoreItem(f.graph(), actor, created.item_id!));
    const change =
      family === "P3"
        ? { kind: "STAY", details: { property_name: "New lodge" } }
        : family === "P4"
          ? { kind: "RENTAL", details: { supplier: "New supplier" } }
          : {
              kind: "PARTICIPATION",
              participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
            };
    const edit = prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: created.item_id,
      expected_revision: 1,
      base_item: base,
      change,
    });
    const review = await tools.execute(edit, "PREVIEW");
    expect(review.outcome).toBe("PREVIEW");
    if (family === "P3") f.lose();
    const applied = await tools.execute(edit, "APPLY", review.preview_digest);
    expect(applied.outcome).toBe(family === "P3" ? "UNKNOWN" : "APPLIED");
    const recovered = await tools.execute(edit, "APPLY", review.preview_digest);
    expect(recovered).toMatchObject({
      outcome: "APPLIED",
      item_id: created.item_id,
      current_revision: 2,
    });
    expect(f.posts()).toBe(2);
    expect(f.graph().itinerary_events).toHaveLength(1);
    expect(f.graph().itinerary_events[0]).toMatchObject({
      title: "Keep title",
      description: "Keep notes",
    });
    if (family === "P3") {
      expect(f.graph().trip_stay_rooms).toEqual(originalGraph.trip_stay_rooms);
      expect(f.graph().trip_stay_details[0]).toMatchObject({
        property_name: "New lodge",
        permitted_checkout_by: "10:00",
      });
    }
    if (family === "P4") {
      expect(f.graph().trip_rental_places).toEqual(originalGraph.trip_rental_places);
      expect(f.graph().trip_rental_details[0]).toMatchObject({
        supplier: "New supplier",
        reserved_category: "Compact",
      });
    }
    if (family === "P5")
      expect(f.graph().itinerary_transport_endpoints).toEqual(
        originalGraph.itinerary_transport_endpoints,
      );
    if (family === "P6")
      expect(f.graph().trip_activity_details[0]).toMatchObject({
        session_label: "Morning",
        admission_note: "Keep admission",
      });
  },
);
it("Phase4 field edits require the original read base and reject stale/qualified/lossy replacements", async () => {
  const f = fixture();
  const tools = createMutationTools({
    ...context(f.backend),
    read: async () =>
      Response.json(
        projectCoreItem(f.graph(), actor, f.graph().itinerary_events[0].id as string),
      ),
  });
  const createOp = prepareFieldCreate(account, create());
  const p = await tools.execute(createOp, "PREVIEW");
  const created = await tools.execute(createOp, "APPLY", p.preview_digest);
  const base = itemSchema.parse(projectCoreItem(f.graph(), actor, created.item_id!));
  const q = {
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    base_item: base,
    change: { kind: "STAY", details: { property_name: "Changed" } },
  };
  const op = prepareFieldUpdate(q);
  f.graph().itinerary_events[0].title = "Concurrent edit";
  expect(await tools.execute(op, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "CURRENT_REVISION_OR_FIELDS_CONFLICT",
  });
  expect(f.posts()).toBe(1);
  expect(() => prepareFieldUpdate({ ...q, expected_revision: 2 })).toThrow(
    "CURRENT_REVISION_CONFLICT",
  );
  expect(() => prepareFieldUpdate({ ...q, item_id: randomUUID() })).toThrow(
    "SCOPE_MISMATCH",
  );
  expect(() =>
    prepareFieldUpdate({
      ...q,
      base_item: {
        ...base,
        family: "P6",
        details: {
          entryPlace: { qualification: "TEXT_ONLY", authoredLabel: "Keep entry" },
        },
      },
      change: { kind: "ACTIVITY", details: { session_label: "Later" } },
    }),
  ).toThrow("ENTRY_PRESERVATION");
});
it("Phase4 never reasserts source-backed room fields merely to edit a property name", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const op = tools.prepareCreate(create()),
    preview = await tools.execute(op, "PREVIEW");
  const created = await tools.execute(op, "APPLY", preview.preview_digest);
  const roomId = randomUUID();
  f.graph().trip_stay_rooms.push({
    trip_id: trip,
    event_id: created.item_id!,
    room_id: roomId,
    category: "Family",
    capacity: 7,
    quantity: 1,
  });
  const row = f.graph().itinerary_events[0];
  row.field_state = {
    ...(row.field_state as object),
    [`trip_stay_rooms.${roomId}.category`]: {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "synthetic-source/room",
    },
  };
  const before = structuredClone(f.graph());
  expect(() =>
    prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: created.item_id,
      expected_revision: 1,
      base_item: itemSchema.parse(projectCoreItem(f.graph(), actor, created.item_id!)),
      change: { kind: "STAY", details: { property_name: "New lodge" } },
    }),
  ).toThrow("STAY_ROOM_PROVENANCE_PRESERVATION_REQUIRES_OWNING_PORT");
  expect(f.graph()).toEqual(before);
  expect(f.posts()).toBe(1);
});
it("Phase4B notes-only text patch preserves the source-backed title and rejects source schedule rewrites before dispatch", async () => {
  const f = fixture();
  const reads = makeReadTools(account, f.read);
  const tools = createMutationTools({
    ...context(f.backend),
    read: f.read,
    preservationGuard: (prepared) => guardSourcePreservation(prepared, reads),
  });
  const createOp = tools.prepareCreate(create());
  const created = await tools.execute(
    createOp,
    "APPLY",
    (await tools.execute(createOp, "PREVIEW")).preview_digest,
  );
  const row = f.graph().itinerary_events[0];
  const source = {
    state: "KNOWN",
    origin: "SOURCE",
    protected: false,
    changed_revision: 1,
    evidence_ref: "synthetic-source/title",
  };
  row.field_state = {
    ...(row.field_state as object),
    "itinerary_events.title": source,
    "itinerary_events.start_local_date": {
      ...source,
      evidence_ref: "synthetic-source/date",
    },
  };
  const edit = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", notes: "Only notes changed" },
  });
  const preview = await tools.execute(edit, "PREVIEW");
  expect(await tools.execute(edit, "APPLY", preview.preview_digest)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 2,
  });
  expect(f.graph().itinerary_events[0].field_state).toMatchObject({
    "itinerary_events.title": source,
    "itinerary_events.start_local_date": {
      ...source,
      evidence_ref: "synthetic-source/date",
    },
  });
  const unnecessaryTitle = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 2,
    change: { kind: "TEXT", title: row.title, notes: "More notes" },
  });
  expect(await tools.execute(unnecessaryTitle, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "OMIT_UNCHANGED_SOURCE_TEXT_FIELD",
  });
  const before = structuredClone(f.graph());
  const date = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 2,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-12" },
    },
  });
  expect(await tools.execute(date, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "SOURCE_SCHEDULE_PATCH_REQUIRES_OWNING_PRESERVATION",
  });
  expect(f.graph()).toEqual(before);
  expect(f.posts()).toBe(2);
});
it("Phase4B flight follow-up cannot erase Source-backed sparse dates", async () => {
  const f = fixture(),
    reads = makeReadTools(account, f.read);
  const tools = createMutationTools({
    ...context(f.backend),
    read: f.read,
    preservationGuard: (prepared) => guardSourcePreservation(prepared, reads),
  });
  const createOp = tools.prepareCreate({
    request_id: randomUUID(),
    trip_id: trip,
    item: {
      family: "P2",
      title: "QA123",
      flight_number: "QA123",
      dates: { start_date: "2026-12-10" },
    },
  });
  const result = await tools.execute(
    createOp,
    "APPLY",
    (await tools.execute(createOp, "PREVIEW")).preview_digest,
  );
  f.graph().itinerary_events[0].field_state = {
    ...(f.graph().itinerary_events[0].field_state as object),
    "itinerary_events.start_local_date": {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "synthetic/date",
    },
  };
  const endpoint = {
    date: "2026-12-10",
    time: null,
    zone: null,
    airport_code: null,
    name: null,
    terminal: null,
  };
  const edit = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: result.item_id,
    expected_revision: 1,
    change: {
      kind: "FLIGHT_DETAILS",
      flight_number: "QA123",
      origin: endpoint,
      destination: endpoint,
    },
  });
  const before = structuredClone(f.graph());
  expect(await tools.execute(edit, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "SOURCE_FLIGHT_PATCH_REQUIRES_OWNING_PRESERVATION",
  });
  expect(f.graph()).toEqual(before);
  expect(f.posts()).toBe(1);
});
it("Phase4 refuses lossy text-only locality/identity replacements instead of clearing hidden facts", () => {
  const base = {
    itemId: randomUUID(),
    tripId: trip,
    itemRevision: 1,
    family: "P1",
    title: "QA",
    status: "planned",
    hidden: false,
    visibility: "PRIVATE",
    localState: "ACCEPTED",
    schedule: { shape: "POINT", start: { comparable: false, localDate: "2026-12-10" } },
    details: {},
    place: {
      qualification: "TEXT_ONLY",
      authoredLabel: "Old pier",
      authoredAddressLocality: "Nelson",
      authoredAddressCountry: "NZ",
      placeId: randomUUID(),
      spatialProvenanceRefs: { source: "synthetic" },
    },
  };
  const q = {
    request_id: randomUUID(),
    trip_id: trip,
    item_id: base.itemId,
    expected_revision: 1,
    base_item: base,
    change: { kind: "PLACE", replacement: { label: "New pier" } },
  };
  expect(() => prepareFieldUpdate(q)).toThrow(
    "PLACE_FIELD_PRESERVATION_REQUIRES_OWNING_PORT",
  );
  expect(() =>
    prepareFieldUpdate({
      ...q,
      base_item: { ...base, family: "P4", details: { pickupPlace: base.place } },
      change: { kind: "RENTAL", details: {}, pickup: { label: "New pier" } },
    }),
  ).toThrow("PLACE_FIELD_PRESERVATION_REQUIRES_OWNING_PORT");
});
it("Phase4 reuses the existing batch for typed edits/create and resumes the accepted prefix after response loss", async () => {
  const f = fixture();
  const secondRequest = randomUUID();
  let lost = false;
  const backend: BackendMutation = async (q, signal) => {
    if (
      q.method === "POST" &&
      (q.body as { operationId?: string })?.operationId === secondRequest &&
      !lost
    ) {
      lost = true;
      f.lose();
    }
    return f.backend(q, signal);
  };
  const ctx = {
    ...context(backend),
    assistant: true,
    read: async (path: string) =>
      Response.json(projectCoreItem(f.graph(), actor, path.split("/").at(-1)!)),
  };
  const tools = createMutationTools(ctx);
  const initial = tools.prepareCreate(create());
  const ip = await tools.execute(initial, "PREVIEW");
  const first = await tools.execute(initial, "APPLY", ip.preview_digest);
  const readTools = {
    get_trip_item: async (q: { item_id: string }) => ({
      item: itemSchema.parse(projectCoreItem(f.graph(), actor, q.item_id)),
    }),
    list_trip_items: async () => ({
      items: f.graph().itinerary_events.map((e) => ({
        itemId: e.id,
        family: e.experience_family,
        title: e.title,
      })),
      next_cursor: null,
    }),
  } as unknown as ReturnType<typeof createReadTools>;
  const batch = createBatchTools(ctx, tools, readTools);
  const q = {
    trip_id: trip,
    changes: [
      {
        kind: "FIELD_UPDATE",
        request_id: randomUUID(),
        item_id: first.item_id,
        expected_revision: 1,
        base_item: itemSchema.parse(projectCoreItem(f.graph(), actor, first.item_id!)),
        change: { kind: "STAY", details: { property_name: "Updated lodge" } },
      },
      {
        kind: "FIELD_CREATE",
        request_id: secondRequest,
        item: {
          family: "P6",
          title: "Synthetic gallery",
          dates: { start_date: "2026-12-12" },
        },
        activity: { details: { session_label: "Morning" } },
      },
    ],
  };
  const preview = assistantBatchOutput.parse(await batch.preview_trip_changes(q));
  expect(preview.operations.every((o) => o.outcome === "PREVIEW")).toBe(true);
  const partial = await batch.apply_trip_changes({
    ...q,
    preview_digest: preview.preview_digest,
  });
  expect(partial.operations.map((o) => o.outcome)).toEqual(["APPLIED", "UNKNOWN"]);
  const resumed = assistantBatchOutput.parse(
    await batch.apply_trip_changes({ ...q, preview_digest: preview.preview_digest }),
  );
  expect(resumed.outcome).toBe("APPLIED");
  expect(f.posts()).toBe(3);
  expect(f.graph().itinerary_events).toHaveLength(2);
  expect(f.graph().trip_stay_details[0].property_name).toBe("Updated lodge");
});
it("Phase4 transport edits preserve zone/address and provenance by blocking unsafe replacement", async () => {
  const f = fixture();
  const tools = createMutationTools({
    ...context(f.backend),
    read: async () =>
      Response.json(
        projectCoreItem(f.graph(), actor, f.graph().itinerary_events[0].id as string),
      ),
  });
  const op = prepareFieldCreate(account, {
    request_id: randomUUID(),
    trip_id: trip,
    item: {
      family: "P5",
      title: "Timed QA taxi",
      dates: {
        start_date: "2026-12-10",
        start_time: "09:00",
        start_zone: "Pacific/Auckland",
        end_date: "2026-12-10",
        end_time: "10:00",
        end_zone: "Pacific/Auckland",
      },
      transport: { subtype: "WATER_TAXI", origin: "Pier", destination: "Bay" },
    },
  });
  const preview = await tools.execute(op, "PREVIEW");
  const created = await tools.execute(op, "APPLY", preview.preview_digest);
  f.graph().itinerary_transport_endpoints[0].authored_address = "1 Pier Road";
  f.graph().itinerary_events[0].field_state = {
    ...(f.graph().itinerary_events[0].field_state as object),
    "itinerary_transport_services.manual.operator_literal": {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: "synthetic-source/operator",
    },
  };
  const base = itemSchema.parse(projectCoreItem(f.graph(), actor, created.item_id!));
  const q = {
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    base_item: base,
    change: {
      kind: "TRANSPORT",
      endpoints: {
        dates: {
          start_date: "2026-12-10",
          start_time: "09:30",
          end_date: "2026-12-10",
          end_time: "10:30",
        },
        origin: { label: "Pier", address: "1 Pier Road" },
        destination: { label: "Bay" },
      },
    },
  };
  expect(() => prepareFieldUpdate(q)).toThrow("EXPLICIT_TRANSPORT_ZONE_REQUIRED");
  const complete = {
    ...q,
    change: {
      ...q.change,
      endpoints: {
        ...q.change.endpoints,
        dates: {
          ...q.change.endpoints.dates,
          start_zone: "Pacific/Auckland",
          end_zone: "Pacific/Auckland",
        },
      },
    },
  };
  expect(() =>
    prepareFieldUpdate({
      ...complete,
      change: {
        ...complete.change,
        endpoints: { ...complete.change.endpoints, origin: { label: "Pier" } },
      },
    }),
  ).toThrow("EXPLICIT_ADDRESS");
  const before = structuredClone(f.graph());
  expect(() => prepareFieldUpdate(complete)).toThrow(
    "TRANSPORT_DETAILS_PRESERVATION_REQUIRES_OWNING_PORT",
  );
  expect(() =>
    prepareFieldUpdate({ ...q, change: { kind: "TRANSPORT", service: { number: "2" } } }),
  ).toThrow("TRANSPORT_DETAILS_PRESERVATION_REQUIRES_OWNING_PORT");
  expect(f.posts()).toBe(1);
  expect(f.graph()).toEqual(before);
});
async function sparseStayFixture() {
  const f = fixture(),
    rooms = [
      { room_id: randomUUID(), category: "Family", quantity: 1, capacity: 3 },
      { room_id: randomUUID(), category: "Twin", quantity: 2, capacity: 2 },
    ];
  const p = prepareCreate(account, { ...create(), item: { ...create().item, rooms } });
  if (p.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  await createMutationTools(context(f.backend)).execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  const states = f.graph().itinerary_events[0].field_state as Record<string, unknown>;
  for (const key of Object.keys(states))
    states[key] = {
      state: "KNOWN",
      origin: "SOURCE",
      protected: true,
      changed_revision: 1,
      evidence_ref: "source/retained-room-evidence",
    };
  const base = () =>
    makeReadTools(account, f.read).get_trip_item_edit_base({
      trip_id: trip,
      item_id: p.command.target.id,
    });
  const proof = (operationId: string) => ({
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: f.graph().trip_stay_details[0] ?? null,
          stayRooms: f.graph().trip_stay_rooms,
          receipt: JSON.parse(f.receipts.get(operationId)!.receiptText),
        },
      },
    ],
  });
  return { ...f, rooms, base, proof };
}

it.each(["details", "capacity"])(
  "S2 sparse %s preserves source room facts and recovers one original Receipt",
  async (kind) => {
    const f = await sparseStayFixture(),
      base = await f.base(),
      before = structuredClone(f.graph()),
      approved = new Set<string>();
    const change =
      kind === "details"
        ? { details: { property_name: "Updated source lodge" } }
        : {
            roomChanges: [
              {
                operation: "PATCH",
                room_id: f.rooms[0].room_id,
                changes: { capacity: 4 },
              },
            ],
          };
    const p = prepareSparseStayUpdate({ request_id: randomUUID(), base, change });
    const tools = createMutationTools({
      ...context(f.backend, async (q) => approved.has(q.digest)),
      read: f.read,
      sparseStaySupported: true,
    });
    const preview = await tools.execute(p, "PREVIEW");
    expect(preview.outcome).toBe("PREVIEW");
    expect(f.graph()).toEqual(before);
    expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
      "NEEDS_CONFIRMATION",
    );
    approved.add(preview.preview_digest);
    f.lose();
    expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
      "UNKNOWN",
    );
    // Receipt-first recovery works even after capability shutdown and the live revision advances.
    const recovered = await createMutationTools({
      ...context(f.backend),
      read: f.read,
    }).execute(p, "APPLY", preview.preview_digest);
    expect(recovered).toMatchObject({
      outcome: "APPLIED",
      current_revision: 2,
      operation_id: p.command.operationId,
    });
    expect(f.posts()).toBe(2);
    expect(
      await verifyGoldenReadback(f.proof(p.command.operationId), p, account),
    ).toHaveProperty("status", "SERVER_VERIFIED");
    const wrong = structuredClone(f.proof(p.command.operationId));
    if (kind === "details") wrong.rows[0].evidence.stay!.property_name = "Wrong";
    else
      wrong.rows[0].evidence.stayRooms.find(
        (r) => r.room_id === f.rooms[0].room_id,
      )!.capacity = 9;
    await expect(verifyGoldenReadback(wrong, p, account)).rejects.toThrow(
      "INDEPENDENT_EXPECTED_FIELD_MISMATCH",
    );
    const expectedRooms =
      kind === "details"
        ? before.trip_stay_rooms
        : before.trip_stay_rooms.map((r) =>
            r.room_id === f.rooms[0].room_id ? { ...r, capacity: 4 } : r,
          );
    const indexed = (rows: CoreGraph["trip_stay_rooms"]) =>
      Object.fromEntries(rows.map((r) => [String(r.room_id), r]));
    expect(indexed(f.graph().trip_stay_rooms)).toEqual(indexed(expectedRooms));
    expect(f.graph().trip_stay_details).toEqual(
      kind === "capacity"
        ? before.trip_stay_details
        : before.trip_stay_details.map((r) => ({
            ...r,
            property_name: "Updated source lodge",
          })),
    );
    const changed =
      kind === "details"
        ? "trip_stay_details.property_name"
        : `trip_stay_rooms.${f.rooms[0].room_id}.capacity`;
    for (const [key, value] of Object.entries(
      before.itinerary_events[0].field_state as Record<string, unknown>,
    ))
      if (key !== changed)
        expect(
          (f.graph().itinerary_events[0].field_state as Record<string, unknown>)[key],
        ).toEqual(value);
    for (const [key, value] of Object.entries(before.itinerary_events[0]))
      if (!["field_state", "semantic_revision", "updated_at"].includes(key))
        expect(f.graph().itinerary_events[0][key]).toEqual(value);
    const current = await f.base();
    expect(current.item.itemRevision).toBe(2);
    expect(
      indexed(
        (current.record.body as Record<string, unknown>)
          .trip_stay_rooms as CoreGraph["trip_stay_rooms"],
      ),
    ).toEqual(indexed(f.graph().trip_stay_rooms));
  },
);

it("S2 defaults closed, retains the legacy room guard, and does not advertise a new tool shape", async () => {
  const f = await sparseStayFixture(),
    base = await f.base();
  const p = prepareSparseStayUpdate({
    request_id: randomUUID(),
    base,
    change: { details: { property_name: "New" } },
  });
  const tools = createMutationTools({ ...context(f.backend), read: f.read });
  expect(await tools.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "SPARSE_STAY_BACKEND_NOT_QUALIFIED",
  });
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({
    outcome: "REJECTED",
    error_code: "SPARSE_STAY_BACKEND_NOT_QUALIFIED",
  });
  expect(() =>
    prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: base.item.itemId,
      expected_revision: 1,
      base_item: base.item,
      change: { kind: "STAY", details: { property_name: "New" } },
    }),
  ).toThrow("STAY_ROOM_PROVENANCE_PRESERVATION_REQUIRES_OWNING_PORT");
  expect(f.posts()).toBe(1);
  expect(
    fieldUpdateInput.safeParse({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: base.item.itemId,
      expected_revision: 1,
      base_item: base.item,
      change: { kind: "STAY_SPARSE", roomChanges: [] },
    }).success,
  ).toBe(false);
});

it("S2 explicit null, no-change, ADD and REMOVE retain stable IDs and independent field state", async () => {
  const f = await sparseStayFixture(),
    tools = createMutationTools({
      ...context(f.backend),
      read: f.read,
      sparseStaySupported: true,
    });
  async function edit(change: unknown) {
    const p = prepareSparseStayUpdate({
      request_id: randomUUID(),
      base: await f.base(),
      change,
    });
    const preview = await tools.execute(p, "PREVIEW");
    expect(preview.outcome).toBe("PREVIEW");
    const result = await tools.execute(p, "APPLY", preview.preview_digest);
    expect(
      await verifyGoldenReadback(f.proof(p.command.operationId), p, account),
    ).toHaveProperty(
      "status",
      result.outcome === "NO_CHANGE"
        ? "NO_CHANGE_RECEIPT_AND_CURRENT_FIELDS_VERIFIED"
        : "SERVER_VERIFIED",
    );
    for (const corruption of ["empty", "foreign_parent", "omitted", "duplicate"]) {
      const wrong = structuredClone(f.proof(p.command.operationId));
      if (corruption === "empty") wrong.rows[0].evidence.stayRooms = [];
      if (corruption === "foreign_parent")
        for (const r of wrong.rows[0].evidence.stayRooms) r.event_id = randomUUID();
      if (corruption === "omitted") wrong.rows[0].evidence.stayRooms.shift();
      if (corruption === "duplicate")
        wrong.rows[0].evidence.stayRooms.push({ ...wrong.rows[0].evidence.stayRooms[0] });
      await expect(verifyGoldenReadback(wrong, p, account)).rejects.toThrow();
    }
    return result;
  }
  const before = structuredClone(f.graph());
  expect(
    (
      await edit({
        roomChanges: [
          { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 3 } },
        ],
      })
    ).outcome,
  ).toBe("NO_CHANGE");
  expect(f.graph()).toEqual(before);
  expect(
    (
      await edit({
        roomChanges: [
          {
            operation: "PATCH",
            room_id: f.rooms[0].room_id,
            changes: { capacity: null },
          },
        ],
      })
    ).outcome,
  ).toBe("APPLIED");
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === f.rooms[0].room_id)?.capacity,
  ).toBeNull();
  expect(
    (f.graph().itinerary_events[0].field_state as Record<string, unknown>)[
      `trip_stay_rooms.${f.rooms[0].room_id}.capacity`
    ],
  ).toMatchObject({ state: "CLEARED", origin: "MANUAL" });
  const added = { room_id: randomUUID(), category: null, quantity: 1, capacity: null };
  expect(
    (
      await edit({
        roomChanges: [
          { operation: "ADD", room: added },
          { operation: "REMOVE", room_id: f.rooms[1].room_id },
        ],
      })
    ).outcome,
  ).toBe("APPLIED");
  expect(
    f
      .graph()
      .trip_stay_rooms.map((r) => r.room_id)
      .sort(),
  ).toEqual([f.rooms[0].room_id, added.room_id].sort());
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === added.room_id),
  ).toMatchObject(added);
  expect(
    f.graph().trip_stay_rooms.find((r) => r.room_id === f.rooms[0].room_id)?.quantity,
  ).toBe(1);
});

it.each(["body_scope", "revision", "missing_room", "duplicate_room", "whole_rooms"])(
  "S2 rejects %s without dispatch",
  async (kind) => {
    const f = await sparseStayFixture(),
      base = structuredClone(await f.base());
    let change: unknown = {
      roomChanges: [
        { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 4 } },
      ],
    };
    if (kind === "body_scope")
      (base.record.body as Record<string, unknown>).trip_id = randomUUID();
    if (kind === "revision") base.record.revision++;
    if (kind === "missing_room")
      change = { roomChanges: [{ operation: "REMOVE", room_id: randomUUID() }] };
    if (kind === "duplicate_room")
      change = {
        roomChanges: [
          { operation: "REMOVE", room_id: f.rooms[0].room_id },
          { operation: "PATCH", room_id: f.rooms[0].room_id, changes: { capacity: 4 } },
        ],
      };
    if (kind === "whole_rooms") change = { details: { property_name: "New" }, rooms: [] };
    expect(() =>
      prepareSparseStayUpdate({ request_id: randomUUID(), base, change }),
    ).toThrow();
    expect(f.posts()).toBe(1);
  },
);

it.each([
  "base_drift",
  "hidden_state_drift",
  "payload_tamper",
  "missing_marker",
  "unavailable",
  "wrong_actor",
  "room_ids_tamper",
])("S2 live guard rejects %s before POST", async (kind) => {
  const f = await sparseStayFixture(),
    base = await f.base();
  const p = prepareSparseStayUpdate({
    request_id: randomUUID(),
    base,
    change: { details: { property_name: "New" } },
  });
  if (p.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  if (kind === "base_drift") f.graph().trip_stay_rooms[1].capacity = 7;
  if (kind === "hidden_state_drift")
    (f.graph().itinerary_events[0].field_state as Record<string, { protected: boolean }>)[
      `trip_stay_rooms.${f.rooms[1].room_id}.category`
    ].protected = false;
  if (kind === "payload_tamper")
    (p.command.payload as { details: { property_name: string } }).details.property_name =
      "Forged";
  if (kind === "missing_marker") delete p.sparseStay;
  if (kind === "room_ids_tamper") p.sparseStay!.roomIds = [];
  const tools = createMutationTools({
    ...context(f.backend),
    ...(kind === "wrong_actor" ? { accountId: randomUUID() } : {}),
    read:
      kind === "unavailable" ? async () => new Response(null, { status: 503 }) : f.read,
    sparseStaySupported: true,
  });
  expect((await tools.execute(p, "PREVIEW")).outcome).toBe("REJECTED");
  expect(
    (await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest))
      .outcome,
  ).toBe("REJECTED");
  expect(f.posts()).toBe(1);
});

function fixture() {
  let graph: CoreGraph = emptyCoreGraph();
  const receipts = new Map<string, { domainReceiptId: string; receiptText: string }>();
  let posts = 0,
    lose = false,
    unavailable = false;
  const connection: CoreHttpConnection = {
    read: {
      collection: async () =>
        buildCoreActorCollection(
          graph,
          actor,
          {
            epoch: "00000000-0000-4000-8000-000000000010",
            revision: Math.max(
              1,
              ...graph.itinerary_events.map((r) => Number(r.semantic_revision)),
            ),
            accessRevision: 1,
            generatedAt: "2026-11-01T00:00:00Z",
          },
          [],
          async (bytes) => sha(bytes),
        ),
      item: async (_a, _t, id) => projectCoreItem(graph, actor, id),
    },
    hash: async (bytes) => sha(bytes),
    readOperation: async (a, t, id) => {
      const r = receipts.get(id);
      return a === account && t === trip && r
        ? {
            projection: "FULL",
            domainReceiptId: r.domainReceiptId,
            receipt: JSON.parse(r.receiptText),
          }
        : null;
    },
    commands: {
      async withLockedCommand(scope, work) {
        return work({
          actor: {
            ...actor,
            accountId: scope.actorAccountId,
            active: scope.actorAccountId === account,
          },
          readReceipt: async () => receipts.get(scope.operationId) ?? null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => [
            "CREATE_ITEM",
            "SET_ITEM_TEXT",
            "SET_ITEM_SCHEDULE",
            "CREATE_SPARSE_FLIGHT",
            "SET_AUTHORED_FLIGHT_DETAILS",
            "SET_ITEM_PLACE",
            "SET_ITEM_PARTICIPATION",
            "SET_STAY_DETAILS",
            "SET_RENTAL_DETAILS",
            "SET_ACTIVITY_DETAILS",
            "SET_TRANSPORT_DETAILS",
          ],
          readLockedGraph: async () => graph,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          commit: async (mutation, receipt: CoreReceipt) => {
            if (mutation) graph = mutation.graph;
            const domainReceiptId = randomUUID();
            receipts.set(scope.operationId, {
              domainReceiptId,
              receiptText: JSON.stringify(receipt),
            });
            return domainReceiptId;
          },
        });
      },
    },
  };
  const backend: BackendMutation = async (q) => {
    if (q.method === "POST") posts++;
    if (unavailable) return new Response(null, { status: 503 });
    const r = await coreHttpBoundary(
      new Request("http://backend" + q.path, {
        method: q.method,
        headers: q.headers,
        body: q.body ? JSON.stringify(q.body) : undefined,
      }),
      account,
      async (a, t) => a === account && t === trip,
      connection,
    );
    if (lose && q.method === "POST") {
      lose = false;
      throw Error("SIMULATED_RESPONSE_LOSS");
    }
    return r;
  };
  return {
    backend,
    read: (path: string, signal: AbortSignal) => backend({ method: "GET", path }, signal),
    receipts,
    graph: () => graph,
    posts: () => posts,
    lose: () => (lose = true),
    unavailable: () => (unavailable = true),
  };
}
const create = (request = randomUUID()) => ({
  request_id: request,
  trip_id: trip,
  item: {
    family: "P3",
    title: "Synthetic Nelson Stay",
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
    property_name: "QA Lodge",
  },
});
const context = (
  backend: BackendMutation,
  confirm: ConfirmChanges = async () => true,
) => ({
  accountId: account,
  clientId: "qa-client",
  resource: "https://mcp.example.invalid/mcp",
  backend,
  confirm,
});
it("preview never writes, missing trusted confirmation and model confirmed flag cannot submit", async () => {
  const f = fixture(),
    tools = createMutationTools({ ...context(f.backend), confirm: undefined });
  const p = tools.prepareCreate(create()),
    preview = await tools.execute(p, "PREVIEW");
  expect(preview.outcome).toBe("PREVIEW");
  expect(f.posts()).toBe(0);
  expect((await tools.execute(p, "APPLY", preview.preview_digest)).outcome).toBe(
    "NEEDS_CONFIRMATION",
  );
  expect(() => tools.prepareCreate({ ...create(), confirmed: true })).toThrow();
  expect(f.posts()).toBe(0);
  expect((await tools.execute(p, "APPLY", "a".repeat(64))).outcome).toBe("REJECTED");
});
it("owning P3 create/edit receipts, stable replay, lost response recovery and CAS conflict", async () => {
  const f = fixture(),
    confirm = vi.fn(async () => true),
    tools = createMutationTools(context(f.backend, confirm)),
    q = create();
  const p = tools.prepareCreate(q),
    identity = mutationIdentity(account, p);
  const result = await tools.execute(p, "APPLY", identity.preview_digest);
  expect(result).toMatchObject({
    outcome: "APPLIED",
    current_revision: 1,
    item_id: identity.item_id,
  });
  expect(f.graph().itinerary_events).toHaveLength(1);
  expect(prepareCreate(account, q)).toEqual(p);
  expect((await tools.execute(p, "APPLY", identity.preview_digest)).outcome).toBe(
    "APPLIED",
  );
  expect(f.posts()).toBe(1);
  const edit = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: identity.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", title: "Nelson QA edited" },
  });
  f.lose();
  expect(
    (await tools.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest))
      .outcome,
  ).toBe("UNKNOWN");
  expect(
    await tools.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(f.posts()).toBe(2);
  const stale = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: identity.item_id,
    expected_revision: 1,
    change: { kind: "TEXT", title: "must not overwrite" },
  });
  expect(
    (await tools.execute(stale, "APPLY", mutationIdentity(account, stale).preview_digest))
      .outcome,
  ).toBe("CONFLICT");
  expect(f.graph().itinerary_events[0].title).toBe("Nelson QA edited");
  expect(await tools.get_operation_status(result.query)).toMatchObject({
    outcome: "APPLIED",
    current_revision: 1,
  });
});
it("allows a bounded slow receipt read before a single controlled POST", async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    const tools = createMutationTools(
      context(async (q, signal) => {
        if (q.method === "GET")
          await new Promise((resolve) => setTimeout(resolve, 20000));
        return f.backend(q, signal);
      }),
    );
    const p = tools.prepareCreate(create());
    const pending = tools.execute(
      p,
      "APPLY",
      mutationIdentity(account, p).preview_digest,
    );
    await vi.advanceTimersByTimeAsync(20001);
    expect((await pending).outcome).toBe("APPLIED");
    expect(f.posts()).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});
it("rejects receipt identity drift and preserves UNKNOWN while owning recovery is unavailable", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend)),
    p = tools.prepareCreate(create());
  f.unavailable();
  expect(
    (await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest))
      .outcome,
  ).toBe("UNKNOWN");
  expect(f.posts()).toBe(0);
  const drift = createMutationTools(
    context(async () =>
      Response.json({
        projection: "FULL",
        domainReceiptId: randomUUID(),
        receipt: { actorAccountId: randomUUID() },
      }),
    ),
  );
  expect(
    await drift.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "UNKNOWN", error_code: "RECEIPT_UNVERIFIED" });
});
it("three-day Nelson batch preview, exact confirmation, partial response loss and resume reuse the successful prefix", async () => {
  const f = fixture(),
    ctx = context(f.backend),
    tools = createMutationTools(ctx);
  const reads = {
    list_trip_items: async () => ({ items: [], next_cursor: null }),
  } as unknown as ReturnType<typeof createReadTools>;
  const batch = createBatchTools(ctx, tools, reads),
    changes = [10, 11, 12].map((day) => ({
      kind: "CREATE",
      request_id: randomUUID(),
      item: {
        family: "P3",
        title: `QA Nelson day ${day}`,
        dates: { start_date: `2026-12-${day}`, end_date: `2026-12-${day + 1}` },
      },
    }));
  const plan = { trip_id: trip, changes },
    preview = await batch.preview_trip_changes(plan);
  expect(preview.operations).toHaveLength(3);
  expect(f.posts()).toBe(0);
  f.lose();
  const partial = await batch.apply_trip_changes({
    ...plan,
    preview_digest: preview.preview_digest,
  });
  expect(partial.outcome).toBe("PARTIAL");
  expect(f.posts()).toBe(1);
  expect(partial.operations[1]).toHaveProperty("error_code", "NOT_SUBMITTED_AFTER_STOP");
  const done = await batch.apply_trip_changes({
    ...plan,
    preview_digest: preview.preview_digest,
  });
  expect(done.outcome).toBe("APPLIED");
  expect(f.posts()).toBe(3);
  expect(f.graph().itinerary_events).toHaveLength(3);
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("APPLIED");
  expect(f.posts()).toBe(3);
  const changed = {
    ...plan,
    changes: [
      { ...changes[0], item: { ...changes[0].item, title: "different" } },
      ...changes.slice(1),
    ],
  };
  expect(
    (
      await batch.apply_trip_changes({
        ...changed,
        preview_digest: preview.preview_digest,
      })
    ).outcome,
  ).toBe("REJECTED");
  expect(f.posts()).toBe(3);
});
it("Trip create uses structured destinations with stable independent IDs", () => {
  const q = {
    request_id: randomUUID(),
    name: "Synthetic Nelson QA",
    destinations: ["Nelson", "Abel Tasman"],
    dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
  };
  expect(prepareTrip(account, q)).toEqual(prepareTrip(account, q));
  const p = prepareTrip(account, q);
  expect(p.command).toHaveProperty("formatVersion", 2);
  expect(p.command).toHaveProperty("destination", null);
});

it("recovers an accepted UPDATE before stale-revision checks when resuming its batch", async () => {
  const f = fixture(),
    ctx = context(f.backend),
    tools = createMutationTools(ctx);
  const createP = tools.prepareCreate(create()),
    created = await tools.execute(
      createP,
      "APPLY",
      mutationIdentity(account, createP).preview_digest,
    );
  const reads = {
    list_trip_items: async () => ({ items: [], next_cursor: null }),
    get_trip_item: async () => ({
      item: { itemRevision: f.graph().itinerary_events[0].semantic_revision },
    }),
  } as unknown as ReturnType<typeof createReadTools>;
  const batch = createBatchTools(ctx, tools, reads);
  const plan = {
    trip_id: trip,
    changes: [
      {
        kind: "UPDATE",
        request_id: randomUUID(),
        item_id: created.item_id,
        expected_revision: 1,
        change: { kind: "TEXT", title: "QA updated", notes: "All notes must be visible" },
      },
      { kind: "CREATE", ...create(), trip_id: undefined },
    ],
  };
  delete (plan.changes[1] as { trip_id?: string }).trip_id;
  const preview = await batch.preview_trip_changes(plan);
  f.lose();
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("PARTIAL");
  expect(
    (await batch.apply_trip_changes({ ...plan, preview_digest: preview.preview_digest }))
      .outcome,
  ).toBe("APPLIED");
  expect(f.graph().itinerary_events).toHaveLength(2);
  expect(f.posts()).toBe(3);
});
it("trusted approval summary contains every written note, place, property and date", () => {
  const q = {
    ...create(),
    item: {
      ...create().item,
      notes: "Private note",
      place: "Authored only place",
      property_name: "QA Lodge",
    },
  };
  const prepared = prepareCreate(account, q);
  for (const value of [
    q.item.notes,
    q.item.place,
    q.item.property_name,
    q.item.dates.start_date,
    q.item.dates.end_date,
  ])
    expect(prepared.summary).toContain(value);
});
it("date-only edit cannot erase an existing clock, zone or qualified instant", async () => {
  const f = fixture();
  let readCount = 0;
  const ctx = {
    ...context(f.backend),
    read: async () => {
      readCount++;
      return Response.json({
        itemId: itemId,
        tripId: trip,
        itemRevision: 1,
        family: "P3",
        title: "Timed stay",
        status: "planned",
        hidden: false,
        visibility: "PRIVATE",
        localState: "ACCEPTED",
        schedule: {
          shape: "SPAN",
          start: {
            comparable: true,
            localDate: "2026-12-10",
            localTime: "18:00:00",
            zoneId: "Pacific/Auckland",
            instant: "2026-12-10T05:00:00Z",
          },
          end: { comparable: false, localDate: "2026-12-12" },
        },
        details: { rooms: [], nights: 2 },
      });
    },
  };
  const itemId = randomUUID(),
    tools = createMutationTools(ctx);
  const p = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: itemId,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect(await tools.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER",
  });
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({
    outcome: "REJECTED",
    error_code: "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER",
  });
  expect(readCount).toBe(2);
  expect(f.posts()).toBe(0);
});

it("edits canonical date-only P3 boundaries while preserving receipt replay", async () => {
  const f = fixture();
  const tools = createMutationTools({
    ...context(f.backend),
    read: async () =>
      Response.json(
        projectCoreItem(f.graph(), actor, f.graph().itinerary_events[0].id as string),
      ),
  });
  const createP = tools.prepareCreate(create());
  const created = await tools.execute(
    createP,
    "APPLY",
    mutationIdentity(account, createP).preview_digest,
  );
  const p = tools.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect((await tools.execute(p, "PREVIEW")).outcome).toBe("PREVIEW");
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(f.graph().itinerary_events[0].start_local_date).toBe("2026-12-11");
});

it("standard MCP HTTP client discovers controlled tools and applies only after trusted host confirmation", async () => {
  const f = fixture();
  let handle: ReturnType<typeof createMcpHandler>;
  const server = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("PORT");
  const resource = `http://127.0.0.1:${addr.port}/mcp`;
  const approved = new Set<string>();
  handle = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId: account,
      clientId: "qa",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: async () => Response.json({}),
      backend: f.backend,
    }),
    confirm: async (q) => approved.has(q.digest),
  });
  const client = new Client({ name: "controlled-write-qa", version: "1" });
  const content = (r: unknown) => {
    const x = r as {
      structuredContent?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
    return x.structuredContent ?? x.result ?? {};
  };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const listed = await client.listTools();
    expect(
      listed.tools.find((t) => t.name === "create_trip_item")?.annotations?.readOnlyHint,
    ).toBe(false);
    const q = create();
    const preview = content(
      await client.callTool({ name: "create_trip_item", arguments: q }),
    );
    expect(preview.outcome).toBe("PREVIEW");
    expect(f.posts()).toBe(0);
    const request = { ...q, mode: "APPLY", preview_digest: preview.preview_digest };
    expect(
      content(await client.callTool({ name: "create_trip_item", arguments: request }))
        .outcome,
    ).toBe("NEEDS_CONFIRMATION");
    expect(f.posts()).toBe(0);
    approved.add(preview.preview_digest as string);
    const saved = content(
      await client.callTool({ name: "create_trip_item", arguments: request }),
    );
    expect(saved.outcome).toBe("APPLIED");
    expect(f.posts()).toBe(1);
    expect(
      content(
        await client.callTool({
          name: "get_operation_status",
          arguments: saved.query as Record<string, unknown>,
        }),
      ).outcome,
    ).toBe("APPLIED");
  } finally {
    await client.close().catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it.each(["create_trip_item", "apply_trip_changes"])(
  "preserves only original recovery identity when authorization expires after Core commits (%s)",
  async (name) => {
    const f = fixture(),
      q = create();
    const identity = mutationIdentity(account, prepareCreate(account, q));
    const expiresAt = Date.now() + 60000;
    let resource = "";
    const backend: BackendMutation = async (request, signal) => {
      const response = await f.backend(request, signal);
      if (request.method === "POST") {
        expect(f.receipts.size).toBe(1);
        vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
      }
      return response;
    };
    const server = loopbackServer((request) =>
      createMcpHandler({
        resource,
        authorize: async () => ({
          accountId: account,
          clientId: "qa",
          resource,
          scopes: ["otr.trips.read", "otr.trips.write"],
          expiresAt,
          read: async () =>
            Response.json(
              await buildCoreActorCollection(
                f.graph(),
                actor,
                {
                  epoch: trip,
                  revision: 1,
                  accessRevision: 1,
                  generatedAt: new Date().toISOString(),
                },
                [],
                async (bytes) => sha(bytes),
              ),
            ),
          backend,
        }),
        confirm: async () => true,
      })(request),
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw Error("PORT");
    resource = `http://127.0.0.1:${address.port}/mcp`;
    const client = new Client({ name: "post-commit-expiry", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
      const plan = {
        trip_id: trip,
        changes: [{ kind: "CREATE", request_id: q.request_id, item: q.item }],
      };
      const preview =
        name === "apply_trip_changes"
          ? await client.callTool({
              name: "preview_trip_changes",
              arguments: plan,
            })
          : null;
      const result = await client.callTool({
        name,
        arguments: preview
          ? {
              ...plan,
              preview_digest: batchOutput.parse(preview.structuredContent).preview_digest,
            }
          : { ...q, mode: "APPLY", preview_digest: identity.preview_digest },
      });
      expect(f.posts()).toBe(1);
      expect(f.graph().itinerary_events).toHaveLength(1);
      expect(JSON.parse([...f.receipts.values()][0].receiptText).outcome).toBe("APPLIED");
      const recovery =
        name === "apply_trip_changes"
          ? batchOutput.parse(result.structuredContent).operations[0]
          : mutationOutput.parse(result.structuredContent);
      expect(recovery).toMatchObject({
        outcome: "UNKNOWN",
        operation_id: q.request_id,
        query: identity.query,
        current_revision: null,
      });
      expect(JSON.stringify(result)).not.toContain("Synthetic Nelson Stay");
      expect(JSON.stringify(result)).not.toContain("committedAt");
      if (name === "apply_trip_changes")
        expect(result.structuredContent).toMatchObject({
          outcome: "UNKNOWN",
          review: [],
          operations: [expect.objectContaining({ summary: "" })],
        });
    } finally {
      vi.restoreAllMocks();
      await client.close().catch(() => {});
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it("independent DB verification rejects wrong business fields and separates historical receipt evidence", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend)),
    p = tools.prepareCreate({
      ...create(),
      item: { ...create().item, title: "Stay 2026-12-10T12:00:00Z" },
    });
  const result = await tools.execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  const record = f.receipts.get(result.operation_id)!;
  const row = structuredClone(f.graph().itinerary_events[0]);
  const raw = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: [row],
          stay: f.graph().trip_stay_details[0],
          receipt: JSON.parse(record.receiptText),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(raw, p, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  row.title = "Changed 2026-12-10T12:00:00Z";
  await expect(verifyGoldenReadback(raw, p, account)).rejects.toThrow(
    "INDEPENDENT_BUSINESS_FIELD_MISMATCH:title",
  );
  row.semantic_revision = 2;
  expect(await verifyGoldenReadback(raw, p, account)).toHaveProperty(
    "status",
    "HISTORICAL_RECEIPT_VERIFIED_CURRENT_ADVANCED",
  );
});

it("returns a partial receipt before the HTTP deadline after a slow accepted prefix", async () => {
  const f = fixture(),
    resource = "https://mcp.example.invalid/mcp";
  let lookup = 0;
  const handle = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId: account,
      clientId: "qa",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 120000,
      read: async () =>
        Response.json(
          await buildCoreActorCollection(
            f.graph(),
            actor,
            {
              epoch: trip,
              revision: 1,
              accessRevision: 1,
              generatedAt: new Date().toISOString(),
            },
            [],
            async (bytes) => sha(bytes),
          ),
        ),
      backend: async (q, signal) => {
        if (q.method === "GET") {
          lookup++;
          if (lookup === 1) await new Promise((resolve) => setTimeout(resolve, 20000));
          else return new Promise<Response>(() => {});
        }
        return f.backend(q, signal);
      },
    }),
    confirm: async () => true,
  });
  const client = new Client({ name: "bounded-batch", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      fetch: (input, init) => handle(new Request(input, init)),
    }),
  );
  const changes = [10, 11, 12].map((day) => ({
    kind: "CREATE",
    request_id: randomUUID(),
    item: {
      family: "P3",
      title: "QA " + day,
      dates: { start_date: `2026-12-${day}`, end_date: `2026-12-${day + 1}` },
    },
  }));
  const plan = { trip_id: trip, changes };
  const preview = await client.callTool({
    name: "preview_trip_changes",
    arguments: plan,
  });
  const p = (preview.structuredContent ??
    (preview as { result?: Record<string, unknown> }).result) as Record<string, unknown>;
  vi.useFakeTimers();
  let response: unknown,
    failed = false;
  try {
    const pending = client
      .callTool({
        name: "apply_trip_changes",
        arguments: { ...plan, preview_digest: p.preview_digest },
      })
      .then((r) => {
        response = r;
      })
      .catch(() => {
        failed = true;
      });
    await vi.advanceTimersByTimeAsync(50001);
    expect(failed).toBe(false);
    expect(response).toBeDefined();
    const r = response as {
      structuredContent?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
    const output = (r.structuredContent ?? r.result)!;
    expect(output.outcome).toBe("PARTIAL");
    expect((output.operations as { outcome: string }[]).map((o) => o.outcome)).toEqual([
      "APPLIED",
      "UNKNOWN",
      "PREVIEW",
    ]);
    expect(f.posts()).toBe(1);
    await pending;
  } finally {
    await vi.advanceTimersByTimeAsync(20000);
    await client.close();
    vi.useRealTimers();
  }
});

it("recovers structured Trip receipts through the owning version2 HTTP boundary", async () => {
  const p = prepareTrip(account, {
    request_id: randomUUID(),
    name: "Synthetic Nelson QA",
    destinations: ["Nelson", "Abel Tasman"],
  });
  if (p.kind !== "TRIP") throw Error("TRIP_EXPECTED");
  const result = {
    ...p.command,
    actorAccountId: account,
    ownerPersonId: person,
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
    metadataRevision: 0 as const,
  };
  let posts = 0;
  const backend: BackendMutation = async (q) => {
    if (q.method === "POST") posts++;
    return tripCreateBoundary(
      new Request("https://backend" + q.path, {
        method: q.method,
        headers: q.headers,
        ...(q.body ? { body: JSON.stringify(q.body) } : {}),
      }),
      account,
      {
        create: async () => result,
        receipt: async () => result,
      },
    );
  };
  const tools = createMutationTools(context(backend));
  expect(
    await tools.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", trip_id: p.command.tripId });
  expect(
    await tools.get_operation_status({
      target: "TRIP",
      trip_id: p.command.tripId,
      operation_id: p.command.operationId,
    }),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 1 });
  expect(posts).toBe(0);
});

it("refuses date edits when the owning read returns a different Item identity", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const createP = tools.prepareCreate(create());
  const created = await tools.execute(
    createP,
    "APPLY",
    mutationIdentity(account, createP).preview_digest,
  );
  const raw = projectCoreItem(f.graph(), actor, created.item_id!)!;
  const guarded = createMutationTools({
    ...context(f.backend),
    read: async () => Response.json({ ...raw, itemId: randomUUID() }),
  });
  const p = guarded.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-11", end_date: "2026-12-13" },
    },
  });
  expect(await guarded.execute(p, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "CURRENT_ITEM_SCOPE_MISMATCH",
  });
  expect(
    await guarded.execute(p, "APPLY", mutationIdentity(account, p).preview_digest),
  ).toMatchObject({ outcome: "REJECTED", error_code: "CURRENT_ITEM_SCOPE_MISMATCH" });
  expect(f.posts()).toBe(1);
});

it.each(["P1", "P3", "P4"])(
  "stores %s civil clocks and typed fields through existing Core, never a fake instant/Booking",
  async (family) => {
    const f = fixture(),
      tools = createMutationTools(context(f.backend));
    const prepared = tools.prepareCreate({
      request_id: randomUUID(),
      trip_id: trip,
      item: {
        family,
        title: "Synthetic timed QA",
        dates: {
          start_date: "2026-12-10",
          start_time: "11:00",
          start_zone: "Pacific/Auckland",
          end_date: "2026-12-12",
          end_time: "10:00",
          end_zone: "Pacific/Auckland",
        },
        place: "Synthetic pickup",
        place_address: "Synthetic address",
        ...(family === "P3"
          ? {
              property_name: "QA Lodge",
              stay: { permitted_checkin_from: "14:00", permitted_checkout_by: "10:00" },
            }
          : {}),
        ...(family === "P4"
          ? {
              return_place: "Synthetic return",
              rental: {
                supplier: "QA Rental",
                reserved_category: "Reserved QA class",
                or_similar: true,
              },
            }
          : {}),
      },
    });
    const result = await tools.execute(
      prepared,
      "APPLY",
      mutationIdentity(account, prepared).preview_digest,
    );
    expect(result).toMatchObject({ outcome: "APPLIED", current_revision: 1 });
    const row = itemSchema.parse(projectCoreItem(f.graph(), actor, result.item_id!));
    expect(row.schedule.start).toMatchObject({
      localDate: "2026-12-10",
      localTime: "11:00:00",
      zoneId: "Pacific/Auckland",
      quality: "ESTIMATED",
    });
    expect(row.schedule.start).not.toHaveProperty("instant");
    expect(f.graph().itinerary_reservations).toHaveLength(0);
    const proof = {
      rows: [
        {
          evidence: {
            itemCount: 1,
            items: f.graph().itinerary_events,
            stay: f.graph().trip_stay_details[0] ?? null,
            rental: f.graph().trip_rental_details[0] ?? null,
            rentalPlaces: f.graph().trip_rental_places,
            receipt: JSON.parse(f.receipts.get(result.operation_id)!.receiptText),
          },
        },
      ],
    };
    expect(await verifyGoldenReadback(proof, prepared, account)).toHaveProperty(
      "status",
      "SERVER_VERIFIED",
    );
    if (family === "P3")
      expect(row.details).toMatchObject({
        permittedCheckinFrom: "14:00",
        permittedCheckoutBy: "10:00",
      });
    if (family === "P4")
      expect(row.details).toMatchObject({
        supplier: "QA Rental",
        reservedCategory: "Reserved QA class",
        orSimilar: true,
        returnPlace: { authoredLabel: "Synthetic return" },
      });
  },
);

it("creates a typed water taxi with independent check-in and unknown arrival preserved", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const prepared = tools.prepareCreate({
    request_id: randomUUID(),
    trip_id: trip,
    item: {
      family: "P5",
      title: "Synthetic QA water taxi",
      dates: { start_date: "2026-12-10", start_time: "09:00" },
      transport: {
        subtype: "WATER_TAXI",
        origin: "Synthetic village",
        destination: "Synthetic jetty",
        checkin: { date: "2026-12-10", time: "08:45" },
      },
    },
  });
  const result = await tools.execute(
    prepared,
    "APPLY",
    mutationIdentity(account, prepared).preview_digest,
  );
  expect(result.outcome).toBe("APPLIED");
  const row = itemSchema.parse(projectCoreItem(f.graph(), actor, result.item_id!));
  expect(row.schedule.origin?.time).toMatchObject({
    localTime: "09:00:00",
    quality: "ESTIMATED",
  });
  expect(row.schedule.destination?.time.localTime).toBeUndefined();
  expect(row.details).toMatchObject({
    service: { transportSubtype: "WATER_TAXI", operatorLiteral: "" },
    operationalFacts: [{ role: "CHECKIN", time: { localTime: "08:45:00" } }],
  });
  expect(f.graph().itinerary_reservations).toHaveLength(0);
  const proof = {
    rows: [
      {
        evidence: {
          itemCount: 1,
          items: f.graph().itinerary_events,
          stay: null,
          transportEndpoints: structuredClone(f.graph().itinerary_transport_endpoints),
          transportServices: f.graph().itinerary_transport_services,
          operationalFacts: structuredClone(f.graph().trip_transport_operational_facts),
          receipt: JSON.parse(f.receipts.get(result.operation_id)!.receiptText),
        },
      },
    ],
  };
  expect(await verifyGoldenReadback(proof, prepared, account)).toHaveProperty(
    "status",
    "SERVER_VERIFIED",
  );
  proof.rows[0].evidence.transportEndpoints.find((p) => p.role === "ORIGIN")!.local_time =
    "09:01:00";
  await expect(verifyGoldenReadback(proof, prepared, account)).rejects.toThrow(
    "INDEPENDENT_EXPECTED_FIELD_MISMATCH:local_time",
  );
  proof.rows[0].evidence.transportEndpoints.find((p) => p.role === "ORIGIN")!.local_time =
    "09:00:00";
  proof.rows[0].evidence.operationalFacts[0].local_time = "08:46:00";
  await expect(verifyGoldenReadback(proof, prepared, account)).rejects.toThrow(
    "INDEPENDENT_EXPECTED_FIELD_MISMATCH:local_time",
  );
});

it("edits a complete authored civil schedule with CAS and refuses date-only time/zone loss", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const p = tools.prepareCreate({
    ...create(),
    item: {
      ...create().item,
      dates: {
        start_date: "2026-12-10",
        start_time: "15:00",
        start_zone: "Pacific/Auckland",
        end_date: "2026-12-12",
      },
    },
  });
  const created = await tools.execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  const guarded = createMutationTools({
    ...context(f.backend),
    read: async () => Response.json(projectCoreItem(f.graph(), actor, created.item_id!)!),
  });
  const change = {
    kind: "SCHEDULE",
    dates: {
      start_date: "2026-12-11",
      start_time: "16:00",
      start_zone: "Pacific/Auckland",
      end_date: "2026-12-13",
    },
  };
  const edit = guarded.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 1,
    change,
  });
  expect((await guarded.execute(edit, "PREVIEW")).outcome).toBe("PREVIEW");
  expect(
    await guarded.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest),
  ).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  expect(
    itemSchema.parse(projectCoreItem(f.graph(), actor, created.item_id!)).schedule.start,
  ).toMatchObject({ localDate: "2026-12-11", localTime: "16:00:00" });
  const lossy = guarded.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: created.item_id,
    expected_revision: 2,
    change: {
      kind: "DATES",
      dates: { start_date: "2026-12-12", end_date: "2026-12-14" },
    },
  });
  expect(await guarded.execute(lossy, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER",
  });
  expect(f.posts()).toBe(2);
});

it("keeps existing accepted QA operation digests unchanged after field expansion", async () => {
  const { readFile } = await import("node:fs/promises");
  const old = JSON.parse(
    await readFile(
      new URL("../docs/mcp/acceptance/NELSON_ATTEMPT_01.json", import.meta.url),
      "utf8",
    ),
  );
  for (const prior of old.preview.operations) {
    const item = JSON.parse(prior.summary.slice(prior.summary.indexOf(": ") + 2));
    const prepared = prepareCreate(old.accountId, {
      request_id: prior.operation_id,
      trip_id: prior.trip_id,
      item,
    });
    expect(mutationIdentity(old.accountId, prepared)).toMatchObject({
      item_id: prior.item_id,
      preview_digest: prior.preview_digest,
    });
  }
});

it("rejects invalid civil clocks/zones, reversed same-zone spans and wrong-family fields before dispatch", () => {
  for (const patch of [
    { dates: { start_date: "2026-12-10", start_time: "24:00" } },
    { dates: { start_date: "2026-12-10", start_time: "09:00", start_zone: "Not/AZone" } },
    {
      dates: {
        start_date: "2026-12-10",
        start_time: "10:00",
        end_date: "2026-12-10",
        end_time: "09:00",
      },
    },
    { dates: { start_date: "2026-12-10", end_time: "09:00" } },
    { family: "P1", rental: { supplier: "QA" } },
    { family: "P5" },
    { family: "P3", return_place: "QA" },
  ])
    expect(() =>
      prepareCreate(account, { ...create(), item: { ...create().item, ...patch } }),
    ).toThrow();
});

it("retains sparse flight route/clocks via a separate current-revision owning operation", async () => {
  const f = fixture(),
    tools = createMutationTools(context(f.backend));
  const q = {
    request_id: randomUUID(),
    trip_id: trip,
    item: {
      family: "P2",
      title: "Synthetic QA flight",
      flight_number: "QA123",
      dates: { start_date: "2026-12-10" },
    },
  };
  const p = tools.prepareCreate(q);
  expect(p.kind === "ITEM" && p.command.command).toBe("CREATE_SPARSE_FLIGHT");
  const first = await tools.execute(
    p,
    "APPLY",
    mutationIdentity(account, p).preview_digest,
  );
  expect(first).toMatchObject({ outcome: "APPLIED", current_revision: 1 });
  await expect(
    verifyGoldenReadback(
      {
        rows: [
          {
            evidence: {
              itemCount: 1,
              items: f.graph().itinerary_events,
              stay: null,
              receipt: JSON.parse(f.receipts.get(first.operation_id)!.receiptText),
            },
          },
        ],
      },
      p,
      account,
    ),
  ).rejects.toThrow("INDEPENDENT_EXPECTED_COMMAND_UNSUPPORTED");
  const guarded = createMutationTools({
    ...context(f.backend),
    read: async () => Response.json(projectCoreItem(f.graph(), actor, first.item_id!)!),
  });
  const change = {
    kind: "FLIGHT_DETAILS",
    flight_number: "QA123",
    origin: {
      date: "2026-12-10",
      time: "09:00",
      zone: null,
      airport_code: "AKL",
      name: "Auckland",
      terminal: null,
    },
    destination: {
      date: "2026-12-10",
      time: "10:35",
      zone: null,
      airport_code: "NSN",
      name: "Nelson",
      terminal: null,
    },
  };
  const edit = guarded.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: first.item_id,
    expected_revision: 1,
    change,
  });
  expect((await guarded.execute(edit, "PREVIEW")).outcome).toBe("PREVIEW");
  const result = await guarded.execute(
    edit,
    "APPLY",
    mutationIdentity(account, edit).preview_digest,
  );
  expect(result).toMatchObject({ outcome: "APPLIED", current_revision: 2 });
  const row = itemSchema.parse(projectCoreItem(f.graph(), actor, first.item_id!));
  expect(edit.summary).toContain("Core also sets the Item title");
  expect(row.title).toBe("QA123");
  expect(row.details).toMatchObject({
    qualification: "SPARSE",
    flightNumberLiteral: "QA123",
    services: [],
  });
  expect(row.schedule.origin).toMatchObject({
    airportCode: "AKL",
    time: { localTime: "09:00:00", quality: "ESTIMATED" },
  });
  expect(row.schedule.destination).toMatchObject({
    airportCode: "NSN",
    time: { localTime: "10:35:00" },
  });
  expect(f.graph().itinerary_reservations).toHaveLength(0);
  expect(f.posts()).toBe(2);
  expect(
    (await guarded.execute(edit, "APPLY", mutationIdentity(account, edit).preview_digest))
      .outcome,
  ).toBe("APPLIED");
  expect(f.posts()).toBe(2);
  const closed = createMutationTools({
    ...context(f.backend),
    read: async () =>
      Response.json({ ...row, details: { ...row.details, qualification: "QUALIFIED" } }),
  });
  const qualifiedEdit = closed.prepareUpdate({
    request_id: randomUUID(),
    trip_id: trip,
    item_id: first.item_id,
    expected_revision: 2,
    change,
  });
  expect(await closed.execute(qualifiedEdit, "PREVIEW")).toMatchObject({
    outcome: "REJECTED",
    error_code: "FLIGHT_EDIT_REQUIRES_SPARSE_AUTHORED_ITEM",
  });
  expect(() =>
    tools.prepareCreate({
      ...q,
      item: { ...q.item, dates: { start_date: "2026-12-10", start_time: "09:00" } },
    }),
  ).toThrow();
  expect(() =>
    guarded.prepareUpdate({
      request_id: randomUUID(),
      trip_id: trip,
      item_id: first.item_id,
      expected_revision: 2,
      change: { ...change, destination: { date: "2026-12-10" } },
    }),
  ).toThrow();
});

it("allows a slow Core POST inside the existing total budget without resubmitting", async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    const tools = createMutationTools(
      context(async (q, signal) => {
        if (q.method === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 20000));
          signal.throwIfAborted();
        }
        return f.backend(q, signal);
      }),
    );
    const p = tools.prepareCreate(create());
    const pending = tools.execute(
      p,
      "APPLY",
      mutationIdentity(account, p).preview_digest,
    );
    await vi.advanceTimersByTimeAsync(20001);
    expect((await pending).outcome).toBe("APPLIED");
    expect(f.posts()).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it("returns typed proposals and current UPDATE bases without rebasing or changing stable operation digests", async () => {
  const f = fixture(),
    ctx = context(f.backend),
    tools = createMutationTools(ctx);
  const prepared = tools.prepareCreate(create());
  const accepted = await tools.execute(
    prepared,
    "APPLY",
    mutationIdentity(account, prepared).preview_digest,
  );
  let current = itemSchema.parse(projectCoreItem(f.graph(), actor, accepted.item_id!));
  const reads = {
    list_trip_items: async () => ({ items: [current], next_cursor: null }),
    get_trip_item: async () => ({ item: current }),
  } as unknown as ReturnType<typeof createReadTools>;
  const { trip_id: _, ...newItem } = create();
  const plan = {
    trip_id: trip,
    changes: [
      {
        kind: "CREATE",
        ...newItem,
        item: {
          ...newItem.item,
          dates: {
            start_date: "2026-12-10",
            end_date: "2026-12-11",
            start_time: "14:00",
            start_zone: "Pacific/Auckland",
          },
        },
      },
      {
        kind: "UPDATE",
        request_id: randomUUID(),
        item_id: current.itemId,
        expected_revision: 1,
        change: {
          kind: "TEXT",
          title: "Updated QA stay",
          notes: "Explicit replacement note",
        },
      },
    ],
  };
  const batch = createBatchTools(ctx, tools, reads);
  const first = batchOutput.parse(await batch.preview_trip_changes(plan));
  expect(first.review[0].proposed_change).toEqual(plan.changes[0]);
  expect(first.review[0].update_base).toBeNull();
  expect(first.review[0].possible_duplicate_item_ids).toEqual([current.itemId]);
  expect(first.review[1].update_base).toEqual(current);
  expect(first.review[1].proposed_change).toEqual(plan.changes[1]);
  expect(f.posts()).toBe(1); // Only fixture setup; Preview never writes.
  current = { ...current, itemRevision: 2, description: "Changed on another device" };
  const second = batchOutput.parse(await batch.preview_trip_changes(plan));
  expect(second.review[1].update_base?.itemRevision).toBe(2);
  expect(second.review[1].proposed_change).toEqual(plan.changes[1]);
  expect(second.warnings).toContain(`STALE_REVISION:${current.itemId}`);
  expect(second.preview_digest).toBe(first.preview_digest);
  current = { ...current, title: "A different stay" };
  const third = await batch.preview_trip_changes(plan);
  expect(third.review[0].possible_duplicate_item_ids).toEqual([]);
  expect(third.preview_digest).not.toBe(first.preview_digest);
  expect(f.posts()).toBe(1);
});

it("pins the prepared consumer sequence to exactly the reviewed two P3 intents", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("./fixtures/consumer-p3-write.json", import.meta.url),
  );
  const fixture = JSON.parse(source.toString());
  const plan = JSON.parse(
    await readFile(
      new URL("./fixtures/claude-p3-write-smoke.json", import.meta.url),
      "utf8",
    ),
  );
  expect(plan.authority).toBe("PREPARATION_ONLY_NOT_OWNER_APPROVED_NOT_FOR_DISPATCH");
  expect(plan.sourceFixtureSha256).toBe(sha(source));
  expect(plan.steps.map((s: { tool: string }) => s.tool)).toEqual([
    "create_trip_item",
    "create_trip_item",
    "get_trip_item",
    "update_trip_item",
    "update_trip_item",
    "get_trip_item",
  ]);
  for (const [phase, prepare] of [
    ["create", prepareCreate],
    ["update", prepareUpdate],
  ] as const) {
    const prepared = prepare(fixture.account_id, fixture[phase]);
    const identity = mutationIdentity(fixture.account_id, prepared);
    expect(contentDigest(prepared.command)).toBe(
      fixture.expected[phase + "_command_sha256"],
    );
    expect(identity.preview_digest).toBe(fixture.expected[phase + "_preview_digest"]);
    expect(identity.item_id).toBe(fixture.expected.item_id);
    for (const mode of ["PREVIEW", "APPLY"] as const) {
      const step = plan.steps.find(
        (s: { id: string }) => s.id === phase + "_" + mode.toLowerCase(),
      );
      expect(step.arguments).toEqual({
        ...fixture[phase],
        mode,
        ...(mode === "APPLY" ? { preview_digest: identity.preview_digest } : {}),
      });
      expect(step.stopUnless.operation_id).toBe(identity.operation_id);
      expect(step.stopUnless.preview_digest).toBe(identity.preview_digest);
    }
    const readback = plan.steps.find((s: { id: string }) => s.id === phase + "_readback");
    expect(readback.arguments).toEqual({
      trip_id: fixture.trip_id,
      item_id: identity.item_id,
    });
    const dates =
      phase === "create" ? fixture.create.item.dates : fixture.update.change.dates;
    const boundary = (localDate: string) => ({
      comparable: false,
      localDate,
      quality: "UNKNOWN",
      basis: "DERIVED_CIVIL",
      civilResolution: "PENDING",
    });
    expect(readback.stopUnless).toEqual({
      state: "SERVER_CONFIRMED",
      item: {
        itemId: identity.item_id,
        tripId: fixture.trip_id,
        itemRevision: phase === "create" ? 1 : 2,
        family: "P3",
        title: fixture.create.item.title,
        description: fixture.create.item.notes,
        status: "planned",
        hidden: false,
        visibility: "PRIVATE",
        localState: "ACCEPTED",
        schedule: {
          shape: "STAY",
          start: boundary(dates.start_date),
          end: boundary(dates.end_date),
        },
        details: { propertyName: fixture.create.item.property_name },
      },
    });
    expect(readback.mustNotHaveItemPaths).toEqual(
      ["start", "end"].flatMap((end) =>
        ["localTime", "zoneId", "instant", "precision"].map(
          (field) => `schedule.${end}.${field}`,
        ),
      ),
    );
    expect(plan.recovery).toContainEqual({
      tool: "get_operation_status",
      arguments: {
        trip_id: fixture.trip_id,
        operation_id: identity.operation_id,
        target: "ITEM",
      },
    });
  }
  const recovery = JSON.parse(
    await readFile(
      new URL("./fixtures/claude-original-bb-recovery.json", import.meta.url),
      "utf8",
    ),
  );
  const oldPlanBytes = await readFile(
    new URL("./fixtures/claude-p3-write-smoke.json", import.meta.url),
  );
  const actualPreviewBytes = await readFile(
    new URL("../docs/mcp/acceptance/CLAUDE_WRITE_UPDATE_PREVIEW.json", import.meta.url),
  );
  const actualPreview = JSON.parse(actualPreviewBytes.toString());
  expect(recovery.authority).toBe(
    "PREPARATION_ONLY_PENDING_NEW_EXACT_OWNER_GATE_NOT_FOR_DISPATCH",
  );
  expect(recovery.sourceFixtureSha256).toBe(sha(oldPlanBytes));
  expect(recovery.priorActualPreview.sha256).toBe(sha(actualPreviewBytes));
  expect(actualPreview).toMatchObject({
    outcome: "PREVIEW",
    operation_id: fixture.update.request_id,
    preview_digest: fixture.expected.update_preview_digest,
  });
  expect(recovery.steps.map((s: { tool: string }) => s.tool)).toEqual([
    "get_operation_status",
    "update_trip_item",
    "get_trip_item",
  ]);
  expect(recovery.allowedWriteOperationIds).toEqual([fixture.update.request_id]);
  expect(recovery.steps[0].arguments).toEqual(plan.recovery[1].arguments);
  expect(recovery.steps[1].arguments).toEqual(plan.steps[4].arguments);
  expect(recovery.steps[2].arguments).toEqual(plan.steps[5].arguments);
  expect(recovery.steps[2].stopUnless).toEqual(plan.steps[5].stopUnless);
});
it("Slice1 profile exposes only guide/read/notes edit/status and preserves all other P3 fields", async () => {
  const f = fixture();
  const seedTools = createMutationTools(context(f.backend));
  const op = seedTools.prepareCreate(create());
  const seeded = await seedTools.execute(
    op,
    "APPLY",
    (await seedTools.execute(op, "PREVIEW")).preview_digest,
  );
  const before = structuredClone(f.graph());
  let approvedDigest: string | undefined;
  const logs: import("./server").McpLogEvent[] = [];
  const bindDomains = vi.fn(async () => null);
  const resource = "http://127.0.0.1:18812/mcp";
  const handler = createMcpHandler({
    resource,
    log: (event) => logs.push(event),
    taskAssistant: true,
    toolProfile: "SLICE1_NOTES_EDIT",
    bindTaskDomains: bindDomains,
    confirm: async (request) => request.digest === approvedDigest,
    authorize: async () => ({
      accountId: account,
      clientId: "slice1-local",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: f.read,
      backend: f.backend,
    }),
  });
  const client = new Client({ name: "slice1-notes-only", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(
      [
        "get_operation_status",
        "get_otr_operating_guide",
        "get_trip",
        "get_trip_item",
        "get_trip_item_edit_base",
        "list_trip_items",
        "list_trips",
        "update_trip_item",
      ].sort(),
    );
    expect(bindDomains).not.toHaveBeenCalled();
    const caps = await client.callTool({
      name: "get_otr_operating_guide",
      arguments: { section: "CAPABILITIES" },
    });
    expect(JSON.parse((caps.structuredContent as { text: string }).text)).toMatchObject({
      active_profile: "SLICE1_NOTES_EDIT",
      candidate_field_tools: [],
      create_and_batch_tools: "UNAVAILABLE_ON_THIS_CONNECTION",
    });
    const args = {
      request_id: randomUUID(),
      trip_id: trip,
      item_id: seeded.item_id,
      expected_revision: 1,
      change: { kind: "TEXT", notes: "Slice1 local Notes only" },
    };
    for (const change of [
      { kind: "TEXT", title: "Not permitted", notes: "No" },
      { kind: "TEXT", notes: null },
      { kind: "TEXT", notes: "" },
      { kind: "TEXT", notes: " " },
      { kind: "TEXT", notes: "\n" },
      { kind: "DATES", dates: { start_date: "2026-12-11" } },
    ]) {
      const result = await client
        .callTool({ name: "update_trip_item", arguments: { ...args, change } })
        .catch(() => ({ isError: true }));
      expect(result.isError).toBe(true);
    }
    expect(f.posts()).toBe(1);
    const preview = await client.callTool({ name: "update_trip_item", arguments: args });
    const p = mutationOutput.parse(preview.structuredContent);
    expect(p.outcome).toBe("PREVIEW");
    const apply = { ...args, mode: "APPLY", preview_digest: p.preview_digest };
    expect(
      mutationOutput.parse(
        (await client.callTool({ name: "update_trip_item", arguments: apply }))
          .structuredContent,
      ).outcome,
    ).toBe("NEEDS_CONFIRMATION");
    expect(f.posts()).toBe(1);
    approvedDigest = p.preview_digest;
    const receipt = mutationOutput.parse(
      (await client.callTool({ name: "update_trip_item", arguments: apply }))
        .structuredContent,
    );
    expect(receipt).toMatchObject({
      outcome: "APPLIED",
      item_id: seeded.item_id,
      current_revision: 2,
      operation_id: args.request_id,
    });
    expect(logs.at(-1)).not.toHaveProperty("responseProof");
    const current = f.graph();
    expect(current.itinerary_events[0].description).toBe(args.change.notes);
    for (const key of Object.keys(before.itinerary_events[0])) {
      if (
        !["description", "field_state", "semantic_revision", "updated_at"].includes(key)
      )
        expect(current.itinerary_events[0][key]).toEqual(before.itinerary_events[0][key]);
    }
    for (const [key, value] of Object.entries(
      before.itinerary_events[0].field_state as object,
    )) {
      if (key !== "itinerary_events.description")
        expect(
          (current.itinerary_events[0].field_state as Record<string, unknown>)[key],
        ).toEqual(value);
    }
    for (const table of Object.keys(before) as (keyof CoreGraph)[]) {
      if (table !== "itinerary_events") expect(current[table]).toEqual(before[table]);
    }
    expect(
      mutationOutput.parse(
        (await client.callTool({ name: "update_trip_item", arguments: apply }))
          .structuredContent,
      ).outcome,
    ).toBe("APPLIED");
    expect(f.posts()).toBe(2);
  } finally {
    await client.close();
  }
});

it("Notes proof binds final SDK Base/Preview only, without leaking content or changing responses", async () => {
  const f = fixture(),
    seed = createMutationTools(context(f.backend));
  const prepared = seed.prepareCreate(create());
  const created = await seed.execute(
    prepared,
    "APPLY",
    (await seed.execute(prepared, "PREVIEW")).preview_digest,
  );
  const resource = "https://mcp.example.invalid/mcp";
  const logs: import("./server").McpLogEvent[] = [];
  let expireRead = false,
    throwLog = false;
  const options: import("./server").McpOptions = {
    resource,
    taskAssistant: true,
    toolProfile: "SLICE1_NOTES_EDIT",
    log: (event) => {
      if (throwLog) throw Error("LOG_UNAVAILABLE");
      logs.push(event);
    },
    authorize: async () => {
      const auth: import("./server").McpAuthorization = {
        accountId: account,
        clientId: "proof-local",
        resource,
        scopes: ["otr.trips.read", "otr.trips.write"],
        expiresAt: Date.now() + 60000,
        backend: f.backend,
        read: async (path, signal) => {
          const result = await f.read(path, signal);
          if (expireRead) auth.expiresAt = 0;
          return result;
        },
      };
      return auth;
    },
  };
  let handler = createMcpHandler(options);
  const client = new Client({ name: "response-proof", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: async (input, init) => handler(new Request(input, init)),
      }),
    );
    const baseArgs = { trip_id: trip, item_id: created.item_id! };
    const base = await client.callTool({
      name: "get_trip_item_edit_base",
      arguments: baseArgs,
    });
    expect(logs.at(-1)).toMatchObject({
      requestId: expect.any(String),
      status: 200,
      tool: "get_trip_item_edit_base",
      responseProof: {
        version: "otr.mcp.response-proof/1",
        kind: "EDIT_BASE",
        inputSHA256: contentDigest(baseArgs),
        outputSHA256: contentDigest(base.structuredContent),
      },
    });
    expect(logs.at(-1)?.responseProof).not.toHaveProperty("previewDigest");
    const args = {
      request_id: randomUUID(),
      ...baseArgs,
      expected_revision: 1,
      change: { kind: "TEXT", notes: "Private proof Notes sentinel" },
    };
    const preview = await client.callTool({ name: "update_trip_item", arguments: args });
    const proof = logs.at(-1)?.responseProof;
    expect(proof).toEqual({
      version: "otr.mcp.response-proof/1",
      kind: "PREVIEW",
      inputSHA256: contentDigest(args),
      outputSHA256: contentDigest(preview.structuredContent),
      previewDigest: mutationOutput.parse(preview.structuredContent).preview_digest,
    });
    const reordered = {
      change: { notes: args.change.notes, kind: "TEXT" },
      expected_revision: 1,
      item_id: created.item_id!,
      trip_id: trip,
      request_id: args.request_id,
    };
    await client.callTool({ name: "update_trip_item", arguments: reordered });
    expect(logs.at(-1)?.responseProof).toEqual(proof);
    const changedArgs = {
      ...args,
      change: { kind: "TEXT", notes: "Different private sentinel" },
    };
    await client.callTool({ name: "update_trip_item", arguments: changedArgs });
    expect(logs.at(-1)?.responseProof?.inputSHA256).not.toBe(proof?.inputSHA256);
    expect(logs.at(-1)?.responseProof?.outputSHA256).not.toBe(proof?.outputSHA256);
    for (const call of [
      { name: "get_trip_item", arguments: baseArgs },
      {
        name: "update_trip_item",
        arguments: { ...args, change: { kind: "TEXT", title: "Forbidden" } },
      },
      {
        name: "update_trip_item",
        arguments: { ...args, mode: "APPLY", preview_digest: proof!.previewDigest },
      },
    ]) {
      await client.callTool(call).catch(() => undefined);
      expect(logs.at(-1)).not.toHaveProperty("responseProof");
    }
    const batch = await handler(
      new Request(resource, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "base",
            method: "tools/call",
            params: { name: "get_trip_item_edit_base", arguments: baseArgs },
          },
          {
            jsonrpc: "2.0",
            id: "preview",
            method: "tools/call",
            params: { name: "update_trip_item", arguments: args },
          },
        ]),
      }),
    );
    expect(batch.status).toBe(200);
    expect(logs.at(-1)).not.toHaveProperty("responseProof");
    throwLog = true;
    const logFailure = await client.callTool({
      name: "update_trip_item",
      arguments: args,
    });
    expect(logFailure).toEqual(preview);
    throwLog = false;
    expireRead = true;
    await expect(
      client.callTool({ name: "get_trip_item_edit_base", arguments: baseArgs }),
    ).rejects.toThrow("AUTH_REQUIRED");
    expect(logs.at(-1)).not.toHaveProperty("responseProof");
    expireRead = false;
    handler = createMcpHandler({ ...options, toolProfile: undefined });
    await client.callTool({ name: "get_trip_item_edit_base", arguments: baseArgs });
    expect(logs.at(-1)).not.toHaveProperty("responseProof");
    await client.callTool({ name: "update_trip_item", arguments: args });
    expect(logs.at(-1)).not.toHaveProperty("responseProof");
    const serialized = JSON.stringify(logs);
    for (const privateValue of [
      account,
      trip,
      created.item_id!,
      args.request_id,
      "Private proof Notes sentinel",
      "Different private sentinel",
      "proof-local",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(f.posts()).toBe(1);
  } finally {
    await client.close();
  }
});
