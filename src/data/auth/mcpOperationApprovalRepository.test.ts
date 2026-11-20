import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMcpOperationApprovalRepository } from "./mcpOperationApprovalRepository";
import intent from "../../../backend/src/__fixtures__/mcpOperationApprovalIntent.json";
const config = {
  authOrigin: "https://owned.invalid/",
  publishableKey: "x." + btoa(JSON.stringify({ role: "anon" })) + "." + "x".repeat(40),
  expiresAt: Date.now() + 60000,
  businessAccess: "BETA_READ_WRITE" as const,
};
function fixture() {
  let session: any = null;
  const auth = {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => {
      session = { access_token: "synthetic-normal-test-only" };
      return { error: null };
    }),
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => {
      session = null;
      return { error: null };
    }),
  };
  return {
    auth,
    client: { auth } as unknown as SupabaseClient,
    session: () => session,
    install: () => {
      session = { access_token: "synthetic-late-session-only" };
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it("closing while OTP verifies waits for late session then logs it out, without a late API request", async () => {
  const f = fixture();
  let release!: () => void;
  f.auth.verifyOtp.mockImplementation(async () => {
    await new Promise<void>((r) => (release = r));
    f.install();
    return { error: null };
  });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const repo = createMcpOperationApprovalRepository(config, randomUUID(), f.client);
  const verification = repo.verifyCode("synthetic@example.invalid", "12345678");
  await Promise.resolve();
  const close = repo.close();
  release();
  await expect(verification).rejects.toThrow();
  await close;
  expect(f.auth.signOut).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  expect(f.session()).toBeNull();
});
it("ambiguous decision does not resend POST; only explicit original GET recovery reads the recorded state", async () => {
  const f = fixture(),
    id = randomUUID();
  let approved = false,
    posts = 0;
  const view = () => ({
    id,
    state: approved ? "APPROVED" : "PENDING",
    accountId: intent.accountId,
    clientId: intent.clientId,
    clientName: "Synthetic app",
    resource: intent.resource,
    tripId: intent.tripId,
    operationId: intent.operationId,
    digest: "a".repeat(64),
    call: {
      request: {
        formatVersion: 3,
        operationId: intent.operationId,
        tripId: intent.tripId,
        before: intent.before,
        after: intent.after,
        expectedMetadataRevision: 2,
      },
    },
    completed: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    decisionAt: null,
    csrfContext: "synthetic-csrf-context",
  });
  const fetcher = vi.fn(async (_input: unknown, init: any) => {
    expect(init.headers.Authorization).toBe("Bearer synthetic-normal-test-only");
    if (init.method === "POST") {
      posts++;
      expect(init.headers["X-OTR-Operation-Context"]).toBe("synthetic-csrf-context");
      approved = true;
      throw Error("synthetic response lost");
    }
    return Response.json(view());
  });
  vi.stubGlobal("fetch", fetcher);
  const repo = createMcpOperationApprovalRepository(config, id, f.client);
  await repo.verifyCode("synthetic@example.invalid", "12345678");
  await expect(repo.decide(true)).rejects.toThrow();
  expect(posts).toBe(1);
  expect((await repo.load()).state).toBe("APPROVED");
  expect(posts).toBe(1);
  await repo.close();
  expect(f.auth.signOut).toHaveBeenCalledTimes(1);
});
