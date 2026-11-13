// Test-only SQLite fixture for process loss, never imported by a product entry.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createMutationTools, sha } from "../mutation";
import {
  coreHttpBoundary,
  type CoreHttpConnection,
} from "../../backend/src/tripCoreV2Http";
import { emptyCoreGraph, type CoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";

async function main() {
  const [file, mode] = process.argv.slice(2);
  if (!file || !["lose", "recover"].includes(mode))
    throw Error("FIXTURE_ARGUMENTS_REQUIRED");
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS fixture_state (id INTEGER PRIMARY KEY, graph_json TEXT NOT NULL, posts INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS fixture_receipts (operation_id TEXT PRIMARY KEY, domain_id TEXT NOT NULL, receipt_text TEXT NOT NULL); CREATE TABLE IF NOT EXISTS fixture_client_intent (id INTEGER PRIMARY KEY, input_json TEXT NOT NULL, digest TEXT NOT NULL);",
  );
  db.prepare("INSERT OR IGNORE INTO fixture_state VALUES (1,?,0)").run(
    JSON.stringify(emptyCoreGraph()),
  );
  const account = "00000000-0000-4000-8000-000000000001",
    trip = "00000000-0000-4000-8000-000000000002";
  const actor = {
    accountId: account,
    tripId: trip,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  const receipt = (operation: string) =>
    db
      .prepare("SELECT domain_id,receipt_text FROM fixture_receipts WHERE operation_id=?")
      .get(operation) as { domain_id: string; receipt_text: string } | undefined;
  const connection: CoreHttpConnection = {
    hash: async (bytes) => sha(bytes),
    readOperation: async (a, t, id) => {
      const saved = a === account && t === trip ? receipt(id) : undefined;
      return saved
        ? {
            projection: "FULL",
            domainReceiptId: saved.domain_id,
            receipt: JSON.parse(saved.receipt_text),
          }
        : null;
    },
    commands: {
      withLockedCommand: async (scope, work) =>
        work({
          actor: {
            ...actor,
            active: scope.actorAccountId === account && scope.tripId === trip,
          },
          readReceipt: async () => {
            const saved = receipt(scope.operationId);
            return saved
              ? { domainReceiptId: saved.domain_id, receiptText: saved.receipt_text }
              : null;
          },
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["CREATE_ITEM"],
          readLockedGraph: async () =>
            JSON.parse(
              (
                db.prepare("SELECT graph_json FROM fixture_state WHERE id=1").get() as {
                  graph_json: string;
                }
              ).graph_json,
            ) as CoreGraph,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          commit: async (mutation, result) => {
            const domainId = randomUUID();
            db.exec("BEGIN IMMEDIATE");
            try {
              if (mutation)
                db.prepare("UPDATE fixture_state SET graph_json=? WHERE id=1").run(
                  JSON.stringify(mutation.graph),
                );
              db.prepare("INSERT INTO fixture_receipts VALUES (?,?,?)").run(
                scope.operationId,
                domainId,
                JSON.stringify(result),
              );
              db.exec("COMMIT");
            } catch (error) {
              db.exec("ROLLBACK");
              throw error;
            }
            if (mode === "lose") process.exit(86);
            return domainId;
          },
        }),
    },
  };
  const tools = createMutationTools({
    accountId: account,
    clientId: "durable-fixture",
    resource: "http://127.0.0.1/mcp",
    confirm: async (approval) => {
      const saved = db
        .prepare("SELECT digest FROM fixture_client_intent WHERE id=1")
        .get() as { digest: string };
      return approval.digest === saved.digest;
    },
    backend: async (q) => {
      if (q.method === "POST")
        db.prepare("UPDATE fixture_state SET posts=posts+1 WHERE id=1").run();
      return coreHttpBoundary(
        new Request("http://synthetic" + q.path, {
          method: q.method,
          headers: q.headers,
          ...(q.body ? { body: JSON.stringify(q.body) } : {}),
        }),
        account,
        async (a, t) => a === account && t === trip,
        connection,
      );
    },
  });
  if (mode === "lose") {
    const input = {
      request_id: "00000000-0000-4000-8000-000000000003",
      trip_id: trip,
      item: {
        family: "P3",
        title: "Durable QA lodge",
        dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
      },
    };
    const preview = await tools.execute(tools.prepareCreate(input), "PREVIEW");
    db.prepare("INSERT INTO fixture_client_intent VALUES (1,?,?)").run(
      JSON.stringify(input),
      preview.preview_digest,
    );
  }
  const saved = db
    .prepare("SELECT input_json,digest FROM fixture_client_intent WHERE id=1")
    .get() as { input_json: string; digest: string };
  const result = await tools.execute(
    tools.prepareCreate(JSON.parse(saved.input_json)),
    "APPLY",
    saved.digest,
  );
  const state = db
    .prepare("SELECT graph_json,posts FROM fixture_state WHERE id=1")
    .get() as { graph_json: string; posts: number };
  process.stdout.write(
    JSON.stringify({
      result,
      posts: state.posts,
      itemCount: (JSON.parse(state.graph_json) as CoreGraph).itinerary_events.length,
      receiptCount: db.prepare("SELECT COUNT(*) AS n FROM fixture_receipts").get()!.n,
    }) + "\n",
  );
  db.close();
}
main().catch((error) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
