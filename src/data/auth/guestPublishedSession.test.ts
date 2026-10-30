import { beforeEach, expect, it, vi } from "vitest";
import { fixture } from "../../../backend/src/guestAdoptionCompositePlan.fixture";
import { preparePublishedGuestSession } from "./guestPublishedSession";
const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  inspect: vi.fn(),
  open: vi.fn(),
  transport: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("./authRepository", () => ({ requireCommittedGuestPrincipal: mocks.principal }));
vi.mock("../db/database", () => ({ openDatabase: mocks.open }));
vi.mock("./guestAdoptionRecovery", () => ({
  openGuestAdoptionRecovery: async () => ({ inspectPublicationRequests: mocks.inspect }),
}));
vi.mock("./guestAdoptionTransport", () => ({
  createGuestAdoptionTransport: mocks.transport,
}));
vi.mock("./guestAdoptionRestore", () => ({ restoreGuestAdoption: mocks.restore }));
beforeEach(() => vi.resetAllMocks());
it("resumes the sole durable target attempt through the canonical Account database and owning restore", async () => {
  const f = fixture(),
    checkpoint = await f.source();
  const preparation = JSON.parse(checkpoint.canonicalText),
    qualifyLocalCache = vi.fn();
  mocks.principal.mockResolvedValue({
    kind: "GUEST",
    localId: f.grant.sourceGuestLocalId,
  });
  mocks.inspect.mockResolvedValue([
    { preparation, preparationSha256: checkpoint.sha256 },
  ]);
  const accountDatabase = {},
    transport = {};
  mocks.open.mockResolvedValue(accountDatabase);
  mocks.transport.mockReturnValue(transport);
  mocks.restore.mockResolvedValue({ qualifyLocalCache });
  const result = await preparePublishedGuestSession(
    f.grant.sourceGuestLocalId,
    f.user.id,
  );
  expect(mocks.restore).toHaveBeenCalledWith(
    accountDatabase,
    transport,
    {
      contractVersion: 1,
      sourceGuestLocalId: f.grant.sourceGuestLocalId,
      targetAccountId: f.user.id,
      adoptionId: f.grant.adoptionId,
      inventorySha256: f.grant.inventorySha256,
    },
    checkpoint,
  );
  expect(result.qualifyLocalCache).toBe(qualifyLocalCache);
  expect(result.binding.targetAccountId).toBe(f.user.id);
});
it.each(["none", "foreign", "duplicate"])(
  "does not open any Account database for %s target attempts",
  async (mode) => {
    const f = fixture(),
      checkpoint = await f.source(),
      preparation = JSON.parse(checkpoint.canonicalText);
    mocks.principal.mockResolvedValue({
      kind: "GUEST",
      localId: f.grant.sourceGuestLocalId,
    });
    const attempt = { preparation, preparationSha256: checkpoint.sha256 };
    mocks.inspect.mockResolvedValue(
      mode === "none"
        ? []
        : mode === "duplicate"
          ? [attempt, attempt]
          : [
              {
                ...attempt,
                preparation: {
                  ...preparation,
                  targetAccountId: f.grant.sourceGuestLocalId,
                },
              },
            ],
    );
    await expect(
      preparePublishedGuestSession(f.grant.sourceGuestLocalId, f.user.id),
    ).rejects.toThrow("PREFLIGHT_REQUIRED");
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  },
);
