import { randomUUID } from "node:crypto";
import { emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import type {
  CoreAcceptedCertificate,
  CoreAcceptedSnapshot,
} from "../repositories/tripCoreV2Repository";
import type { CoreReadTransport } from "../api/tripCoreV2Transport";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import {
  createTripDownstreamCoordinator,
  refreshCoreDownstream,
} from "./tripDownstreamCoordinator";
import { acceptedVisibleVersion, tripVisibleVersionRead } from "./tripVisibleVersionRead";
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));

function fixture() {
  const context = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    generation: getAccountGeneration(),
  };
  const certificate: CoreAcceptedCertificate = {
    epoch: randomUUID(),
    revision: "1",
    access_revision: 2,
    actor_person_binding_hash: "a".repeat(64),
    roster_hash: "b".repeat(64),
    manifest_sha256: "c".repeat(64),
    ordinary_order_version: 0,
    applied_generation: 1,
  };
  let current: CoreAcceptedSnapshot | null = { certificate } as CoreAcceptedSnapshot;
  const core = {
    acceptedSnapshot: vi.fn(async () => current),
    refresh: vi.fn(async (context: AccountRequestContext, read: CoreReadTransport) => {
      const result = await read.collection(context);
      current = {
        certificate: { ...certificate, revision: "2" },
      } as CoreAcceptedSnapshot;
      return { ...result, graph: emptyCoreGraph(), records: [], bindings: [] };
    }),
  };
  const collection = vi.fn(async () => ({
    manifest: {
      epoch: certificate.epoch,
      revision: 2,
      accessRevision: certificate.access_revision,
      actorPersonBindingHash: certificate.actor_person_binding_hash,
      participatingRosterHash: certificate.roster_hash,
    },
    pages: [],
  }));
  const transport = { collection } as unknown as CoreReadTransport;
  const version = vi.fn(
    async (scope = context, compared = acceptedVisibleVersion(certificate)) => ({
      context: scope,
      compared,
      unchanged: true,
    }),
  );
  return {
    context,
    certificate,
    core,
    collection,
    transport,
    version,
    setCurrent(value: CoreAcceptedSnapshot | null) {
      current = value;
    },
  };
}

it("default closed port leaves the original full Pull unchanged", async () => {
  expect(tripVisibleVersionRead).toBeUndefined();
  const f = fixture();
  expect(await refreshCoreDownstream(f.core, f.context, f.transport)).toBe(true);
  expect(f.collection).toHaveBeenCalledOnce();
  expect(f.core.refresh).toHaveBeenCalledOnce();
});
it("first read without an Accepted baseline goes directly through existing Core apply", async () => {
  const f = fixture();
  f.setCurrent(null);
  expect(await refreshCoreDownstream(f.core, f.context, f.transport, f.version)).toBe(
    true,
  );
  expect(f.version).not.toHaveBeenCalled();
  expect(f.collection).toHaveBeenCalledOnce();
  expect(f.core.refresh).toHaveBeenCalledOnce();
});
it("current actor-visible comparison skips collection and all Core writes", async () => {
  const f = fixture();
  expect(await refreshCoreDownstream(f.core, f.context, f.transport, f.version)).toBe(
    false,
  );
  expect(f.version).toHaveBeenCalledExactlyOnceWith(
    f.context,
    acceptedVisibleVersion(f.certificate),
  );
  expect(Object.isFrozen(f.version.mock.calls[0][0])).toBe(true);
  expect(Object.isFrozen(f.version.mock.calls[0][1])).toBe(true);
  expect(f.collection).not.toHaveBeenCalled();
  expect(f.core.refresh).not.toHaveBeenCalled();
});
it("changed visible collection keeps the original validated apply path", async () => {
  const f = fixture();
  f.version.mockImplementation(async (context, compared) => ({
    context,
    compared,
    unchanged: false,
  }));
  expect(await refreshCoreDownstream(f.core, f.context, f.transport, f.version)).toBe(
    true,
  );
  expect(f.collection).toHaveBeenCalledOnce();
  expect(f.core.refresh).toHaveBeenCalledOnce();
});
it.each(["accountId", "tripId", "generation"] as const)(
  "foreign/late %s comparison rejects without a fallback request",
  async (key) => {
    const f = fixture();
    f.version.mockImplementation(async (context, compared) => ({
      context: {
        ...context,
        [key]: key === "generation" ? context.generation + 1 : randomUUID(),
      },
      compared,
      unchanged: true,
    }));
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, f.version),
    ).rejects.toThrow("CORE_VISIBLE_VERSION_CONTEXT_MISMATCH");
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.core.refresh).not.toHaveBeenCalled();
  },
);
it.each([
  "epoch",
  "revision",
  "accessRevision",
  "actorPersonBindingHash",
  "participatingRosterHash",
  "ordinaryOrderVersion",
] as const)(
  "a response must echo the complete compared %s, not only Trip revision",
  async (key) => {
    const f = fixture();
    f.version.mockImplementation(async (context, compared) => ({
      context,
      compared: {
        ...compared,
        [key]:
          typeof compared[key] === "number"
            ? Number(compared[key]) + 1
            : key === "epoch"
              ? randomUUID()
              : "d".repeat(64),
      },
      unchanged: true,
    }));
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, f.version),
    ).rejects.toThrow("CORE_VISIBLE_VERSION_CONTEXT_MISMATCH");
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.core.refresh).not.toHaveBeenCalled();
  },
);
it.each([undefined, { unchanged: true }, { context: {}, compared: {}, unchanged: true }])(
  "malformed response fails closed before any full request or write",
  async (response) => {
    const f = fixture();
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, async () => response),
    ).rejects.toThrow();
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.core.refresh).not.toHaveBeenCalled();
  },
);
it("a concurrent Accepted receipt prevents an old unchanged result from suppressing Pull", async () => {
  const f = fixture();
  f.version.mockImplementation(async (context, compared) => {
    f.setCurrent({
      certificate: { ...f.certificate, revision: "2" },
    } as CoreAcceptedSnapshot);
    return { context, compared, unchanged: true };
  });
  expect(await refreshCoreDownstream(f.core, f.context, f.transport, f.version)).toBe(
    true,
  );
  expect(f.collection).toHaveBeenCalledOnce();
});
it("ABA account generation change rejects a late unchanged response", async () => {
  const f = fixture();
  f.version.mockImplementation(async (context, compared) => {
    advanceAccountGeneration();
    advanceAccountGeneration();
    return { context, compared, unchanged: true };
  });
  await expect(
    refreshCoreDownstream(f.core, f.context, f.transport, f.version),
  ).rejects.toThrow();
  expect(f.collection).not.toHaveBeenCalled();
  expect(f.core.refresh).not.toHaveBeenCalled();
});
it("denied comparisons fail through existing backoff, never notification or false apply", async () => {
  const f = fixture();
  let now = 0;
  const notify = vi.fn();
  f.version.mockRejectedValue(Error("READ_DENIED"));
  const coordinator = createTripDownstreamCoordinator({
    account: async () => f.context.accountId,
    scope: async () => f.context,
    discover: async () => [],
    pull: async () => refreshCoreDownstream(f.core, f.context, f.transport, f.version),
    notify,
    now: () => now,
  });
  await expect(coordinator.trip(f.context.tripId)).rejects.toThrow("READ_DENIED");
  await coordinator.invalidate(f.context);
  expect(f.version).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
  expect(f.collection).not.toHaveBeenCalled();
  expect(f.core.refresh).not.toHaveBeenCalled();
  now = 15_001;
  f.version.mockImplementation(async (context, compared) => ({
    context,
    compared,
    unchanged: false,
  }));
  await coordinator.invalidate(f.context);
  expect(f.collection).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledOnce();
});
it("a failed collection apply advances no version baseline; same comparison is retried", async () => {
  const f = fixture();
  f.version.mockImplementation(async (context, compared) => ({
    context,
    compared,
    unchanged: false,
  }));
  f.core.refresh.mockRejectedValueOnce(Error("CAS_CONFLICT"));
  await expect(
    refreshCoreDownstream(f.core, f.context, f.transport, f.version),
  ).rejects.toThrow("CAS_CONFLICT");
  expect(await refreshCoreDownstream(f.core, f.context, f.transport, f.version)).toBe(
    true,
  );
  expect(f.collection).toHaveBeenCalledTimes(2);
  expect(f.version.mock.calls.map(([, stamp]) => stamp)).toEqual([
    acceptedVisibleVersion(f.certificate),
    acceptedVisibleVersion(f.certificate),
  ]);
});
it("controlled measurement records warm comparison versus full collection cost without claiming hardware timing", async () => {
  const f = fixture();
  let clock = 0;
  f.version.mockImplementation(async (context, compared) => {
    clock += 25;
    return { context, compared, unchanged: true };
  });
  f.collection.mockImplementation(async () => {
    clock += 400;
    return {
      manifest: {
        epoch: f.certificate.epoch,
        revision: 1,
        accessRevision: 2,
        actorPersonBindingHash: "a".repeat(64),
        participatingRosterHash: "b".repeat(64),
      },
      pages: [],
    };
  });
  for (let i = 0; i < 10; i++)
    await refreshCoreDownstream(f.core, f.context, f.transport, f.version);
  expect(clock).toBe(250);
  expect(f.collection).not.toHaveBeenCalled();
  for (let i = 0; i < 10; i++)
    await refreshCoreDownstream(f.core, f.context, f.transport);
  expect(clock).toBe(4250);
  expect(f.collection).toHaveBeenCalledTimes(10);
  console.info(
    JSON.stringify({
      scope: "CONTROLLED_FIXTURE_NOT_DEVICE",
      comparisons: 10,
      warmCollectionCalls: 0,
      fallbackCollectionCalls: 10,
      simulatedComparisonMs: 25,
      simulatedCollectionMs: 400,
    }),
  );
});
