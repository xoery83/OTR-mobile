import type * as SQLite from "expo-sqlite";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  readCapturePayload,
  hashCaptureBytes,
  validateCaptureUtf8,
  type CapturePayloadInput,
  type CaptureSha256,
} from "@/data/files/capturePayloadReader";
import {
  CAPTURE_LIMITS,
  captureIdSchema,
  captureMetadataSchema,
  captureRevisionSchema,
  localCaptureSchema,
  LocalCaptureError,
  equalCaptureBytes,
  sha256Schema,
  type CaptureMetadata,
  type LocalCapture,
} from "@/domain/capture/localCapture";

export type LocalCaptureDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
export type LocalCaptureDependencies = {
  sha256: CaptureSha256;
  newId(): string;
  now(): string;
};
type PayloadRow = {
  accountId: string;
  payloadId: string;
  byteCount: number;
  sha256: string;
  bytes: Uint8Array;
};
const payloadSelect = `SELECT account_id AS accountId, id AS payloadId,
  byte_count AS byteCount, sha256,
  CASE WHEN typeof(bytes) = 'blob' AND length(bytes) BETWEEN 1 AND 10485760
    THEN bytes ELSE NULL END AS bytes FROM local_capture_payloads`;
const captureSelect = `SELECT c.account_id AS accountId, c.id, c.payload_id AS payloadId,
  c.kind, c.original_filename AS originalFilename, c.declared_content_type AS declaredContentType,
  c.created_at AS createdAt, c.trip_id AS tripId, c.state, c.revision,
  p.byte_count AS byteCount, p.sha256 FROM local_capture_inbox c
  LEFT JOIN local_capture_payloads p ON p.account_id = c.account_id AND p.id = c.payload_id`;

export function createLocalCaptureInboxRepository(
  database: LocalCaptureDatabase,
  getActiveUserId: () => Promise<string>,
  dependencies: LocalCaptureDependencies,
) {
  const { sha256 } = dependencies;
  // The shared context API's Trip field is empty for Account-only work. No Trip
  // identity is synthesized or persisted; target Trip admission is separate.
  const context = () => captureAccountRequestContext("", getActiveUserId);
  const assertContext = (c: AccountRequestContext) =>
    assertAccountRequestContext(c, getActiveUserId);
  async function scoped<T>(c: AccountRequestContext, work: () => Promise<T>): Promise<T> {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertContext(c);
        result = await work();
        await assertContext(c);
      });
      await assertContext(c);
      return result;
    });
  }
  function id(value: string) {
    if (!captureIdSchema.safeParse(value).success)
      throw new LocalCaptureError("INVALID_INPUT");
  }
  function revision(value: number) {
    if (!captureRevisionSchema.safeParse(value).success)
      throw new LocalCaptureError("INVALID_INPUT");
  }
  async function assertTrip(accountId: string, tripId: string | null) {
    if (tripId === null) return;
    const actor = await database.getFirstAsync<{ found: number }>(
      "SELECT 1 AS found FROM ledger_actor_context WHERE user_id = ? AND journey_id = ?",
      accountId,
      tripId,
    );
    if (!actor) throw new LocalCaptureError("TRIP_ACCESS");
  }
  const storage = createLocalCaptureTransactionStore(database, dependencies);
  const { load } = storage;
  return {
    async intake(
      metadata: CaptureMetadata,
      input: CapturePayloadInput,
    ): Promise<LocalCapture> {
      const c = await context();
      const parsed = captureMetadataSchema.safeParse(metadata);
      if (!parsed.success) throw new LocalCaptureError("INVALID_INPUT");
      const meta = parsed.data;
      const payload = await readCapturePayload(meta.kind, input, sha256);
      return scoped(c, async () => {
        await assertTrip(c.accountId, meta.tripId);
        return storage.insert(c.accountId, meta, payload);
      });
    },
    async listInbox(
      options: { limit?: number; offset?: number } = {},
    ): Promise<LocalCapture[]> {
      const c = await context();
      const limit = options.limit ?? 100;
      const offset = options.offset ?? 0;
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      )
        throw new LocalCaptureError("INVALID_INPUT");
      return scoped(c, async () => {
        const rows = await database.getAllAsync<{ id: string }>(
          `SELECT id FROM local_capture_inbox WHERE account_id = ?
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
          c.accountId,
          limit,
          offset,
        );
        const captures: LocalCapture[] = [];
        for (const row of rows) captures.push((await load(c.accountId, row.id)).capture);
        return captures;
      });
    },
    async getForSourceHandoff(
      captureId: string,
    ): Promise<{ capture: LocalCapture; bytes: Uint8Array }> {
      const c = await context();
      id(captureId);
      return scoped(c, () => load(c.accountId, captureId));
    },
    async assign(
      captureId: string,
      tripId: string | null,
      expectedRevision: number,
    ): Promise<LocalCapture> {
      const c = await context();
      id(captureId);
      if (tripId !== null) id(tripId);
      revision(expectedRevision);
      return scoped(c, async () => {
        const { capture } = await load(c.accountId, captureId);
        if (capture.revision !== expectedRevision)
          throw new LocalCaptureError("STALE_REVISION");
        await assertTrip(c.accountId, capture.tripId);
        await assertTrip(c.accountId, tripId);
        if (capture.tripId === tripId) return capture;
        if (capture.revision === Number.MAX_SAFE_INTEGER)
          throw new LocalCaptureError("STALE_REVISION");
        const next: LocalCapture = {
          ...capture,
          tripId,
          state: tripId === null ? "INBOX" : "ASSIGNED",
          revision: capture.revision + 1,
        };
        const result = await database.runAsync(
          `UPDATE local_capture_inbox
          SET trip_id=?,state=?,revision=CAST(? AS INTEGER) WHERE account_id=? AND id=? AND revision=?`,
          tripId,
          next.state,
          next.revision,
          c.accountId,
          captureId,
          expectedRevision,
        );
        if (result.changes !== 1) throw new LocalCaptureError("STALE_REVISION");
        return next;
      });
    },
    async deleteCapture(captureId: string, expectedRevision: number): Promise<void> {
      const c = await context();
      id(captureId);
      revision(expectedRevision);
      return scoped(c, async () => {
        const { capture } = await load(c.accountId, captureId);
        if (capture.revision !== expectedRevision)
          throw new LocalCaptureError("STALE_REVISION");
        await assertTrip(c.accountId, capture.tripId);
        const result = await database.runAsync(
          "DELETE FROM local_capture_inbox WHERE account_id=? AND id=? AND revision=?",
          c.accountId,
          captureId,
          expectedRevision,
        );
        if (result.changes !== 1) throw new LocalCaptureError("STALE_REVISION");
        await database.runAsync(
          `DELETE FROM local_capture_payloads WHERE account_id=? AND id=?
          AND NOT EXISTS(SELECT 1 FROM local_capture_inbox WHERE account_id=? AND payload_id=?)`,
          c.accountId,
          capture.payloadId,
          c.accountId,
          capture.payloadId,
        );
      });
    },
  };
}

// Data-repository-only seam: caller owns one Account-gated transaction.
// No reader I/O or nested transaction; submission binding commits in that transaction.
export function createLocalCaptureTransactionStore(
  database: LocalCaptureDatabase,
  { sha256, newId, now }: LocalCaptureDependencies,
) {
  async function verifiedPayload(
    row: PayloadRow | null,
    accountId: string,
    payloadId: string,
  ) {
    if (
      !row ||
      row.accountId !== accountId ||
      row.payloadId !== payloadId ||
      !(row.bytes instanceof Uint8Array) ||
      !Number.isSafeInteger(row.byteCount) ||
      row.byteCount <= 0 ||
      row.byteCount > CAPTURE_LIMITS.binaryBytes ||
      row.bytes.length !== row.byteCount ||
      !sha256Schema.safeParse(row.sha256).success
    )
      throw new LocalCaptureError("INTEGRITY");
    const bytes = new Uint8Array(row.bytes);
    if ((await hashCaptureBytes(bytes, sha256)) !== row.sha256)
      throw new LocalCaptureError("INTEGRITY");
    return bytes;
  }
  async function load(accountId: string, captureId: string) {
    const row = await database.getFirstAsync<LocalCapture>(
      `${captureSelect} WHERE c.account_id = ? AND c.id = ?`,
      accountId,
      captureId,
    );
    if (!row) throw new LocalCaptureError("NOT_FOUND");
    const parsed = localCaptureSchema.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.accountId !== accountId ||
      parsed.data.id !== captureId
    )
      throw new LocalCaptureError("INTEGRITY");
    const capture = parsed.data;
    const payload = await database.getFirstAsync<PayloadRow>(
      `${payloadSelect} WHERE account_id = ? AND id = ?`,
      accountId,
      capture.payloadId,
    );
    const bytes = await verifiedPayload(payload, accountId, capture.payloadId);
    if (capture.byteCount !== payload!.byteCount || capture.sha256 !== payload!.sha256)
      throw new LocalCaptureError("INTEGRITY");
    if (capture.kind === "TEXT") {
      try {
        validateCaptureUtf8(bytes);
      } catch {
        throw new LocalCaptureError("INTEGRITY");
      }
    }
    return { capture, bytes };
  }
  function checkTotals(
    totals: { accountBytes: number; deviceBytes: number; rows: number } | null,
  ) {
    if (
      !totals ||
      !Object.values(totals).every((v) => Number.isSafeInteger(v) && v >= 0) ||
      totals.accountBytes > CAPTURE_LIMITS.accountBytes ||
      totals.deviceBytes > CAPTURE_LIMITS.deviceBytes ||
      totals.rows > CAPTURE_LIMITS.accountRows
    )
      throw new LocalCaptureError("INTEGRITY");
    return totals;
  }
  return {
    load,
    async insert(
      accountId: string,
      meta: ReturnType<typeof captureMetadataSchema.parse>,
      payload: Awaited<ReturnType<typeof readCapturePayload>>,
    ): Promise<LocalCapture> {
      const totals = checkTotals(
        await database.getFirstAsync<{
          accountBytes: number;
          deviceBytes: number;
          rows: number;
        }>(
          `SELECT
          (SELECT COALESCE(SUM(byte_count),0) FROM local_capture_payloads WHERE account_id = ?) AS accountBytes,
          (SELECT COALESCE(SUM(byte_count),0) FROM local_capture_payloads) AS deviceBytes,
          (SELECT COUNT(*) FROM local_capture_inbox WHERE account_id = ?) AS rows`,
          accountId,
          accountId,
        ),
      );
      if (totals.rows >= CAPTURE_LIMITS.accountRows)
        throw new LocalCaptureError("ROW_QUOTA");
      // Metadata narrows candidates; every candidate must pass byte integrity.
      const candidates = await database.getAllAsync<PayloadRow>(
        `${payloadSelect} WHERE account_id = ? AND sha256 = ? AND byte_count = ?`,
        accountId,
        payload.sha256,
        payload.byteCount,
      );
      let payloadId: string | null = null;
      for (const candidate of candidates) {
        const bytes = await verifiedPayload(candidate, accountId, candidate.payloadId);
        if (!equalCaptureBytes(bytes, payload.bytes))
          throw new LocalCaptureError("INTEGRITY");
        payloadId ??= candidate.payloadId;
      }
      const additional = payloadId === null ? payload.byteCount : 0;
      if (totals.accountBytes + additional > CAPTURE_LIMITS.accountBytes)
        throw new LocalCaptureError("ACCOUNT_BYTE_QUOTA");
      if (totals.deviceBytes + additional > CAPTURE_LIMITS.deviceBytes)
        throw new LocalCaptureError("DEVICE_BYTE_QUOTA");
      const capture: LocalCapture = {
        ...meta,
        id: newId(),
        accountId: accountId,
        payloadId: payloadId ?? newId(),
        byteCount: payload.byteCount,
        sha256: payload.sha256,
        createdAt: now(),
        state: meta.tripId === null ? "INBOX" : "ASSIGNED",
        revision: 1,
      };
      if (!localCaptureSchema.safeParse(capture).success)
        throw new LocalCaptureError("INVALID_INPUT");
      if (payloadId === null)
        await database.runAsync(
          `INSERT INTO local_capture_payloads (account_id,id,byte_count,sha256,bytes)
           VALUES (?,?,CAST(? AS INTEGER),?,?)`,
          accountId,
          capture.payloadId,
          payload.byteCount,
          payload.sha256,
          payload.bytes,
        );
      await database.runAsync(
        `INSERT INTO local_capture_inbox
          (account_id,id,payload_id,kind,original_filename,declared_content_type,created_at,trip_id,state,revision)
          VALUES (?,?,?,?,?,?,?,?,?,CAST(? AS INTEGER))`,
        accountId,
        capture.id,
        capture.payloadId,
        capture.kind,
        capture.originalFilename,
        capture.declaredContentType,
        capture.createdAt,
        capture.tripId,
        capture.state,
        1,
      );
      return capture;
    },
  };
}
