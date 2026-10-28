import { describe, expect, it, vi } from "vitest";
import {
  coreDayProjectionContext,
  readCoreDisplaySnapshot,
} from "./coreDayProjectionContext";

describe("owning Core display authority", () => {
  const c = {
    epoch: "real-epoch",
    revision: "7",
    access_revision: 3,
    applied_generation: 8,
    actor_person_binding_hash: "actor",
    roster_hash: "roster",
    manifest_sha256: "manifest",
  };
  it("preserves real accepted metadata and keeps account generation separate", () => {
    const result = coreDayProjectionContext({ certificate: c } as any, 4);
    expect(result).toMatchObject({
      epoch: "real-epoch",
      revision: "7",
      manifestSha256: "manifest",
      generation: 4,
      authority: "SERVER_ACCEPTED",
    });
  });
  it("does not mint a server epoch/certificate for a local commit", () => {
    expect(
      coreDayProjectionContext(
        {
          certificate: null,
          localRevision: 2,
          participatingRosterHash: "real-local-roster",
        } as any,
        4,
      ),
    ).toEqual({
      epoch: null,
      revision: null,
      accessRevision: null,
      actorPersonBindingHash: null,
      manifestSha256: null,
      participatingRosterHash: "real-local-roster",
      generation: 4,
      serverGeneration: null,
      authority: "LOCAL_COMMITTED",
      localRevision: 2,
      localTargetIds: [],
    });
  });
  it("fails closed without current roster authority", () => {
    expect(() => coreDayProjectionContext({ certificate: null } as any, 4)).toThrow(
      "CORE_LOCAL_ROSTER_REQUIRED",
    );
  });
  it("keeps actual certificate for a combined graph", () => {
    expect(
      coreDayProjectionContext({ certificate: c, localRevision: 2 } as any, 4),
    ).toMatchObject({ epoch: c.epoch, authority: "MIXED", localRevision: 2 });
  });
  it("uses the owning combined snapshot rather than losing one side through fallback", async () => {
    const combinedSnapshot = vi.fn().mockResolvedValue({ graph: "combined" });
    const acceptedSnapshot = vi.fn();
    expect(
      await readCoreDisplaySnapshot(
        { combinedSnapshot, acceptedSnapshot } as any,
        {} as any,
      ),
    ).toEqual({ graph: "combined" });
    expect(acceptedSnapshot).not.toHaveBeenCalled();
  });
});
