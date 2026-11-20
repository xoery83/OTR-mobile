import {
  createDevBackendHandler,
  type BackendDependencies,
  type AuthenticatedUser,
} from "./app";
import { isNormalAccount } from "./authAccountQualification";
import type { OAuthGrant } from "../../mcp/oauth";
import type { BetaBackend } from "../../mcp/beta";
import registry from "../../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";

export type BetaPrincipalVerifier = (
  grant: OAuthGrant,
  signal: AbortSignal,
  evidence: Readonly<{ accessToken: string }>,
) => Promise<AuthenticatedUser | null>;
// Runs inside Backend after signature/audience/consent verification, not an upstream bearer proxy.
class McpPrincipalRejected extends Error {}

export function createMcpBetaAccountBinding(
  dependencies: Omit<BackendDependencies, "managedWriteAdmissionVersion"> & {
    managedWriteAdmissionVersion?: 1 | 2;
  },
  verifyPrincipal: BetaPrincipalVerifier,
  metadataPort?: (
    grant: OAuthGrant,
  ) => NonNullable<BackendDependencies["tripMetadataV2Port"]>,
  lifecyclePort?: (
    grant: OAuthGrant,
  ) => NonNullable<BackendDependencies["tripLifecyclePort"]>,
  acceptanceResponseLoss?: (
    grant: OAuthGrant,
    input: Parameters<BetaBackend>[0],
    response: Response,
  ) => Promise<void>,
  buildBackend = createDevBackendHandler,
  preserveCompletedWriteReceipt = false,
  allowManagedWrite?: (input: Parameters<BetaBackend>[0], grant: OAuthGrant) => boolean,
) {
  return async (
    input: OAuthGrant,
    parent: AbortSignal,
    inputEvidence: Readonly<{ accessToken: string }>,
  ) => {
    const grant = Object.freeze({ ...input, scopes: Object.freeze([...input.scopes]) });
    const evidence = Object.freeze({ ...inputEvidence });
    const origin = new URL(grant.resource).origin;
    const current = async (signal: AbortSignal) => {
      signal.throwIfAborted();
      if (grant.expiresAt <= Date.now()) throw new McpPrincipalRejected();
      const account = await verifyPrincipal(grant, signal, evidence);
      signal.throwIfAborted();
      if (
        !account ||
        account.id !== grant.accountId ||
        !isNormalAccount(account) ||
        grant.expiresAt <= Date.now()
      )
        throw new McpPrincipalRejected();
      return account;
    };
    await current(parent);
    const backend: BetaBackend = async (input, signal) => {
      const fail = (status: number, code: string) =>
        Response.json(
          { error: { code } },
          { status, headers: { "Cache-Control": "private, no-store" } },
        );
      const requestDeadline = AbortSignal.any([parent, signal]);
      const combined = AbortSignal.any([
        requestDeadline,
        AbortSignal.timeout(Math.max(1, grant.expiresAt - Date.now())),
      ]);
      let enteredWrite = false;
      try {
        const url = new URL(input.path, origin);
        if (url.origin !== origin || input.path !== url.pathname + url.search || url.hash)
          return fail(400, "INVALID_PAYLOAD");
        const route = registry.capabilities.find(
          (c) =>
            c.method === input.method &&
            new RegExp("^" + c.path.replace(/\{\w+\}/g, "[^/]+") + "$").test(
              url.pathname,
            ),
        );
        if (!route) return fail(404, "CAPABILITY_NOT_IN_BETA");
        const write = route.effect === "WRITE";
        const preserveReceipt = write && preserveCompletedWriteReceipt;
        const writeAllowed = () => !allowManagedWrite || allowManagedWrite(input, grant);
        if (
          !grant.scopes.includes("otr.trips.read") ||
          (write && !grant.scopes.includes("otr.trips.write"))
        )
          return fail(403, "MCP_SCOPE_REQUIRED");
        if (preserveReceipt && !writeAllowed())
          return fail(403, "MCP_WRITE_ADMISSION_CLOSED");
        if (
          Object.keys(input.headers ?? {}).some(
            (name) =>
              ![
                "idempotency-key",
                "x-otr-core-contract-version",
                "otr-trip-create-version",
                "otr-trip-metadata-version",
              ].includes(name.toLowerCase()) &&
              !(route.capabilityId === "otr.trip.get" && name.toLowerCase() === "otr-metadata-operation-id"),
          )
        )
          return fail(400, "INVALID_HEADERS");
        const headers = new Headers(input.headers);
        const { managedWriteAdmissionVersion, ...backendDependencies } = dependencies;
        const extended = managedWriteAdmissionVersion === 2;
        const originalTarget = preserveReceipt
          ? /^\/v2\/trips\/([^/]+)\/(metadata|core\/commands)$/.exec(url.pathname)
          : null;
        const extendedTrip = preserveReceipt && extended
          ? /^\/v2\/trips\/([^/]+)\/(?:lifecycle|ledger\/journey-currency\/commit|expenses(?:\/[^/]+(?:\/(?:restore|valuations|payment-records|conflict-resolution))?)?)$/.exec(url.pathname)
          : null;
        const create = preserveReceipt && extended &&
          route.capabilityId === "otr.trip.create" && headers.get("OTR-Trip-Create-Version") === "2";
        const trip = coreUuid.safeParse(originalTarget?.[1] ?? extendedTrip?.[1] ??
          (create ? (input.body as { tripId?: unknown } | null)?.tripId : undefined));
        if (
          preserveReceipt &&
          (!managedWriteAdmissionVersion || !trip.success ||
            (originalTarget?.[2] === "metadata" &&
              !["2", "3"].includes(headers.get("OTR-Trip-Metadata-Version") ?? "")))
        )
          return fail(403, "MCP_WRITE_ADMISSION_CLOSED");
        const encoded = input.body === undefined ? undefined : JSON.stringify(input.body);
        const intent =
          preserveReceipt && encoded
            ? canonicalCoreJson(JSON.parse(encoded) as Json)
            : null;
        const operationId = preserveReceipt
          ? headers.get("Idempotency-Key")
          : null;
        const managedWriteAdmission = preserveReceipt && trip.success
          ? async (
              actor: string,
              actual: Readonly<{ operationId: string; tripId: string }>,
              wireBody?: unknown,
            ) =>
              !!operationId &&
              intent !== null &&
              actual.operationId === operationId &&
              actual.tripId === trip.data &&
              actor === grant.accountId &&
              canonicalCoreJson((wireBody ?? actual) as Json) === intent &&
              writeAllowed() &&
              !!(await current(combined).catch(() => null)) &&
              writeAllowed()
          : undefined;
        const managedMetadataWrite = managedWriteAdmission !== undefined &&
          originalTarget?.[2] === "metadata";
        const currentAccount = await current(combined);
        // Reuse every formal HTTP route, domain validator, ACL, CAS and immutable receipt.
        const handle = buildBackend({
          ...backendDependencies,
          ...(metadataPort ? { tripMetadataV2Port: metadataPort(grant) } : {}),
          ...(lifecyclePort ? { tripLifecyclePort: lifecyclePort(grant) } : {}),
          mcpHttp: undefined,
          ...(managedWriteAdmission ? { managedWriteAdmission } : {}),
          gateway: {
            ...dependencies.gateway,
            validateAccessToken: async (token) => {
              if (token !== evidence.accessToken) return null;
              if (!write || managedMetadataWrite) {
                // Reuse this dispatch's live check. The Metadata transaction still rechecks on admission.
                if (managedMetadataWrite && combined.aborted) return null;
                combined.throwIfAborted();
                return grant.expiresAt > Date.now() ? currentAccount : null;
              }
              return preserveReceipt
                ? current(combined).catch(() => null)
                : current(combined);
            },
          },
        });
        const request = new Request(url, {
          method: input.method,
          signal: preserveReceipt ? requestDeadline : combined,
          headers: {
            ...input.headers,
            Authorization: `Bearer ${evidence.accessToken}`,
            "Content-Type": "application/json",
          },
          ...(encoded === undefined ? {} : { body: encoded }),
        });
        enteredWrite = write;
        const response = await handle(request);
        if (managedMetadataWrite && response.status === 401) {
          const body = await response.clone().json().catch(() => null);
          const code = body?.error?.code;
          const id = coreUuid.safeParse(response.headers.get("X-Request-Id"));
          console.info(JSON.stringify({
            event: "mcp_metadata_authorization_rejected",
            ...(id.success ? { requestId: id.data } : {}),
            stage: code === "INVALID_SESSION"
              ? "route"
              : code === "MCP_WRITE_ADMISSION_DENIED" ? "admission" : "unclassified",
          }));
        }
        if (preserveReceipt) requestDeadline.throwIfAborted();
        else await current(combined);
        await acceptanceResponseLoss?.(grant, input, response);
        return response;
      } catch (error) {
        // A suppressed response after entering a writer cannot prove non-commit.
        if (enteredWrite) return fail(503, "MCP_WRITE_UNAVAILABLE_QUERY_ORIGINAL");
        if (error instanceof McpPrincipalRejected) return fail(401, "MCP_AUTH_REQUIRED");
        console.info(JSON.stringify({ event: "mcp_backend_request_unavailable", method: input.method }));
        return fail(503, "MCP_REQUEST_UNAVAILABLE");
      }
    };
    return Object.freeze({
      betaBackend: backend,
      read: (path: string, signal: AbortSignal) =>
        backend({ method: "GET", path }, signal),
    });
  };
}
