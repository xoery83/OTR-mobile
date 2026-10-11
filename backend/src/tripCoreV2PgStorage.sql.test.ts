import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createCorePgStorage, type CorePgLease } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import {
  corePlaceSchema,
  itinerary_transport_servicesSchema,
  coreDefaults,
} from "../../src/domain/trip/tripCoreV2";
const fixture = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
// This SQL-port test deliberately uses libpq/psql in a network-isolated disposable fixture.
// It does not certify the deployed Node pg connection or Hosted/native runtime.
it.skipIf(!fixture)(
  "commits sparse facts and immutable receipts together; exact replay and CAS are fenced",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(fixture!))
      throw new Error("OWNED_FIXTURE_REQUIRED");
    const proc = spawn(
      "/opt/homebrew/bin/docker",
      [
        "exec",
        "-i",
        fixture!,
        "psql",
        "-XqAt",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { stdio: "pipe" },
    );
    let output = "",
      errors = "",
      pending:
        | {
            marker: string;
            resolve: (value: { rows: Record<string, unknown>[] }) => void;
            reject: (error: Error) => void;
          }
        | undefined;
    proc.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    proc.stdout.on("data", (chunk) => {
      output += chunk;
      if (pending && output.includes(pending.marker + "\n")) {
        const text = output.slice(0, output.indexOf(pending.marker)).trim();
        output = output.slice(output.indexOf(pending.marker) + pending.marker.length + 1);
        const request = pending;
        pending = undefined;
        try {
          request.resolve({ rows: text ? JSON.parse(text) : [] });
        } catch {
          request.reject(new Error(text));
        }
      }
    });
    proc.on("exit", () => pending?.reject(new Error(errors || "SQL_SESSION_LOST")));
    const literal = (value: unknown) =>
      value === null
        ? "NULL"
        : typeof value === "boolean"
          ? String(value)
          : "'" + String(value).replaceAll("'", "''") + "'";
    const lease: CorePgLease = {
      retire() {
        proc.kill();
      },
      query(sql, params = []) {
        if (pending) throw new Error("CONCURRENT_SQL_TEST_QUERY");
        const bound = sql.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1]));
        const statement = /^SELECT\b/i.test(bound)
          ? `SELECT coalesce(jsonb_agg(q),'[]'::jsonb) FROM (${bound}) q;`
          : bound + ";";
        return new Promise((resolve, reject) => {
          const marker = randomUUID();
          pending = { marker, resolve, reject };
          proc.stdin.write(statement + "\n\\echo " + marker + "\n");
        });
      },
    };
    const account = "00000000-0000-4000-8000-000000000002",
      trip = "10000000-0000-4000-8000-000000000001",
      id = randomUUID();
    const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip,
      command: "CREATE_SPARSE_FLIGHT",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        flightNumberLiteral: "NZ5069",
        departureDate: "2026-12-14",
        ...coreDefaults("member"),
      },
    };
    try {
      // Only this owned disposable database removes the fail-closed activation CHECKs for a positive fixture.
      await lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['MANUAL']",
      );
      await lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const storage = createCorePgStorage(
        { withLease: async (work) => work(lease) },
        hash,
      );
      const first = await executeCoreCommandV2(storage, account, trip, command, hash);
      expect(first.projection).toBe("FULL");
      if (first.projection !== "FULL") throw new Error("REDACTED_UNEXPECTED");
      expect(first.receipt.errorCode).toBeNull();
      expect(first.receipt.outcome).toBe("APPLIED");
      expect(await executeCoreCommandV2(storage, account, trip, command, hash)).toEqual(
        first,
      );
      await expect(
        executeCoreCommandV2(
          storage,
          account,
          trip,
          { ...command, payload: { ...command.payload, flightNumberLiteral: "NZ5070" } },
          hash,
        ),
      ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
      const conflict = await executeCoreCommandV2(
        storage,
        account,
        trip,
        { ...command, operationId: randomUUID() },
        hash,
      );
      expect(conflict.projection).toBe("FULL");
      if (conflict.projection === "FULL")
        expect(conflict.receipt.outcome).toBe("CONFLICT");
      await lease.query("RESET SESSION AUTHORIZATION");
      const counts = (
        await lease.query(
          "SELECT (SELECT count(*)::int FROM public.itinerary_events WHERE id=$1::uuid) roots,(SELECT count(*)::int FROM public.trip_core_command_receipts WHERE actor_account_id=$2::uuid) receipts",
          [id, account],
        )
      ).rows[0];
      expect(counts).toEqual({ roots: 1, receipts: 2 });
      await lease.query(
        "UPDATE public.trip_core_activation_gate SET enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','CREATE_ITEM'],enabled_families=ARRAY['P1','P2','P3','P4','P5','P6']",
      );
      await lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const place = {
        ...Object.fromEntries(
          Object.keys(corePlaceSchema.shape).map((key) => [key, null]),
        ),
        authored_label: "Synthetic pier",
        accepted_latitude: -36.8485,
        accepted_longitude: 174.7633,
      };
      const service = {
        ...Object.fromEntries(
          Object.keys(itinerary_transport_servicesSchema.shape)
            .filter((key) => !["event_id", "trip_id"].includes(key))
            .map((key) => [key, null]),
        ),
        service_key: "water.main",
        transport_subtype: "WATER_TAXI",
        attribution: "UNSPECIFIED",
        operator_namespace: "NAME",
        operator_issuer: "SUPPLIER",
        operator_value: "Taxi",
        operator_literal: "Taxi",
        service_number: "1",
        service_literal: "Water Taxi 1",
      };
      for (const family of ["P1", "P3", "P4", "P5", "P6"]) {
        const itemId = randomUUID();
        const payload = {
          family,
          core: { title: family + " synthetic" },
          ...coreDefaults("member"),
          ...(family === "P5"
            ? {
                endpoints: {
                  origin: { time: coreDateBoundary("2026-12-14"), place },
                  destination: { time: coreDateBoundary("2026-12-14"), place },
                },
                service,
              }
            : {
                schedule: {
                  start: coreDateBoundary("2026-12-14"),
                  ...(family === "P3" || family === "P4"
                    ? { end: coreDateBoundary("2026-12-17") }
                    : {}),
                },
              }),
          ...(family === "P3"
            ? {
                details: { property_name: "Synthetic lodge" },
                rooms: [
                  {
                    room_id: randomUUID(),
                    category: "Double",
                    quantity: 1,
                    capacity: null,
                  },
                ],
              }
            : {}),
          ...(family === "P4"
            ? { details: { reserved_category: "SUV" }, places: { pickup: place } }
            : {}),
          ...(family === "P6"
            ? { details: { session_label: "Morning" }, entryPlace: place }
            : {}),
        };
        const created = await executeCoreCommandV2(
          storage,
          account,
          trip,
          {
            ...command,
            operationId: randomUUID(),
            command: "CREATE_ITEM",
            target: { kind: "ITEM", id: itemId },
            baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
            payload,
          },
          hash,
        );
        expect(created.projection).toBe("FULL");
        if (created.projection === "FULL")
          expect(created.receipt.outcome, family).toBe("APPLIED");
      }
    } finally {
      proc.stdin.end();
      proc.kill();
    }
  },
  30000,
);
