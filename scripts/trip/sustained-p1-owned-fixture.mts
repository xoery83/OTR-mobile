import { createTripPersonCloudCreatePgPort } from "../../backend/src/tripPersonCloudCreatePg";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  createCorePgStorage,
  type CorePgConnection,
  type CorePgLease,
} from "../../backend/src/tripCoreV2PgStorage";
import { createCorePgReader } from "../../backend/src/tripCoreV2PgRead";
import { executeCoreCommandV2 } from "../../backend/src/tripCoreV2Commands";
import { coreDefaults, corePlaceSchema } from "../../src/domain/trip/tripCoreV2";
import { validateCoreReadCollection } from "../../src/domain/trip/tripCoreV2Read";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
const [container, actor, trip, tripCreateOperationId] = process.argv.slice(2);
if (!/^otr-trip-sustained-[a-f0-9]{12}$/.test(container))
  throw Error("OWNED_FIXTURE_REQUIRED");
const literal = (v: unknown) =>
  v === null
    ? "NULL"
    : typeof v === "boolean"
      ? String(v)
      : "'" + String(v).replaceAll("'", "''") + "'";
function connectionFor(
  role: "otr_trip_core_v2_gateway" | "otr_trip_person_command_gateway",
): CorePgConnection {
  return {
    async withLease(work) {
      const proc = spawn(
        "/opt/homebrew/bin/docker",
        [
          "exec",
          "-i",
          "-e",
          "PGPASSWORD=metadata-synthetic-only",
          container,
          "psql",
          "-XqAt",
          "-h",
          "127.0.0.1",
          "-U",
          role,
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
              resolve: (v: { rows: Record<string, unknown>[] }) => void;
              reject: (e: Error) => void;
            }
          | undefined;
      proc.stderr.on("data", (c) => {
        errors += c;
      });
      proc.stdout.on("data", (c) => {
        output += c;
        if (pending && output.includes(pending.marker + "\n")) {
          const text = output.slice(0, output.indexOf(pending.marker)).trim();
          output = output.slice(
            output.indexOf(pending.marker) + pending.marker.length + 1,
          );
          const p = pending;
          pending = undefined;
          try {
            p.resolve({ rows: text ? JSON.parse(text) : [] });
          } catch {
            p.reject(Error(text));
          }
        }
      });
      proc.on("exit", () => pending?.reject(Error(errors || "SQL_SESSION_LOST")));
      const lease: CorePgLease = {
        retire: () => {
          proc.kill();
        },
        query(sql, args = []) {
          if (pending) throw Error("CONCURRENT_FIXTURE_QUERY");
          const bound = sql.replace(/\$(\d+)/g, (_, n) => literal(args[Number(n) - 1]));
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
      try {
        return await work(lease);
      } finally {
        proc.stdin.end();
      }
    },
  };
}
const connection = connectionFor("otr_trip_core_v2_gateway");
const personPort = createTripPersonCloudCreatePgPort(
  connectionFor("otr_trip_person_command_gateway"),
);
const personRequest = {
  version: 1 as const,
  operationId: randomUUID(),
  tripId: trip,
  personId: randomUUID(),
  tripCreateOperationId,
  dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
  displayName: "Actual PgPort Traveler",
};
const personReceipt = await personPort.create(actor, personRequest);
if (
  JSON.stringify(await personPort.receipt(actor, trip, personRequest.operationId)) !==
  JSON.stringify(personReceipt)
)
  throw Error("ACTUAL_PERSON_PGPORT_READBACK_MISMATCH");
if (
  JSON.stringify(await personPort.create(actor, personRequest)) !==
  JSON.stringify(personReceipt)
)
  throw Error("ACTUAL_PERSON_PGPORT_REPLAY_MISMATCH");
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const storage = createCorePgStorage(connection, hash, undefined, { sustainedDev: true }),
  reader = createCorePgReader(connection, hash, undefined, { sustainedDev: true });
const item = randomUUID(),
  checks: string[] = ["actual Person PgPort create + result readback + immutable replay"];
const base = {
  contractVersion: 2,
  intentVersion: 2,
  tripId: trip,
  target: { kind: "ITEM", id: item },
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
};
async function execute(name: string, payload: unknown, revision: number | null) {
  const command = {
    ...base,
    operationId: randomUUID(),
    command: name,
    payload,
    baseVector: [{ kind: "ITEM", id: item, revision }],
  };
  const result = await executeCoreCommandV2(storage, actor, trip, command, hash);
  assert.equal(result.projection, "FULL");
  if (result.projection !== "FULL") throw Error("FULL_RECEIPT_REQUIRED");
  assert.equal(result.receipt.outcome, "APPLIED");
  const replay = await executeCoreCommandV2(storage, actor, trip, command, hash);
  assert.deepEqual(replay, result);
  checks.push(name + " actual PG mutation + immutable replay");
}
const capabilities = await reader.capabilities(actor, trip);
assert.deepEqual(capabilities.enabledFamilies, ["P1"]);
assert.deepEqual(capabilities.enabledCommands, [
  "CREATE_ITEM",
  "SET_ITEM_TEXT",
  "SET_ITEM_SCHEDULE",
  "SET_ITEM_PLACE",
  "SET_ITEM_PARTICIPATION",
]);
await execute(
  "CREATE_ITEM",
  {
    family: "P1",
    core: { title: "PG P1 original" },
    schedule: { start: coreDateBoundary("2026-11-02") },
    ...coreDefaults("organizer"),
  },
  null,
);
await execute("SET_ITEM_TEXT", { title: "PG P1 edited" }, 1);
await execute(
  "SET_ITEM_SCHEDULE",
  { schedule: { start: coreDateBoundary("2026-11-03") } },
  2,
);
const place = corePlaceSchema.parse(
  Object.fromEntries(
    Object.keys(corePlaceSchema.shape).map((key) => [
      key,
      key === "authored_label" ? "Synthetic public park" : null,
    ]),
  ),
);
await execute("SET_ITEM_PLACE", { place }, 3);
await execute(
  "SET_ITEM_PARTICIPATION",
  { participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null } },
  4,
);
const collection = await reader.collection(actor, trip);
const verified = await validateCoreReadCollection(
  collection.manifest,
  collection.pages,
  actor,
  trip,
  hash,
);
const row = verified.graph.itinerary_events.find((entry) => entry.id === item)!;
assert.equal(row.title, "PG P1 edited");
assert.equal(row.semantic_revision, 5);
checks.push("owning full collection validates and reads back edited P1 revision 5");
const wrong = await reader.capabilities(randomUUID(), trip);
assert.equal(wrong.activationState, "CLOSED");
checks.push("cross-Account P1 capabilities remain CLOSED");
console.log(
  JSON.stringify({
    status: "ISOLATED_PG_P1_PASS_NOT_DEV_OR_NATIVE",
    itemId: item,
    checks,
  }),
);
