import { expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { createCorePgStorage, readCorePgOperation } from "./tripCoreV2PgStorage";
import { session } from "./__fixtures__/tripCoreV2Sql";
const fixture = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!fixture)(
  "finite IMPORT: real owning create, LOCAL_ONLY link, Receipt, manual protection and no duplicate replay",
  async () => {
    const writer = session(fixture!),
      reader = session(fixture!);
    const account = process.env.OTR_CORE_V3_FIXTURE_ACTOR!,
      tripId = process.env.OTR_CORE_V3_FIXTURE_TRIP!;
    const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const connection = (s: typeof writer) => ({
      withLease: async <T>(work: (lease: typeof s.lease) => Promise<T>) => work(s.lease),
    });
    const storage = createCorePgStorage(connection(writer), hash, undefined, {
      sustainedDev: true,
    });
    const independent = createCorePgStorage(connection(reader), hash, undefined, {
      sustainedDev: true,
    });
    const item = randomUUID(),
      document = randomUUID();
    const base = {
      contractVersion: 2,
      intentVersion: 2,
      tripId,
      admission: { mode: "IMPORT", sourceIntentId: null, policyVersion: null },
    };
    const create = {
      ...base,
      command: "CREATE_ITEM",
      operationId: randomUUID(),
      target: { kind: "ITEM", id: item },
      baseVector: [{ kind: "ITEM", id: item, revision: null }],
      payload: {
        family: "P1",
        core: { title: "Import synthetic museum" },
        schedule: { start: coreDateBoundary("2026-12-14") },
        ...coreDefaults("organizer"),
      },
    };
    const metadata = {
      ...base,
      command: "CREATE_DOCUMENT_METADATA",
      operationId: randomUUID(),
      target: { kind: "DOCUMENT", id: document },
      baseVector: [{ kind: "DOCUMENT", id: document, revision: null }],
      payload: {
        title: "Synthetic source",
        media_type: "text/plain",
        byte_size: 10,
        sha256: "b".repeat(64),
      },
    };
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
    try {
      await writer.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      await reader.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      for (const command of [create, metadata, link]) {
        const result = await executeCoreCommandV2(
          storage,
          account,
          tripId,
          command,
          hash,
        );
        expect(result).toMatchObject({
          projection: "FULL",
          receipt: { outcome: "APPLIED" },
        });
        expect(
          await executeCoreCommandV2(storage, account, tripId, command, hash),
        ).toEqual(result);
        expect(
          await readCorePgOperation(
            independent,
            account,
            tripId,
            command.operationId,
            hash,
          ),
        ).toEqual(result);
      }
      // Independent session uses the owning scope, never table privileges granted for a test.
      const { createCorePgReader } = await import("./tripCoreV2PgRead");
      const pages = await createCorePgReader(connection(reader), hash, undefined, {
        sustainedDev: true,
      }).collection(account, tripId, undefined, true);
      const rows = pages.pages.flatMap((page) => page.records);
      const saved = rows.find((row) => row.kind === "ITEM" && row.id === item)!;
      expect((saved.body as Record<string, unknown>).field_state).toMatchObject({
        "itinerary_events.title": { origin: "PROVIDER", protected: false },
      });
      expect(
        rows.filter(
          (row) =>
            row.kind === "RELATION" &&
            ((row.body as Record<string, unknown>).row as Record<string, unknown>)
              ?.document_id === document,
        ),
      ).toHaveLength(1);

      const manualItem = randomUUID();
      expect(
        await executeCoreCommandV2(
          storage,
          account,
          tripId,
          {
            ...create,
            operationId: randomUUID(),
            target: { kind: "ITEM", id: manualItem },
            baseVector: [{ kind: "ITEM", id: manualItem, revision: null }],
            admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
          },
          hash,
        ),
      ).toMatchObject({ receipt: { outcome: "APPLIED" } });
      expect(
        await executeCoreCommandV2(
          storage,
          account,
          tripId,
          {
            ...link,
            operationId: randomUUID(),
            target: { kind: "ITEM", id: manualItem },
            baseVector: [
              { kind: "DOCUMENT", id: document, revision: 1 },
              { kind: "ITEM", id: manualItem, revision: 1 },
            ],
          },
          hash,
        ),
      ).toMatchObject({ receipt: { outcome: "APPLIED" } });
      const flight = randomUUID();
      expect(
        await executeCoreCommandV2(
          storage,
          account,
          tripId,
          {
            ...base,
            operationId: randomUUID(),
            command: "CREATE_SPARSE_FLIGHT",
            target: { kind: "ITEM", id: flight },
            baseVector: [{ kind: "ITEM", id: flight, revision: null }],
            payload: {
              flightNumberLiteral: "NZ2",
              departureDate: "2026-12-14",
              ...coreDefaults("organizer"),
            },
          },
          hash,
        ),
      ).toMatchObject({ receipt: { outcome: "APPLIED" } });
      const details = {
        ...base,
        operationId: randomUUID(),
        command: "SET_AUTHORED_FLIGHT_DETAILS",
        target: { kind: "ITEM", id: flight },
        baseVector: [{ kind: "ITEM", id: flight, revision: 1 }],
        payload: {
          flightNumberLiteral: "NZ2",
          origin: {
            airportCode: "AKL",
            name: null,
            terminal: null,
            time: coreDateBoundary("2026-12-14"),
          },
          destination: {
            airportCode: "CHC",
            name: null,
            terminal: null,
            time: coreDateBoundary("2026-12-14"),
          },
        },
      };
      const flightReceipt = await executeCoreCommandV2(
        storage,
        account,
        tripId,
        details,
        hash,
      );
      expect(flightReceipt).toMatchObject({ receipt: { outcome: "APPLIED" } });
      expect(await executeCoreCommandV2(storage, account, tripId, details, hash)).toEqual(
        flightReceipt,
      );
      const finalRows = (
        await createCorePgReader(connection(reader), hash, undefined, {
          sustainedDev: true,
        }).collection(account, tripId, undefined, true)
      ).pages.flatMap((page) => page.records);
      expect(
        (
          finalRows.find((row) => row.kind === "ITEM" && row.id === manualItem)!
            .body as Record<string, unknown>
        ).field_state,
      ).toMatchObject({
        "itinerary_events.title": { origin: "MANUAL", protected: true },
      });
      await expect(
        executeCoreCommandV2(
          storage,
          randomUUID(),
          tripId,
          { ...create, operationId: randomUUID() },
          hash,
        ),
      ).rejects.toThrow();
      await expect(
        executeCoreCommandV2(
          storage,
          account,
          tripId,
          {
            ...base,
            operationId: randomUUID(),
            command: "SET_ITEM_TEXT",
            target: { kind: "ITEM", id: item },
            baseVector: [{ kind: "ITEM", id: item, revision: 2 }],
            payload: { title: "Forbidden automatic update" },
          },
          hash,
        ),
      ).rejects.toThrow();
    } finally {
      reader.close();
      writer.close();
    }
  },
  90_000,
);
