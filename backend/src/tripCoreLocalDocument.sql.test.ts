import { expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { createCorePgReader } from "./tripCoreV2PgRead";
import { createCorePgStorage, readCorePgOperation } from "./tripCoreV2PgStorage";
import { session } from "./__fixtures__/tripCoreV2Sql";

const fixture = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!fixture)(
  "installs LOCAL_ONLY Document storage with the existing authority closed",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(fixture!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    const { lease, close } = session(fixture!);
    try {
      const state = await lease.query(
        `SELECT g.runtime_enabled, g.enabled_commands, c.convalidated,
                pg_get_constraintdef(c.oid) AS definition
           FROM public.trip_core_activation_gate g
           CROSS JOIN pg_constraint c
           WHERE g.singleton AND c.conrelid='public.trip_operational_documents'::regclass
                 AND c.conname='trip_operational_documents_custody_check'`,
      );
      expect(state.rows).toHaveLength(1);
      expect(state.rows[0]).toMatchObject({
        runtime_enabled: false,
        enabled_commands: [],
        convalidated: true,
        definition: expect.stringContaining("LOCAL_ONLY"),
      });
      const data = await lease.query(
        "SELECT count(*)::integer AS count FROM public.trip_operational_documents",
      );
      expect(data.rows[0]?.count).toBe(0);
    } finally {
      close();
    }
  },
);

const actor = process.env.OTR_CORE_V3_FIXTURE_ACTOR;
const trip = process.env.OTR_CORE_V3_FIXTURE_TRIP;
it.skipIf(!fixture || !actor || !trip)(
  "stores LOCAL_ONLY metadata and links an ordinary Item with independent owning readback",
  async () => {
    const writer = session(fixture!);
    const reader = session(fixture!);
    const account = actor!,
      tripId = trip!;
    const item = randomUUID(),
      document = randomUUID();
    const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const connect = ({ lease }: typeof writer) => ({
      withLease: async <T>(work: (current: typeof lease) => Promise<T>) => work(lease),
    });
    const mode = { sustainedDev: true as const };
    const storage = createCorePgStorage(connect(writer), hash, undefined, mode);
    const receiptReader = createCorePgStorage(connect(reader), hash, undefined, mode);
    const collection = createCorePgReader(connect(reader), hash, undefined, mode);
    const base = {
      contractVersion: 2,
      intentVersion: 2,
      tripId,
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    };
    try {
      await writer.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      await reader.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const itemCommand = {
        ...base,
        command: "CREATE_ITEM",
        operationId: randomUUID(),
        target: { kind: "ITEM", id: item },
        baseVector: [{ kind: "ITEM", id: item, revision: null }],
        payload: {
          family: "P1",
          core: { title: "Synthetic existing item" },
          schedule: { start: coreDateBoundary("2026-12-14") },
          ...coreDefaults("organizer"),
        },
      };
      expect(
        await executeCoreCommandV2(storage, account, tripId, itemCommand, hash),
      ).toMatchObject({
        projection: "FULL",
        receipt: { outcome: "APPLIED" },
      });
      const metadata = {
        ...base,
        command: "CREATE_DOCUMENT_METADATA",
        operationId: randomUUID(),
        target: { kind: "DOCUMENT", id: document },
        baseVector: [{ kind: "DOCUMENT", id: document, revision: null }],
        payload: {
          title: "Synthetic itinerary document",
          media_type: "text/plain",
          byte_size: 10,
          sha256: "a".repeat(64),
        },
      };
      const created = await executeCoreCommandV2(
        storage,
        account,
        tripId,
        metadata,
        hash,
      );
      expect(created).toMatchObject({
        projection: "FULL",
        receipt: { outcome: "APPLIED" },
      });
      expect(
        await readCorePgOperation(
          receiptReader,
          account,
          tripId,
          metadata.operationId,
          hash,
        ),
      ).toEqual(created);
      const link = {
        ...base,
        command: "RECONCILE_ITEM_DOCUMENTS",
        operationId: randomUUID(),
        target: { kind: "ITEM", id: item },
        baseVector: [
          { kind: "DOCUMENT", id: document, revision: 1 },
          { kind: "ITEM", id: item, revision: 1 },
        ],
        payload: { add: [document], remove: [] },
      };
      const linked = await executeCoreCommandV2(storage, account, tripId, link, hash);
      expect(linked).toMatchObject({
        projection: "FULL",
        receipt: { outcome: "APPLIED" },
      });
      expect(await executeCoreCommandV2(storage, account, tripId, link, hash)).toEqual(
        linked,
      );
      expect(
        await readCorePgOperation(receiptReader, account, tripId, link.operationId, hash),
      ).toEqual(linked);
      const rows = (
        await collection.collection(account, tripId, undefined, true)
      ).pages.flatMap((p) => p.records);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "DOCUMENT",
            id: document,
            body: expect.objectContaining({
              custody: "LOCAL_ONLY",
              custody_receipt_id: null,
              storage_object_key: null,
            }),
          }),
          expect.objectContaining({
            kind: "ITEM",
            id: item,
            body: expect.objectContaining({ title: "Synthetic existing item" }),
          }),
          expect.objectContaining({
            kind: "RELATION",
            body: expect.objectContaining({
              tableName: "trip_item_document_links",
              row: expect.objectContaining({ item_id: item, document_id: document }),
            }),
          }),
        ]),
      );
      const legacy = (await collection.collection(account, tripId)).pages.flatMap(
        (p) => p.records,
      );
      expect(legacy.some(({ id }) => id === document)).toBe(false);
    } finally {
      reader.close();
      writer.close();
    }
  },
);
