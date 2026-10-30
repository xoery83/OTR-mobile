import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createSourcePdfRequestScope,
  PDF_SOURCE_REQUEST_SCOPE,
} from "./sourcePdfRequestScope";
import {
  createSourcePdfCausalAuthority,
  createSourcePdfV2CausalAuthority,
} from "./sourcePdfCausalAuthority";
function fixture() {
  const actorId = randomUUID(),
    tripId = randomUUID(),
    controller = new AbortController();
  const readCurrentAccess = vi.fn(async () => ({ actorId, tripId, canReadTrip: true }));
  const input = {
    actorId,
    tripId,
    signal: controller.signal,
    workload: {
      ownerRun: randomUUID(),
      producerId: randomUUID(),
      providerInstanceSha256: "a".repeat(64),
    },
    readCurrentAccess,
  };
  return { ...input, controller, input, scope: createSourcePdfRequestScope(input) };
}
it("issues only a private request fence and revalidates normal Auth/Trip on every access", async () => {
  const f = fixture();
  const first = await f.scope.owner.accountGeneration(f.actorId);
  expect(first).toBeGreaterThan(0);
  expect(await f.scope.owner.accountGeneration(f.actorId)).toBe(first);
  expect(f.readCurrentAccess).toHaveBeenCalledTimes(2);
  const second = createSourcePdfRequestScope(f.input);
  expect(await second.owner.accountGeneration(f.actorId)).not.toBe(first);
  expect(f.scope.owner.authScopeKind).toBe(PDF_SOURCE_REQUEST_SCOPE);
  expect(f.scope.owner).not.toHaveProperty("generation");
  expect(JSON.parse(JSON.stringify(f.scope.owner))).not.toHaveProperty(
    "accountGeneration",
  );
});
it.each(["actor", "trip", "permission"])(
  "request fence grants no access when trusted %s changes",
  async (kind) => {
    const f = fixture();
    f.readCurrentAccess.mockResolvedValue({
      actorId: kind === "actor" ? randomUUID() : f.actorId,
      tripId: kind === "trip" ? randomUUID() : f.tripId,
      canReadTrip: kind !== "permission",
    });
    await expect(f.scope.owner.accountGeneration(f.actorId)).rejects.toThrow(
      "PDF_SCOPE_FORBIDDEN",
    );
  },
);
it("refuses another Actor before reading Auth", async () => {
  const f = fixture();
  await expect(f.scope.owner.accountGeneration(randomUUID())).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(f.readCurrentAccess).not.toHaveBeenCalled();
});
it.each(["abort", "close"])(
  "%s invalidates pending callbacks and every later use",
  async (kind) => {
    const f = fixture();
    let release!: () => void;
    f.readCurrentAccess.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { actorId: f.actorId, tripId: f.tripId, canReadTrip: true };
    });
    const pending = f.scope.owner.accountGeneration(f.actorId);
    if (kind === "abort") f.controller.abort();
    else f.scope.close();
    release();
    await expect(pending).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
    await expect(f.scope.owner.accountGeneration(f.actorId)).rejects.toThrow(
      "PDF_SCOPE_FORBIDDEN",
    );
    expect(f.readCurrentAccess).toHaveBeenCalledOnce();
  },
);
it("keeps the new lifetime semantics closed for V3 and unqualified V4", () => {
  const f = fixture();
  expect(() => createSourcePdfCausalAuthority({} as never, f.scope.owner)).toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  expect(() => createSourcePdfV2CausalAuthority({} as never, f.scope.owner)).toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  expect(() =>
    createSourcePdfV2CausalAuthority({} as never, f.scope.owner, {
      continuousSourceScope: true,
    }),
  ).not.toThrow();
});
