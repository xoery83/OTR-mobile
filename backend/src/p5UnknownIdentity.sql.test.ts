import { expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { createCorePgStorage, readCorePgOperation } from "./tripCoreV2PgStorage";
import { createCorePgReader } from "./tripCoreV2PgRead";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { coreDefaults, corePlaceSchema } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { unknownP5Identity } from "../../src/domain/trip/p5Identity";
const fixture = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!fixture)(
  "P5 unknown create, independent Reader/Receipt, same-row enrichment, CAS, replay and cross-account denial",
  async () => {
    const w = session(fixture!),
      r = session(fixture!);
    const conn = (s: typeof w) => ({
      withLease: async <T>(work: (lease: typeof s.lease) => Promise<T>) => work(s.lease),
    });
    const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const account = process.env.OTR_CORE_V3_FIXTURE_ACTOR!,
      trip = process.env.OTR_CORE_V3_FIXTURE_TRIP!,
      item = randomUUID();
    const storage = createCorePgStorage(conn(w), hash, undefined, { sustainedDev: true }),
      independent = createCorePgStorage(conn(r), hash, undefined, { sustainedDev: true });
    const reader = createCorePgReader(conn(r), hash, undefined, { sustainedDev: true });
    const place = corePlaceSchema.parse(
        Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
      ),
      endpoint = { time: coreDateBoundary("2026-12-02"), place };
    const service = {
      service_key: "main",
      transport_subtype: "BUS",
      attribution: "UNSPECIFIED",
      codeshare_operating_key: null,
      ...unknownP5Identity(),
    };
    const create = {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: item },
      baseVector: [{ kind: "ITEM", id: item, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P5",
        core: { title: "P5 uncertain operator plan" },
        endpoints: { origin: endpoint, destination: endpoint },
        service,
        ...coreDefaults("member"),
      },
    };
    try {
      await w.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      await r.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const first = await executeCoreCommandV2(storage, account, trip, create, hash);
      expect(first).toMatchObject({
        projection: "FULL",
        receipt: { outcome: "APPLIED" },
      });
      expect(await executeCoreCommandV2(storage, account, trip, create, hash)).toEqual(
        first,
      );
      expect(
        await readCorePgOperation(independent, account, trip, create.operationId, hash),
      ).toEqual(first);
      const unnumberedId = randomUUID();
      const unnumbered = {
        ...create,
        operationId: randomUUID(),
        target: { kind: "ITEM", id: unnumberedId },
        baseVector: [{ kind: "ITEM", id: unnumberedId, revision: null }],
        payload: {
          ...create.payload,
          core: { title: "Explicit unnumbered shuttle" },
          service: {
            ...service,
            transport_subtype: "SHUTTLE",
            service_literal: "Authored unnumbered shuttle",
            identity_state: {
              ...service.identity_state,
              fields: {
                ...service.identity_state.fields,
                service_number: "NOT_APPLICABLE",
                service_literal: "KNOWN",
              },
            },
          },
        },
      };
      expect(
        await executeCoreCommandV2(storage, account, trip, unnumbered, hash),
      ).toMatchObject({ receipt: { outcome: "APPLIED" } });
      expect(
        (await reader.item(account, trip, unnumberedId))?.details.service,
      ).toMatchObject({
        identityState: { fields: { service_number: "NOT_APPLICABLE" } },
        serviceLiteral: "Authored unnumbered shuttle",
      });
      const original = await reader.item(account, trip, item);
      expect(original?.details.service).toMatchObject({
        serviceKey: "main",
        identityState: service.identity_state,
      });
      expect(original?.details.service).not.toHaveProperty("operatorLiteral");
      await r.lease.query("RESET SESSION AUTHORIZATION");
      // Raw CHECK negatives are isolated inside a rolled-back fixture-only transaction.
      await r.lease.query("BEGIN");
      await r.lease.query("SET LOCAL ROLE postgres");
      await r.lease.query(
        "ALTER TABLE public.itinerary_transport_services DISABLE TRIGGER USER",
      );
      for (const namespace of ["IATA_AIRLINE", "ICAO_AIRLINE"]) {
        const bad = {
          ...service.identity_state,
          fields: { ...service.identity_state.fields, operator_namespace: "KNOWN" },
        };
        await r.lease.query(
          `DO $negative$ BEGIN BEGIN
      UPDATE public.itinerary_transport_services SET operator_namespace=$1,identity_state=$2::jsonb WHERE event_id=$3::uuid;
      RAISE EXCEPTION 'P5_INVALID_AIRLINE_TUPLE_ACCEPTED';
      EXCEPTION WHEN check_violation THEN NULL; END; END $negative$`,
          [namespace, JSON.stringify(bad), item],
        );
      }
      for (const literal of ["", "\t", "\u00a0", "\ufeff"]) {
        const badKnown = {
          ...service.identity_state,
          fields: { ...service.identity_state.fields, operator_literal: "KNOWN" },
        };
        await r.lease.query(
          `DO $negative$ BEGIN BEGIN
          UPDATE public.itinerary_transport_services SET operator_literal=$1,identity_state=$2::jsonb WHERE event_id=$3::uuid;
          RAISE EXCEPTION 'P5_KNOWN_BLANK_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL;END;END $negative$`,
          [literal, JSON.stringify(badKnown), item],
        );
      }
      const badNA = {
        ...service.identity_state,
        fields: { ...service.identity_state.fields, operator_literal: "NOT_APPLICABLE" },
      };
      await r.lease.query(
        `DO $negative$ BEGIN BEGIN
    UPDATE public.itinerary_transport_services SET identity_state=$1::jsonb WHERE event_id=$2::uuid;
    RAISE EXCEPTION 'P5_INVALID_APPLICABILITY_ACCEPTED';
    EXCEPTION WHEN check_violation THEN NULL; END; END $negative$`,
        [JSON.stringify(badNA), item],
      );
      await r.lease.query("ROLLBACK");
      await r.lease.query("BEGIN");
      await r.lease.query("SET LOCAL ROLE postgres");
      await r.lease.query(
        "ALTER TABLE public.itinerary_transport_services DISABLE TRIGGER USER",
      );
      await r.lease.query(
        'UPDATE public.itinerary_transport_services SET provenance_refs=\'{"fixture":"retained-original-bytes"}\'::jsonb WHERE event_id=$1::uuid',
        [item],
      );
      await r.lease.query(
        "ALTER TABLE public.itinerary_transport_services ENABLE TRIGGER USER",
      );
      await r.lease.query("COMMIT");
      const before = (
        await r.lease.query(
          "SELECT xmin::text row_version,provenance_refs FROM public.itinerary_transport_services WHERE event_id=$1::uuid",
          [item],
        )
      ).rows[0];
      await r.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const known = {
        service_key: "main",
        transport_subtype: "BUS",
        attribution: "UNSPECIFIED",
        operator_namespace: "NAME",
        operator_issuer: "Authored",
        operator_value: "QA Bus",
        operator_literal: "Synthetic Bus",
        service_number: "12",
        service_literal: "Route 12",
        codeshare_operating_key: null,
      };
      const enrich = {
        ...create,
        operationId: randomUUID(),
        command: "SET_TRANSPORT_DETAILS",
        baseVector: [{ kind: "ITEM", id: item, revision: 1 }],
        payload: { service: known },
      };
      const accepted = await executeCoreCommandV2(storage, account, trip, enrich, hash);
      expect(accepted).toMatchObject({
        projection: "FULL",
        receipt: { outcome: "APPLIED" },
      });
      expect(await executeCoreCommandV2(storage, account, trip, enrich, hash)).toEqual(
        accepted,
      );
      expect(
        await readCorePgOperation(independent, account, trip, enrich.operationId, hash),
      ).toEqual(accepted);
      expect(await reader.item(account, trip, item)).toMatchObject({
        itemId: item,
        itemRevision: 2,
        details: { service: { serviceKey: "main", operatorLiteral: "Synthetic Bus" } },
      });
      const conflict = await executeCoreCommandV2(
        storage,
        account,
        trip,
        { ...enrich, operationId: randomUUID() },
        hash,
      );
      expect(conflict).toMatchObject({ receipt: { outcome: "CONFLICT" } });
      await expect(
        executeCoreCommandV2(
          storage,
          randomUUID(),
          trip,
          {
            ...enrich,
            operationId: randomUUID(),
            baseVector: [{ kind: "ITEM", id: item, revision: 2 }],
          },
          hash,
        ),
      ).rejects.toThrow();
      const legacyId = randomUUID(),
        legacyCreate = {
          ...create,
          operationId: randomUUID(),
          target: { kind: "ITEM", id: legacyId },
          baseVector: [{ kind: "ITEM", id: legacyId, revision: null }],
          payload: { ...create.payload, service: { ...known, service_key: "legacy" } },
        };
      const legacyReceipt = await executeCoreCommandV2(
        storage,
        account,
        trip,
        legacyCreate,
        hash,
      );
      expect(legacyReceipt).toMatchObject({ receipt: { outcome: "APPLIED" } });
      // Reproduce the legal pre-existing stored profile using only this disposable fixture.
      await r.lease.query("RESET SESSION AUTHORIZATION");
      await r.lease.query("BEGIN");
      await r.lease.query("SET LOCAL ROLE postgres");
      await r.lease.query(
        "ALTER TABLE public.itinerary_transport_services DISABLE TRIGGER USER",
      );
      await r.lease.query(
        "UPDATE public.itinerary_transport_services SET operator_issuer='',operator_value='',operator_literal='',service_number='',service_literal='' WHERE event_id=$1::uuid",
        [legacyId],
      );
      await r.lease.query(
        "ALTER TABLE public.itinerary_transport_services ENABLE TRIGGER USER",
      );
      await r.lease.query("COMMIT");
      await r.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      expect((await reader.item(account, trip, legacyId))?.details.service).toMatchObject(
        {
          serviceKey: "legacy",
          identityState: { version: 1, fields: { operator_literal: "UNKNOWN" } },
        },
      );
      expect(
        await readCorePgOperation(
          independent,
          account,
          trip,
          legacyCreate.operationId,
          hash,
        ),
      ).toEqual(legacyReceipt);
      const upgrade = {
        ...legacyCreate,
        operationId: randomUUID(),
        command: "SET_TRANSPORT_DETAILS",
        baseVector: [{ kind: "ITEM", id: legacyId, revision: 1 }],
        payload: {
          service: {
            service_key: "legacy",
            transport_subtype: "TRAIN",
            attribution: "UNSPECIFIED",
            codeshare_operating_key: null,
            ...unknownP5Identity(),
          },
        },
      };
      expect(
        await executeCoreCommandV2(storage, account, trip, upgrade, hash),
      ).toMatchObject({ receipt: { outcome: "APPLIED" } });
      expect((await reader.item(account, trip, legacyId))?.itemId).toBe(legacyId);
      await r.lease.query("RESET SESSION AUTHORIZATION");
      expect(
        (
          await r.lease.query(
            "SELECT count(*)::int n FROM public.itinerary_transport_services WHERE event_id=$1::uuid",
            [legacyId],
          )
        ).rows[0],
      ).toEqual({ n: 1 });
      await r.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const racing = await Promise.all(
        [storage, independent].map((port, index) =>
          executeCoreCommandV2(
            port,
            account,
            trip,
            {
              ...enrich,
              operationId: randomUUID(),
              baseVector: [{ kind: "ITEM", id: item, revision: 2 }],
              payload: {
                service: {
                  ...known,
                  service_number: String(13 + index),
                  service_literal: `Route ${13 + index}`,
                },
              },
            },
            hash,
          ),
        ),
      );
      expect(
        racing
          .map((result) =>
            result.projection === "FULL" ? result.receipt.outcome : result.projection,
          )
          .sort(),
      ).toEqual(["APPLIED", "CONFLICT"]);
      expect((await reader.item(account, trip, item))?.itemRevision).toBe(3);
      await r.lease.query("RESET SESSION AUTHORIZATION");
      const rows = (
        await r.lease.query(
          "SELECT service_key,identity_state,provenance_refs FROM public.itinerary_transport_services WHERE event_id=$1::uuid",
          [item],
        )
      ).rows;
      expect(rows).toEqual([
        {
          service_key: "main",
          identity_state: null,
          provenance_refs: before.provenance_refs,
        },
      ]);
    } finally {
      w.close();
      r.close();
    }
  },
  30000,
);
