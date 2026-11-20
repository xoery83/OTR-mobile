import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  mcpBetaConsentConfigSchema,
  type McpBetaConsentConfig,
} from "./mcpOAuthConsentRepository";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
} from "../api/requestBoundary";
import {
  operationApprovalViewSchema,
  operationApprovalDecisionSchema,
  type OperationApprovalView,
} from "../api/mcpOperationApprovalContracts";
import { z } from "zod";
export function createMcpOperationApprovalRepository(
  rawConfig: McpBetaConsentConfig,
  id: string,
  supplied?: SupabaseClient,
) {
  const config = mcpBetaConsentConfigSchema.parse(rawConfig),
    origin = new URL(config.authOrigin).origin;
  z.uuid().parse(id);
  const lifetime = new AbortController();
  let closed = false,
    busy = false,
    active: Promise<unknown> | undefined,
    closeTask: Promise<void> | undefined,
    view: OperationApprovalView | undefined;
  function current() {
    if (closed || Date.now() >= config.expiresAt)
      throw Error("OPERATION_APPROVAL_CLOSED");
  }
  const client =
    supplied ??
    createClient(origin, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          if (url.origin !== origin || !url.pathname.startsWith("/auth/v1/"))
            throw Error("OPERATION_APPROVAL_ORIGIN");
          const logout = url.pathname === "/auth/v1/logout",
            sessionResponse = ["/auth/v1/verify", "/auth/v1/token"].includes(
              url.pathname,
            );
          if (!logout) current();
          const boundary = createRequestBoundary(10000, lifetime.signal);
          try {
            const response = await boundary.run(() =>
              fetch(input, {
                ...init,
                credentials: "omit",
                redirect: "error",
                signal: boundary.signal,
              }),
            );
            const bytes = [204, 205].includes(response.status)
              ? null
              : await readBoundedBytes(response, 65536, boundary);
            if (!logout && !sessionResponse) current();
            return new Response(bytes ? new Uint8Array(bytes).buffer : null, {
              status: response.status,
              headers: response.headers,
            });
          } finally {
            boundary.close();
          }
        },
      },
    });
  async function run<T>(work: () => Promise<T>): Promise<T> {
    current();
    if (busy) throw Error("OPERATION_APPROVAL_BUSY");
    busy = true;
    const task = Promise.resolve().then(work);
    active = task;
    try {
      const result = await task;
      current();
      return result;
    } finally {
      busy = false;
      if (active === task) active = undefined;
    }
  }
  async function api(decision?: boolean) {
    current();
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Error("NORMAL_AUTH_REQUIRED");
    const boundary = createRequestBoundary(10000, lifetime.signal);
    try {
      const response = await boundary.run(() =>
        fetch(origin + "/mcp/operation-approvals/" + id, {
          method: decision === undefined ? "GET" : "POST",
          headers: {
            Authorization: "Bearer " + data.session!.access_token,
            "Content-Type": "application/json",
            ...(decision === undefined
              ? {}
              : { "X-OTR-Operation-Context": view?.csrfContext ?? "" }),
          },
          ...(decision === undefined
            ? {}
            : { body: JSON.stringify({ decision: decision ? "APPROVE" : "DECLINE" }) }),
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: boundary.signal,
        }),
      );
      const raw = await readBoundedJson(response, 65536, boundary);
      if (!response.ok) throw Error("OPERATION_APPROVAL_UNAVAILABLE");
      current();
      return raw;
    } finally {
      boundary.close();
    }
  }
  async function load() {
    view = operationApprovalViewSchema.parse(await api());
    return view;
  }
  function close() {
    if (closeTask) return closeTask;
    closed = true;
    const pending = active;
    closeTask = (async () => {
      try {
        await pending?.catch(() => undefined);
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw Error("OPERATION_APPROVAL_LOGOUT_FAILED");
      } finally {
        lifetime.abort();
      }
    })();
    return closeTask;
  }
  return Object.freeze({
    requestCode(email: string) {
      return run(async () => {
        const { error } = await client.auth.signInWithOtp({
          email: z.email().parse(email),
          options: { shouldCreateUser: false },
        });
        if (error) throw Error("OTP_FAILED");
      });
    },
    verifyCode(email: string, code: string) {
      return run(async () => {
        const { error } = await client.auth.verifyOtp({
          email: z.email().parse(email),
          token: z
            .string()
            .regex(/^\d{8}$/)
            .parse(code),
          type: "email",
        });
        if (error) throw Error("OTP_FAILED");
        return load();
      });
    },
    load() {
      return run(load);
    },
    decide(allow: boolean) {
      return run(async () => {
        if (!view || view.state !== "PENDING" || !view.csrfContext || view.completed)
          throw Error("OPERATION_APPROVAL_CONTEXT_CHANGED");
        return operationApprovalDecisionSchema.parse(await api(allow));
      });
    },
    close,
  });
}
