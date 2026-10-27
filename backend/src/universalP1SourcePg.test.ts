import { expect, it, vi } from "vitest";
import {
  setUniversalP1WriteContext,
  publishUniversalP1Candidate,
  readUniversalP1Catalog,
} from "./universalP1SourcePg";

it.each(["publish", "catalog"])(
  "%s retains the owning Core lease through published-result reads",
  async (path) => {
    const scope = {
      actorAccountId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
      tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
      sourceId: "0c71927f-3f3b-4612-a49e-333761e90441",
      planId: "628753a7-26a1-8aa6-810c-ed812f18701f",
    };
    const h = {
      schemaId: "otr.core.universal-p1-source/1",
      accountId: scope.actorAccountId,
      tripId: scope.tripId,
      sourceId: scope.sourceId,
      sourceRevision: 1,
      taskId: "861a9d47-a35b-87a6-99f1-98422493d76b",
      batchId: "bd0d6ea6-7870-48a9-b74b-779a46783609",
      runId: "fd0237f2-c545-8c29-86f9-f68a108e40b4",
      candidateId: "44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67",
      token: "i1",
      resultSha256: "a".repeat(64),
    };
    const lease = {
      retire: vi.fn(),
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("trip_sustained_import_p1_capabilities")
          ? [
              {
                runtime_enabled: true,
                enabled_commands: ["CREATE_ITEM"],
                enabled_families: ["P1"],
                enabled_admission_modes: ["REVIEWED_SOURCE"],
              },
            ]
          : [{ candidate_json: h }],
      })),
    };
    const read = vi.fn(async (_scope: unknown, currentLease: unknown) => {
      expect(currentLease).toBe(lease);
      throw Error("OWNING_READER_REACHED_WITHOUT_SECOND_CONNECTION");
    });
    const work =
      path === "publish"
        ? publishUniversalP1Candidate(
            lease,
            scope,
            {
              batchId: h.batchId,
              taskId: h.taskId,
              token: h.token,
              requestSha256: "b".repeat(64),
            },
            read as never,
            async () => "",
          )
        : readUniversalP1Catalog(
            lease,
            scope,
            [h.candidateId],
            async () => "",
            read as never,
          );
    await expect(work).rejects.toThrow("OWNING_READER_REACHED_WITHOUT_SECOND_CONNECTION");
    expect(read).toHaveBeenCalledOnce();
  },
);

it.each(["actor", "trip", "inactive"])(
  "rejects invalid owning qualification %s before database reads",
  async (kind) => {
    const scope = {
      actorAccountId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
      tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
      sourceId: "0c71927f-3f3b-4612-a49e-333761e90441",
      planId: "628753a7-26a1-8aa6-810c-ed812f18701f",
    };
    const actor = {
      accountId: scope.actorAccountId,
      tripId: scope.tripId,
      active: true,
      canManageShared: false,
      personId: null,
      personIds: [],
    };
    if (kind === "actor") actor.accountId = scope.sourceId;
    if (kind === "trip") actor.tripId = scope.sourceId;
    if (kind === "inactive") actor.active = false;
    const query = vi.fn();
    await expect(
      readUniversalP1Catalog(
        { query, retire: vi.fn() },
        scope,
        [],
        async () => "",
        vi.fn(),
        true,
        { actor, graph: {} as never },
      ),
    ).rejects.toThrow("CORE_SCOPE_MISMATCH");
    expect(query).not.toHaveBeenCalled();
  },
);

it.each(["P1", "P2", "P3"] as const)(
  "sets the existing owning write context for exact %s command",
  async (family) => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await setUniversalP1WriteContext(
      { query, retire: vi.fn() } as never,
      "1397477b-a424-8c73-a17e-a61d05857f56",
      "a98856b8-321d-8b38-a7ba-efda7d4cd9e5",
      "f7d19001-fc5d-8719-94b2-e10c74525193",
      family,
    );
    expect(query.mock.calls[0][0]).toContain(
      family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
    );
    expect(query.mock.calls[0][0]).toContain(`'${family}'`);
    expect(query.mock.calls[0][0]).toContain("REVIEWED_SOURCE");
  },
);
