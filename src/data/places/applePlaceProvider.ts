import { z } from "zod";
import { createUuid } from "@/domain/localId";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

// Ported verbatim from frozen Lab query.ts (c01057e1…); no provider-specific query fields.
export function normalizePlaceQuery(original: string) {
  const phrase = original
    .normalize("NFKC")
    .replace(/[’‘ʼ]/gu, "'")
    .replace(/[‐‑–—]/gu, "-")
    .trim()
    .replace(/\s+/gu, " ");
  const comparison = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const tokens: string[] = Array.from(
    comparison.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? [],
  );
  return { original, phrase, comparison, tokens };
}
const point = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
const candidateSchema = z.strictObject({
  provider: z.literal("apple"),
  handle: z.uuid(),
  kind: z.enum(["completion", "mapItem"]),
  title: z.string().max(2048),
  secondary: z.string().max(4096),
  address: z.string().max(4096).optional(),
  point: point.optional(),
  category: z.string().max(256).optional(),
  providerPlaceId: z.string().min(1).max(1024).optional(),
});
const responseSchema = z.strictObject({
  status: z.enum([
    "READY",
    "NO_RESULTS",
    "CANCELLED",
    "NETWORK_ERROR",
    "ERROR",
    "TIMED_OUT",
    "INVALID_REQUEST",
    "STALE_HANDLE",
    "THROTTLED",
  ]),
  candidates: z.array(candidateSchema).max(20),
  provider: z.literal("apple").optional(),
  sessionId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  nativeError: z
    .strictObject({ domain: z.string().max(128), code: z.number().int() })
    .optional(),
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});
export type ApplePlaceCandidate = Readonly<
  z.infer<typeof candidateSchema> & { sessionId: string; generation: number }
>;
export type ApplePlaceQuery = {
  text: string;
  locale?: string;
  region?: z.infer<typeof point>;
};
export type PlaceSearchBinding = Readonly<
  {
    accountId: string;
    editorId: string;
    accountGeneration: number;
    isCurrent(): boolean;
  } & ({ tripId: string; draftId?: never } | { draftId: string; tripId?: never })
>;
function assertPlaceSearchBinding(binding: PlaceSearchBinding) {
  const trip = "tripId" in binding;
  const draft = "draftId" in binding;
  if (trip === draft) throw new ApplePlaceError("INVALID_BINDING");
  for (const value of [
    binding.accountId,
    binding.editorId,
    trip ? binding.tripId : binding.draftId,
  ])
    z.uuid().parse(value);
}
export type ApplePlaceNative = {
  complete(input: Record<string, unknown>): Promise<unknown>;
  search(input: Record<string, unknown>): Promise<unknown>;
  resolve(input: Record<string, unknown>): Promise<unknown>;
  cancel(sessionId: string, generation: number): void;
};
export class ApplePlaceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function createApplePlaceProvider(
  native: ApplePlaceNative,
  binding: PlaceSearchBinding,
  id = createUuid,
) {
  assertPlaceSearchBinding(binding);
  const sessionId = id();
  let generation = 0,
    closed = false;
  const current = () =>
    !closed &&
    binding.isCurrent() &&
    getAccountGeneration() === binding.accountGeneration;
  function assertCurrent(signal?: AbortSignal) {
    if (!current() || signal?.aborted) throw new ApplePlaceError("CANCELLED");
  }
  async function invoke(
    kind: "complete" | "search" | "resolve",
    query: ApplePlaceQuery,
    signal?: AbortSignal,
    selected?: ApplePlaceCandidate,
  ) {
    let cancel: (() => void) | undefined;
    try {
      assertCurrent(signal);
      const text = normalizePlaceQuery(query.text).phrase;
      if (
        selected &&
        (selected.sessionId !== sessionId || selected.generation !== generation)
      )
        throw new ApplePlaceError("STALE_HANDLE");
      const requestGeneration = kind === "resolve" ? generation : ++generation;
      if (kind !== "resolve" && (!text || new TextEncoder().encode(text).length > 2048)) {
        native.cancel(sessionId, requestGeneration - 1);
        if (text) throw new ApplePlaceError("INVALID_REQUEST");
        return [];
      }
      const requestId = id();
      let region: z.infer<typeof point> | undefined;
      if (query.region) {
        region = point.parse(query.region);
        if (!region.latitude && !region.longitude) region = undefined;
      }
      cancel = () => native.cancel(sessionId, requestGeneration);
      signal?.addEventListener("abort", cancel, { once: true });
      const response = responseSchema.parse(
        await native[kind]({
          sessionId,
          requestId,
          generation: requestGeneration,
          text,
          ...(region ? { region } : {}),
          ...(selected ? { handle: selected.handle } : {}),
        }),
      );
      assertCurrent(signal);
      if (
        requestGeneration !== generation ||
        response.sessionId !== sessionId ||
        response.requestId !== requestId ||
        response.generation !== generation ||
        response.provider !== "apple"
      )
        throw new ApplePlaceError("CANCELLED");
      if (response.status === "NO_RESULTS") return [];
      if (response.status !== "READY") throw new ApplePlaceError(response.status);
      return response.candidates
        .slice(0, kind === "complete" ? 5 : kind === "resolve" ? 1 : 20)
        .map((value): ApplePlaceCandidate =>
          Object.freeze({ ...value, sessionId, generation: requestGeneration }),
        );
    } catch (error) {
      reportApplePlaceFailure(kind.toUpperCase(), error);
      throw error;
    } finally {
      if (cancel) signal?.removeEventListener("abort", cancel);
    }
  }
  return {
    complete: (query: ApplePlaceQuery, signal?: AbortSignal) =>
      invoke("complete", query, signal),
    search: (query: ApplePlaceQuery, signal?: AbortSignal) =>
      invoke("search", query, signal),
    async resolve(
      selected: ApplePlaceCandidate,
      query: ApplePlaceQuery,
      signal?: AbortSignal,
    ) {
      const rows = await invoke("resolve", query, signal, selected);
      const result = rows[0];
      if (!result || result.kind !== "mapItem") throw new ApplePlaceError("NO_RESULTS");
      return result;
    },
    cancel() {
      native.cancel(sessionId, generation);
      generation++;
    },
    close() {
      closed = true;
      native.cancel(sessionId, generation);
      generation++;
    },
  };
}
// Only bounded capability/error categories: never include query, account or native error text.
export function applePlaceFailureDiagnostic(phase: string, error: unknown) {
  const allowed = [
    "NATIVE_UNAVAILABLE",
    "NATIVE_MODULE_MISSING",
    "LOADER_EXPORT_MISSING",
    "INVALID_BINDING",
    "CANCELLED",
    "INVALID_REQUEST",
    "NETWORK_ERROR",
    "TIMED_OUT",
    "STALE_HANDLE",
    "THROTTLED",
    "NO_RESULTS",
  ];
  return {
    event: "apple_place_failure",
    phase: [
      "READ_CONTEXT",
      "LOAD_QUICK",
      "LOAD_MORE",
      "INIT_CONTROLLER",
      "LOAD_MODULE",
      "IMPORT_CORE",
      "LOOKUP_MODULE",
      "COMPLETE",
      "SEARCH",
      "RESOLVE",
    ].includes(phase)
      ? phase
      : "UNKNOWN",
    code:
      error instanceof ApplePlaceError && allowed.includes(error.code)
        ? error.code
        : "UNKNOWN",
    errorType:
      error instanceof Error &&
      ["TypeError", "ReferenceError", "ZodError", "Error"].includes(error.name)
        ? error.name
        : "UNKNOWN",
    textEncoderAvailable: typeof TextEncoder === "function",
  };
}
export function reportApplePlaceFailure(phase: string, error: unknown) {
  if (typeof __DEV__ !== "undefined" && __DEV__)
    console.info(applePlaceFailureDiagnostic(phase, error));
}
export async function readApplePlaceProvider(binding: PlaceSearchBinding) {
  assertPlaceSearchBinding(binding);
  let native: ApplePlaceNative;
  let phase = "IMPORT_CORE";
  try {
    const { requireNativeModule } = await import("expo-modules-core");
    phase = "LOOKUP_MODULE";
    if (typeof requireNativeModule !== "function")
      throw new ApplePlaceError("LOADER_EXPORT_MISSING");
    native = requireNativeModule<ApplePlaceNative>("OTRPlaceSearch");
  } catch (error) {
    const classified =
      error instanceof Error &&
      error.message === "Cannot find native module 'OTRPlaceSearch'"
        ? new ApplePlaceError("NATIVE_MODULE_MISSING")
        : error;
    reportApplePlaceFailure(phase, classified);
    throw new ApplePlaceError("NATIVE_UNAVAILABLE");
  }
  return createApplePlaceProvider(native, binding);
}
