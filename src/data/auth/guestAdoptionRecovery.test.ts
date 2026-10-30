import { randomUUID, createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  linkSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import {
  createGuestAdoptionRecovery,
  openGuestAdoptionRecovery,
  type GuestRecoveryFiles,
  type GuestAdoptionPreparation,
} from "./guestAdoptionRecovery";
import { guestVerificationSession, requireCommittedGuestPrincipal } from "./authRepository";
import { advanceAccountGeneration, getAccountGeneration } from "./accountGeneration";
import { createGuestRecoveryFiles } from "./guestRecoveryFiles";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";

vi.mock("./authRepository", () => ({ requireCommittedGuestPrincipal: vi.fn(), guestVerificationSession: { readForLocalCache: vi.fn() } }));
vi.mock("@/domain/localId", () => ({ createUuid: () => randomUUID() }));
const nativeAccess = vi.hoisted(() => ({
  files: null as GuestRecoveryFiles | null,
  created: vi.fn(),
}));
vi.mock("./guestRecoveryFiles", async (original) => {
  const actual = await original<typeof import("./guestRecoveryFiles")>();
  return {
    createGuestRecoveryFiles: (
      ...args: Parameters<typeof actual.createGuestRecoveryFiles>
    ) => {
      if (args[1]) return actual.createGuestRecoveryFiles(...args);
      nativeAccess.created(args[0]);
      if (!nativeAccess.files) throw Error("NATIVE_FILES_FORBIDDEN");
      return nativeAccess.files;
    },
  };
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
  nativeAccess.files = null;
  nativeAccess.created.mockClear();
  vi.mocked(requireCommittedGuestPrincipal).mockReset();
  vi.mocked(guestVerificationSession.readForLocalCache).mockReset();
});
const canonical = (value: unknown) => canonicalCoreJson(value as Json);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-guest-recovery-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const scope = { kind: "GUEST" as const, localId: randomUUID(), generation: 0 };
  let principal: { kind: string; localId: string } = scope;
  let failBeforeMove = false;
  let generation = 0;
  let beforeGuestAssert: (() => void) | undefined;
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(
        ...parts.map((part) => (typeof part === "string" ? part : part.uri)),
      );
    }
    get name() {
      return basename(this.uri);
    }
    get exists() {
      return existsSync(this.uri);
    }
    create() {
      mkdirSync(this.uri, { recursive: true });
    }
    list(): (File | Directory)[] {
      return readdirSync(this.uri).map((name) =>
        statSync(join(this.uri, name)).isDirectory()
          ? new Directory(this, name)
          : new File(this, name),
      );
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(
        ...parts.map((part) => (typeof part === "string" ? part : part.uri)),
      );
    }
    get name() {
      return basename(this.uri);
    }
    get exists() {
      return existsSync(this.uri);
    }
    create(options: { overwrite: boolean }) {
      expect(options.overwrite).toBe(false);
      writeFileSync(this.uri, "", { flag: "wx" });
    }
    write(text: string) {
      writeFileSync(this.uri, text);
    }
    async text() {
      return readFileSync(this.uri, "utf8");
    }
    async move(destination: File, options: { overwrite: boolean }) {
      expect(options.overwrite).toBe(false);
      if (failBeforeMove) {
        failBeforeMove = false;
        throw Error("KILL_BEFORE_CHECKPOINT_MOVE");
      }
      linkSync(this.uri, destination.uri);
      unlinkSync(this.uri);
      this.uri = destination.uri;
    }
  }
  const files = createGuestRecoveryFiles(scope.localId, {
    Directory,
    File,
    Paths: { document: directory },
  } as never);
  const open = () => {
    const current = { ...scope, generation };
    return createGuestAdoptionRecovery({
      scope: current,
      files,
      assertGuest: async () => {
        const action = beforeGuestAssert;
        beforeGuestAssert = undefined;
        action?.();
        if (
          principal.kind !== "GUEST" ||
          principal.localId !== current.localId ||
          generation !== current.generation
        )
          throw Error("WRONG_GUEST");
      },
    });
  };
  const root = join(directory, "auth-guest-adoption", scope.localId);
  const path = (id: string, name = "prepared") => join(root, id, `${name}.json`);
  return {
    scope,
    files,
    open,
    path,
    root,
    directory,
    setPrincipal(next: typeof principal) {
      principal = next;
    },
    failBeforeMove() {
      failBeforeMove = true;
    },
    advanceGeneration() {
      generation++;
    },
    onNextAssert(action: () => void) {
      beforeGuestAssert = action;
    },
  };
}
function preparation(sourceGuestLocalId: string): GuestAdoptionPreparation {
  const tripId = randomUUID(),
    itemId = randomUUID();
  const fields = {
    title: "未保存的旅程",
    startDate: "",
    startTime: null,
    endDate: null,
    endTime: null,
    location: null,
    description: null,
    participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  };
  const text = canonical({
    schemaId: "otr.auth.guest-p1-draft/1",
    tripId,
    itemId,
    mode: "CREATE",
    fields,
    initialFields: { ...fields, title: "" },
    firstAttempt: null,
    placeSelection: null,
  });
  return {
    schemaId: "otr.auth.guest-adoption-recovery/1",
    sourceKind: "GUEST",
    sourceGuestLocalId,
    adoptionId: randomUUID(),
    targetAccountId: randomUUID(),
    checkpoint: "PREPARED",
    inventorySha256: "a".repeat(64),
    tripIds: [tripId],
    drafts: [
      {
        id: itemId,
        canonicalText: text,
        sha256: hash(text),
        bytes: Buffer.byteLength(text),
      },
    ],
  };
}

it("retains exact unsaved Unicode draft and target through a real disk close/reopen without Session or business writes", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  const first = await f.open().prepare(input);
  expect(first?.nextAction).toBe("RESUME_PREFLIGHT");
  const restored = await f.open().read(input.adoptionId, input.targetAccountId);
  expect(restored).toEqual(first);
  expect(JSON.parse(restored!.preparation.drafts[0].canonicalText).fields.title).toBe(
    "未保存的旅程",
  );
  expect(await f.open().prepare(input)).toEqual(first);
  expect(readdirSync(join(f.root, input.adoptionId))).toEqual(["prepared.json"]);
  expect(readdirSync(f.directory)).toEqual(["auth-guest-adoption"]);
});

it("requires authoritative server status after durable publish intent, including a kill before any request is sent", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId),
    journal = f.open();
  const prepared = await journal.prepare(input);
  await journal.requestPublication(
    input.adoptionId,
    input.targetAccountId,
    prepared!.preparationSha256,
  );
  const restored = await f.open().read(input.adoptionId, input.targetAccountId);
  expect(restored?.nextAction).toBe("QUERY_SERVER_STATUS");
  await expect(
    f.open().cancelBeforePublication(input.adoptionId, input.targetAccountId),
  ).rejects.toThrow("AUTHORITATIVE_STATUS_REQUIRED");
  expect(existsSync(f.path(input.adoptionId, "cancelled"))).toBe(false);
});

it("retains the publication hold across cold cancellation recovery until receipt and credential revocation are verified", async () => {
  const f = fixture(), input = preparation(f.scope.localId), journal = f.open();
  const prepared = (await journal.prepare(input))!;
  await journal.requestPublication(input.adoptionId, input.targetAccountId, prepared.preparationSha256);
  const body = {
    contractVersion: 1, schemaId: "otr.auth.guest-adoption-receipt/1",
    adoptionId: input.adoptionId, sourceGuestLocalId: input.sourceGuestLocalId,
    targetAccountId: input.targetAccountId, inventorySha256: input.inventorySha256,
    receiptId: randomUUID(), grantId: randomUUID(), policyVersion: "unit",
    recordedAt: new Date().toISOString(), outcome: "CANCELLED",
    preparationSha256: prepared.preparationSha256, planSha256: "b".repeat(64),
  };
  const sign = (value: typeof body) => ({ ...value, receiptSha256: hash("otr-auth-guest-adoption-receipt-v1\n" + canonical(value)) });
  await expect(journal.recordServerCancellation(input.adoptionId, input.targetAccountId, sign({ ...body, preparationSha256: "c".repeat(64) }))).rejects.toThrow("CHECKPOINT_MISMATCH");
  await expect(journal.recordServerCancellation(input.adoptionId, input.targetAccountId, { ...sign(body), receiptSha256: "d".repeat(64) })).rejects.toThrow();
  await journal.recordServerCancellation(input.adoptionId, input.targetAccountId, sign(body));
  expect((await f.open().inspectPublicationRequests())).toHaveLength(1);
  vi.mocked(guestVerificationSession.readForLocalCache).mockResolvedValue({ status: "REVOCATION_PENDING" });
  await expect(f.open().finishServerCancellation(input.adoptionId, input.targetAccountId)).rejects.toThrow("REVOCATION_PENDING");
  expect((await f.open().read(input.adoptionId))?.nextAction).toBe("QUERY_SERVER_STATUS");
  vi.mocked(guestVerificationSession.readForLocalCache).mockResolvedValue({ status: "REVOKED" });
  await f.open().finishServerCancellation(input.adoptionId, input.targetAccountId);
  expect(await f.open().inspectPublicationRequests()).toEqual([]);
  expect((await f.open().read(input.adoptionId))?.nextAction).toBe("REMAIN_GUEST");
  await f.open().finishServerCancellation(input.adoptionId, input.targetAccountId);
  expect(readFileSync(f.path(input.adoptionId), "utf8")).toBe(canonical(input));
  expect((await f.open().prepare(preparation(f.scope.localId)))?.nextAction).toBe("RESUME_PREFLIGHT");
  writeFileSync(f.path(input.adoptionId, "cancellation-receipt"), canonical({ ...sign(body), targetAccountId: randomUUID() }));
  await expect(f.open().read(input.adoptionId)).rejects.toThrow();
});

it("keeps originals on cancel and permits a new explicitly different target only after cancellation", async () => {
  const f = fixture(),
    first = preparation(f.scope.localId),
    next = preparation(f.scope.localId);
  await f.open().prepare(first);
  await expect(f.open().prepare(next)).rejects.toThrow("ALREADY_IN_PROGRESS");
  expect(existsSync(f.path(next.adoptionId))).toBe(false);
  await f.open().cancelBeforePublication(first.adoptionId, first.targetAccountId);
  expect((await f.open().read(first.adoptionId))?.nextAction).toBe("REMAIN_GUEST");
  expect((await f.open().prepare(next))?.preparation.targetAccountId).toBe(
    next.targetAccountId,
  );
  expect(readFileSync(f.path(first.adoptionId), "utf8")).toBe(canonical(first));
});

it("rejects same UUID under Account kind and wrong target/source before returning drafts", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  await f.open().prepare(input);
  await expect(f.open().read(input.adoptionId, randomUUID())).rejects.toThrow(
    "RECOVERY_SCOPE",
  );
  f.setPrincipal({ kind: "ACCOUNT", localId: f.scope.localId });
  await expect(f.open().read(input.adoptionId, input.targetAccountId)).rejects.toThrow(
    "WRONG_GUEST",
  );
  expect(readFileSync(f.path(input.adoptionId), "utf8")).toBe(canonical(input));
});

it("does not accept a partial temporary write and can retry without deleting retained originals", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  f.failBeforeMove();
  await expect(f.open().prepare(input)).rejects.toThrow("KILL_BEFORE_CHECKPOINT_MOVE");
  expect(await f.open().read(input.adoptionId)).toBeNull();
  expect(
    readdirSync(dirname(f.path(input.adoptionId))).some((name) =>
      name.startsWith(".pending-"),
    ),
  ).toBe(true);
  expect((await f.open().prepare(input))?.preparation).toEqual(input);
});

it("retains PREPARED after interrupted publish-marker creation and never overwrites it on conflicting retry", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId),
    prepared = await f.open().prepare(input);
  f.failBeforeMove();
  await expect(
    f
      .open()
      .requestPublication(
        input.adoptionId,
        input.targetAccountId,
        prepared!.preparationSha256,
      ),
  ).rejects.toThrow("KILL_BEFORE_CHECKPOINT_MOVE");
  expect((await f.open().read(input.adoptionId))?.nextAction).toBe("RESUME_PREFLIGHT");
  await expect(
    f.open().prepare({ ...input, inventorySha256: "b".repeat(64) }),
  ).rejects.toThrow("REUSE_MISMATCH");
  expect(readFileSync(f.path(input.adoptionId), "utf8")).toBe(canonical(input));
});

it.each(["hash", "bytes", "trip", "token"] as const)(
  "rejects an invalid %s in the recovery preparation",
  async (variant) => {
    const f = fixture(),
      input = preparation(f.scope.localId);
    if (variant === "hash") input.drafts[0].sha256 = "b".repeat(64);
    if (variant === "bytes") input.drafts[0].bytes++;
    if (variant === "trip") input.tripIds = [randomUUID()];
    if (variant === "token")
      Object.assign(input, { accessToken: "forbidden-secret-fixture" });
    await expect(f.open().prepare(input)).rejects.toThrow();
    expect(existsSync(f.path(input.adoptionId))).toBe(false);
  },
);

it("serializes concurrent different preparations so only one unfinished attempt exists", async () => {
  const f = fixture(),
    a = preparation(f.scope.localId),
    b = preparation(f.scope.localId);
  const results = await Promise.allSettled([f.open().prepare(a), f.open().prepare(b)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await f.files.listAttempts()).toHaveLength(1);
});

it("pins caller preparation before its first async boundary instead of writing validated bytes under a mutated ID", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId),
    original = structuredClone(input);
  f.onNextAssert(() => {
    input.adoptionId = randomUUID();
    input.targetAccountId = randomUUID();
    input.tripIds[0] = randomUUID();
  });
  const result = await f.open().prepare(input);
  expect(result?.preparation).toEqual(original);
  expect(existsSync(f.path(original.adoptionId))).toBe(true);
  expect(existsSync(f.path(input.adoptionId))).toBe(false);
});

it("recovers the same persisted identity after a fresh generation, while refusing old handles", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId),
    old = f.open();
  const prepared = await old.prepare(input);
  f.advanceGeneration();
  await expect(old.read(input.adoptionId)).rejects.toThrow("WRONG_GUEST");
  expect(await f.open().read(input.adoptionId, input.targetAccountId)).toEqual(prepared);
});

it("wires the default boundary to real generation fences before filesystem access and around recovery", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  const scope = { ...f.scope, generation: getAccountGeneration() };
  nativeAccess.files = f.files;
  vi.mocked(requireCommittedGuestPrincipal).mockResolvedValue({
    kind: "GUEST",
    localId: scope.localId,
  });
  const old = await openGuestAdoptionRecovery(scope);
  const prepared = await old.prepare(input);
  advanceAccountGeneration();
  await expect(old.read(input.adoptionId)).rejects.toThrow("Account changed");
  const current = { ...scope, generation: getAccountGeneration() };
  const rebound = await openGuestAdoptionRecovery(current);
  expect(await rebound.read(input.adoptionId, input.targetAccountId)).toEqual(prepared);
  expect(nativeAccess.created).toHaveBeenCalledTimes(2);
  await expect(openGuestAdoptionRecovery(scope)).rejects.toThrow("Account changed");
  vi.mocked(requireCommittedGuestPrincipal).mockResolvedValue({
    kind: "GUEST",
    localId: randomUUID(),
  });
  await expect(openGuestAdoptionRecovery(current)).rejects.toThrow("RECOVERY_SCOPE");
  expect(nativeAccess.created).toHaveBeenCalledTimes(2);
  vi.mocked(requireCommittedGuestPrincipal).mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return { kind: "GUEST", localId: scope.localId };
  });
  await expect(openGuestAdoptionRecovery(current)).rejects.toThrow("Account changed");
  expect(nativeAccess.created).toHaveBeenCalledTimes(2);
});

it("serializes cancel versus publication so conflicting terminal markers cannot both appear", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId),
    initial = await f.open().prepare(input);
  const results = await Promise.allSettled([
    f
      .open()
      .requestPublication(
        input.adoptionId,
        input.targetAccountId,
        initial!.preparationSha256,
      ),
    f.open().cancelBeforePublication(input.adoptionId, input.targetAccountId),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const files = readdirSync(dirname(f.path(input.adoptionId)));
  expect(
    files.filter(
      (name) => name === "publish-requested.json" || name === "cancelled.json",
    ),
  ).toHaveLength(1);
  expect((await f.open().read(input.adoptionId))?.nextAction).toBe("QUERY_SERVER_STATUS");
});

it("blocks unknown future checkpoint files instead of treating the attempt as absent", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  mkdirSync(dirname(f.path(input.adoptionId)), { recursive: true });
  writeFileSync(
    f.path(input.adoptionId, "unknown-future-checkpoint"),
    "retain for recovery",
  );
  await expect(f.open().read(input.adoptionId)).rejects.toThrow(
    "CHECKPOINT_DIRECTORY_INVALID",
  );
  await expect(f.open().prepare(preparation(f.scope.localId))).rejects.toThrow(
    "CHECKPOINT_DIRECTORY_INVALID",
  );
  expect(
    readFileSync(f.path(input.adoptionId, "unknown-future-checkpoint"), "utf8"),
  ).toBe("retain for recovery");
});

it.each(["{broken", ""])(
  "fails closed on corrupt committed bytes %j without replacing or deleting them",
  async (broken) => {
    const f = fixture(),
      input = preparation(f.scope.localId);
    await f.open().prepare(input);
    writeFileSync(f.path(input.adoptionId), broken);
    await expect(f.open().read(input.adoptionId)).rejects.toThrow();
    await expect(f.open().prepare(input)).rejects.toThrow();
    await expect(f.open().prepare(preparation(f.scope.localId))).rejects.toThrow();
    expect(readFileSync(f.path(input.adoptionId), "utf8")).toBe(broken);
  },
);

function tripDraftEntry(mode: "CREATE" | "EDIT", tripId: string) {
  const id = randomUUID();
  const value =
    mode === "CREATE"
      ? {
          operation: { tripId, operationId: randomUUID() },
          name: "  未保存的Trip  ",
          start: "",
          end: "",
          destinations: [],
          selfNickname: "旅行昵称",
          knownSelfName: "",
          travelers: [],
        }
      : {
          fields: {
            before: {
              name: "Saved Guest Trip",
              destination: null,
              startDate: null,
              endDate: null,
            },
            beforeCover: null,
            draftCover: null,
            coverChanged: false,
            initialDestinations: [],
            destinationItems: [],
            destinationsBefore: [],
            name: "  尚未提交的修改  ",
            destination: "",
            start: "",
            end: "",
          },
          context: {
            tripId,
            syncFormatVersion: 2,
            metadataBase: null,
            deferredMetadataBase: null,
            deferredActionId: null,
          },
        };
  const canonicalText = canonical({
    schemaId: "otr.auth.guest-trip-draft/1",
    draftId: id,
    tripId,
    mode,
    value,
  });
  return {
    id,
    canonicalText,
    sha256: hash(canonicalText),
    bytes: Buffer.byteLength(canonicalText),
  };
}
it("version2 reopens exact Trip Create/Edit and P1 snapshots without submitting the unsaved Trip", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  input.schemaId = "otr.auth.guest-adoption-recovery/2";
  const unsavedTrip = randomUUID();
  input.drafts.push(
    tripDraftEntry("CREATE", unsavedTrip),
    tripDraftEntry("EDIT", input.tripIds[0]),
  );
  const prepared = await f.open().prepare(input);
  const reopened = await f.open().read(input.adoptionId, input.targetAccountId);
  expect(reopened).toEqual(prepared);
  expect(reopened!.preparation.drafts).toEqual(input.drafts);
  expect(reopened!.preparation.tripIds).not.toContain(unsavedTrip);
  const cancelled = await f
    .open()
    .cancelBeforePublication(input.adoptionId, input.targetAccountId);
  expect(cancelled!.nextAction).toBe("REMAIN_GUEST");
  expect(cancelled!.preparation.drafts).toEqual(input.drafts);
});
it.each([
  "version1",
  "create collision",
  "foreign edit",
  "credential field",
  "hash",
  "entry id",
])("retains originals and rejects invalid Trip recovery: %s", async (reason) => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  input.schemaId =
    reason === "version1"
      ? "otr.auth.guest-adoption-recovery/1"
      : "otr.auth.guest-adoption-recovery/2";
  const entry = tripDraftEntry(
    reason === "foreign edit" ? "EDIT" : "CREATE",
    reason === "create collision" ? input.tripIds[0] : randomUUID(),
  );
  if (reason === "credential field") {
    const body = JSON.parse(entry.canonicalText);
    body.value.accessToken = "synthetic-forbidden-field";
    entry.canonicalText = canonical(body);
    entry.sha256 = hash(entry.canonicalText);
    entry.bytes = Buffer.byteLength(entry.canonicalText);
  }
  if (reason === "hash") entry.sha256 = "b".repeat(64);
  if (reason === "entry id") entry.id = randomUUID();
  input.drafts.push(entry);
  await expect(f.open().prepare(input)).rejects.toThrow();
  expect(existsSync(f.path(input.adoptionId))).toBe(false);
});
it("refuses a cross-version transition even when every other binding and hash matches", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  input.schemaId = "otr.auth.guest-adoption-recovery/2";
  const prepared = await f.open().prepare(input);
  await f
    .open()
    .requestPublication(
      input.adoptionId,
      input.targetAccountId,
      prepared!.preparationSha256,
    );
  const path = f.path(input.adoptionId, "publish-requested");
  const transition = JSON.parse(readFileSync(path, "utf8"));
  transition.schemaId = "otr.auth.guest-adoption-recovery/1";
  writeFileSync(path, canonical(transition));
  await expect(f.open().read(input.adoptionId, input.targetAccountId)).rejects.toThrow(
    "GUEST_ADOPTION_RECOVERY_CHECKPOINT_PIN",
  );
  expect(existsSync(f.path(input.adoptionId))).toBe(true);
});

it("rejects another Account actor inside a Trip Edit baseline before creating recovery files", async () => {
  const f = fixture(),
    input = preparation(f.scope.localId);
  input.schemaId = "otr.auth.guest-adoption-recovery/2";
  const entry = tripDraftEntry("EDIT", input.tripIds[0]);
  const body = JSON.parse(entry.canonicalText);
  body.value.context.metadataBase = {
    formatVersion: 3,
    actorAccountId: randomUUID(),
    tripId: input.tripIds[0],
    metadataRevision: 0,
    metadata: {
      name: "Other Account baseline",
      destination: null,
      destinations: [],
      startDate: null,
      endDate: null,
    },
  };
  entry.canonicalText = canonical(body);
  entry.bytes = Buffer.byteLength(entry.canonicalText);
  entry.sha256 = hash(entry.canonicalText);
  input.drafts.push(entry);
  await expect(f.open().prepare(input)).rejects.toThrow(
    "GUEST_ADOPTION_RECOVERY_DRAFT_SCOPE",
  );
  expect(existsSync(f.path(input.adoptionId))).toBe(false);
});
