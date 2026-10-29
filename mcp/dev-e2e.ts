// Explicit interactive DEV acceptance runner. Fresh normal OTP only; no Session files/Keychain.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  requestSupabaseDevEmailOtp,
  verifySupabaseDevEmailOtp,
  revokeSupabaseDevSession,
  SupabaseDevAuthError,
} from "../src/data/auth/devSupabaseAuth";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";
import { internalSessionAuthorizer, DEV_AUTH, DEV_BACKEND } from "./internal";
import { itemSchema } from "./contract";

const fixtureTrip = "825f79b2-4a9d-4535-a62e-43000ca50c4a";
const sha = (v: unknown) =>
  createHash("sha256")
    .update(canonicalCoreJson(v as Json))
    .digest("hex");
export async function runDevAcceptance(publicEnvironmentFile: string) {
  const publicText = readFileSync(publicEnvironmentFile, "utf8");
  const key = publicText
    .match(/^EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY=(.+)$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  assert(key && key.startsWith("sb_publishable_"), "DEV_PUBLIC_CONFIGURATION_REQUIRED");
  const options = {
    url: DEV_AUTH,
    publishableKey: key,
    persistSession: async () => assert.fail("NO_SESSION_INSTALL"),
    readSession: async () => null,
  };
  type Session = Awaited<ReturnType<typeof verifySupabaseDevEmailOtp>>;
  const logins = new Map<
    string,
    { email: string; session?: Session; requestedAt?: number }
  >();
  let handle: ReturnType<typeof createMcpHandler>;
  const server = loopbackServer((request) => handle(request));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const resource = `http://127.0.0.1:${address.port}/mcp`;
  handle = createMcpHandler({ resource, authorize: internalSessionAuthorizer(key) });
  const output = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
  const clients: Client[] = [];
  async function client(label: string) {
    const session = logins.get(label)?.session;
    assert(session, "LOGIN_REQUIRED");
    const c = new Client({ name: "otr-mcp01-internal-qa-" + label, version: "1" });
    clients.push(c);
    await c.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        requestInit: { headers: { Authorization: "Bearer " + session.accessToken } },
      }),
    );
    return c;
  }
  async function call(c: Client, name: string, args: Record<string, unknown>) {
    return c.callTool({ name, arguments: args });
  }
  const data = (r: unknown) => {
    const q = r as {
      structuredContent?: Record<string, unknown>;
      result?: Record<string, unknown>;
      isError?: boolean;
    };
    assert(!q.isError, "TOOL_FAILED");
    return q.structuredContent ?? q.result ?? {};
  };
  async function direct(session: Session, path: string) {
    const response = await fetch(DEV_BACKEND + path, {
      headers: { Authorization: "Bearer " + session.accessToken },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    return response;
  }
  output({
    state: "READY_FOR_NORMAL_OTP",
    scope: "INTERNAL_SESSION_TEST_ONLY",
    fixtureTrip,
  });
  try {
    for await (const line of createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    })) {
      try {
        const q = z
          .discriminatedUnion("action", [
            z.strictObject({
              action: z.literal("request"),
              label: z.enum(["A", "B"]),
              email: z.email(),
            }),
            z.strictObject({
              action: z.literal("verify"),
              label: z.enum(["A", "B"]),
              code: z.string().regex(/^\d{8}$/),
            }),
            z.strictObject({ action: z.literal("run") }),
            z.strictObject({ action: z.literal("close") }),
          ])
          .parse(JSON.parse(line));
        if (q.action === "close") break;
        if (q.action === "request") {
          const previous = logins.get(q.label);
          assert(!previous?.session, "ALREADY_AUTHENTICATED");
          assert(
            !previous ||
              (previous.email === q.email &&
                Date.now() - (previous.requestedAt ?? 0) >= 60000),
            "OTP_COOLDOWN",
          );
          await requestSupabaseDevEmailOtp(q.email, options);
          logins.set(q.label, { email: q.email, requestedAt: Date.now() });
          output({ state: "OTP_REQUESTED", label: q.label });
        } else if (q.action === "verify") {
          const login = logins.get(q.label);
          assert(login && !login.session, "REQUEST_REQUIRED");
          login.session = await verifySupabaseDevEmailOtp(login.email, q.code, options);
          output({
            state: "NORMAL_LOGIN_VERIFIED",
            label: q.label,
            accountId: login.session.identity!.userId,
          });
        } else {
          const sessionA = logins.get("A")?.session,
            sessionB = logins.get("B")?.session;
          assert(sessionA && sessionB, "BOTH_LOGINS_REQUIRED");
          assert.notEqual(
            sessionA.identity!.userId,
            sessionB.identity!.userId,
            "DISTINCT_ACCOUNTS_REQUIRED",
          );
          const ca = await client("A"),
            cb = await client("B");
          const discovered = await ca.listTools();
          assert.equal(discovered.tools.length, 4);
          const listed = data(await call(ca, "list_trips", {}));
          const page = await direct(sessionA, "/v2/trips?limit=20");
          assert.equal(page.status, 200);
          const independentTrips = await page.json();
          assert.equal(sha(listed.trips), sha(independentTrips.trips));
          const selected = await call(ca, "get_trip", { trip_id: fixtureTrip });
          if ((selected as { isError?: boolean }).isError) {
            output({
              state: "BLOCKED_BY_OWNING_INTERFACE",
              reason: "FIXED_SYNTHETIC_TRIP_NOT_VISIBLE_TO_ACCOUNT_A",
              discovery: "PASS",
              accountA: sessionA.identity!.userId,
              accountB: sessionB.identity!.userId,
            });
            continue;
          }
          const all = data(
            await call(ca, "list_trip_items", { trip_id: fixtureTrip, limit: 25 }),
          );
          const items = z.array(itemSchema).parse(all.items);
          assert(items.length > 0, "FIXTURE_ITEMS_REQUIRED");
          const families = [...new Set(items.map((i) => i.family))].sort();
          for (const item of items) {
            const detailed = data(
              await call(ca, "get_trip_item", {
                trip_id: fixtureTrip,
                item_id: item.itemId,
              }),
            );
            const response = await direct(
              sessionA,
              `/v2/trips/${fixtureTrip}/core/objects/ITEM/${item.itemId}`,
            );
            assert.equal(response.status, 200);
            assert.equal(
              sha(detailed.item),
              sha(itemSchema.parse(await response.json())),
            );
          }
          const denied = await call(cb, "get_trip_item", {
            trip_id: fixtureTrip,
            item_id: items[0].itemId,
          });
          assert.equal(
            (denied as { isError?: boolean }).isError,
            true,
            "B_MUST_NOT_READ_A_PRIVATE_FIXTURE",
          );
          const negative = await direct(
            sessionB,
            `/v2/trips/${fixtureTrip}/core/objects/ITEM/${items[0].itemId}`,
          );
          assert([403, 404].includes(negative.status));
          const foreign = await call(ca, "get_trip_item", {
            trip_id: "00000000-0000-4000-8000-000000000001",
            item_id: items[0].itemId,
          });
          assert.equal((foreign as { isError?: boolean }).isError, true);
          const unauth = await fetch(resource, { method: "POST", body: "{}" });
          assert.equal(unauth.status, 401);
          output({
            state:
              families.length === 6
                ? "INTERNAL_DEV_READ_PASS"
                : "INTERNAL_DEV_PARTIAL_FAMILY_COVERAGE",
            oauth: "NOT_TESTED",
            clients: "STANDARD_SDK_HTTP",
            families,
            itemCount: items.length,
            independentBackendReadback: "HASH_MATCH",
            crossAccount: negative.status,
            crossTrip: "DENIED",
            mutations: "NO_MUTATION_PATH_IN_RUNNER",
            itemsSha256: sha(items),
            fixtureTrip,
          });
        }
      } catch (error) {
        output({
          state: "STEP_FAILED",
          category:
            error instanceof SupabaseDevAuthError
              ? error.kind
              : "ASSERTION_OR_UNAVAILABLE",
        });
      }
    }
  } finally {
    await Promise.allSettled(clients.map((c) => c.close()));
    for (const [label, login] of logins)
      if (login.session?.accessToken) {
        try {
          await revokeSupabaseDevSession(login.session.accessToken, options);
          output({ state: "OWN_TEST_SESSION_REVOKED", label });
        } catch {
          output({ state: "OWN_TEST_SESSION_REVOCATION_UNCONFIRMED", label });
        }
      }
    logins.clear();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  assert(path, "PUBLIC_CONFIGURATION_FILE_REQUIRED");
  await runDevAcceptance(path);
}
