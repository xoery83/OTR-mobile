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
export type PlaceSearchBinding = Readonly<{
  accountId: string;
  tripId: string;
  editorId: string;
  accountGeneration: number;
  isCurrent(): boolean;
}>;
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
  for (const value of [binding.accountId, binding.tripId, binding.editorId])
    z.uuid().parse(value);
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
    const cancel = () => native.cancel(sessionId, requestGeneration);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
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
    } finally {
      signal?.removeEventListener("abort", cancel);
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
export async function readApplePlaceProvider(binding: PlaceSearchBinding) {
  const { requireNativeModule } = await import("expo");
  let native: ApplePlaceNative;
  try {
    native = requireNativeModule<ApplePlaceNative>("OTRPlaceSearch");
  } catch {
    throw new ApplePlaceError("NATIVE_UNAVAILABLE");
  }
  return createApplePlaceProvider(native, binding);
}
