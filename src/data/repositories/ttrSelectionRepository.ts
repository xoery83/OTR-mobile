import type * as SQLite from "expo-sqlite";
import { z } from "zod";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  qualifyTtr,
  ttrIdentityKey,
  ttrInputSchema,
  ttrModeSchema,
  ttrExpired,
  type TtrIdentity,
  type TtrInput,
  type TtrExpiry,
  type TtrMode,
} from "@/domain/trip/ttr";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import type { TtrSelection } from "@/domain/trip/ttrState";

export type TtrSelectionDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;
export type TtrSelectionRelation = Readonly<{
  input: TtrInput;
  accessRevision: number;
  publicationVersion: number;
}>;
export type TtrSelectionClock = Readonly<{ instant: string | null; certain: boolean }>;
const uuid = ttrInputSchema.shape.scope.shape.accountId;
const token = ttrInputSchema.shape.scope.shape.travellerKey;
const role = ttrInputSchema.shape.from.unwrap().shape.role.unwrap();
const discriminator = z.tuple([token, token, role, token, role]);
const identitySchema = z.strictObject({
  accountId: uuid,
  tripId: uuid,
  fromEventId: uuid,
  toEventId: uuid,
  occurrenceDiscriminator: z.string(),
});
const instantSchema = z.string().datetime();
const contextSchema = z.strictObject({
  accountId: uuid,
  tripId: uuid,
  generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const relationSchema = z.strictObject({
  input: ttrInputSchema,
  accessRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  publicationVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const rowSchema = z.strictObject({
  account_id: uuid,
  trip_id: uuid,
  from_event_id: uuid,
  to_event_id: uuid,
  occurrence_discriminator: z.string(),
  confirmed_mode: ttrModeSchema,
  selected_at: instantSchema,
  applicable_event_date: z.string().nullable(),
  expiry_zone_id: z.string().nullable(),
});

export function validateTtrSelectionIdentity(raw: unknown): TtrIdentity {
  const id = identitySchema.parse(raw);
  if (
    id.fromEventId === id.toEventId ||
    new TextEncoder().encode(id.occurrenceDiscriminator).length > 8192 ||
    new TextEncoder().encode(ttrIdentityKey(id)).length > 8192
  )
    throw new Error("TTR_INVALID_IDENTITY");
  const tuple = discriminator.parse(JSON.parse(id.occurrenceDiscriminator));
  if (JSON.stringify(tuple) !== id.occurrenceDiscriminator)
    throw new Error("TTR_INVALID_IDENTITY");
  return id;
}
function expiry(value: TtrExpiry | null): TtrExpiry | null {
  if (value === null) return null;
  validateCalendarDate(value.eventDate);
  if (value.zone !== value.zone.trim()) throw new Error("TTR_INVALID_EXPIRY");
  localCalendarDate("2000-01-01T00:00:00Z", value.zone);
  return value;
}
const keyValues = (id: TtrIdentity) => [
  id.accountId,
  id.tripId,
  id.fromEventId,
  id.toEventId,
  id.occurrenceDiscriminator,
];
const where =
  "account_id=? AND trip_id=? AND from_event_id=? AND to_event_id=? AND occurrence_discriminator=?";
// Only in-flight explicit Confirms are tracked; no durable revision or preference framework.
const confirmations = new WeakMap<TtrSelectionDatabase, Map<string, symbol>>();

/** Dormant factory. Checker must be local and must not reacquire a gate or transaction. */
export function createTtrSelectionRepository(
  database: TtrSelectionDatabase,
  getAccountId: () => Promise<string>,
  dependencies: {
    clock(): TtrSelectionClock;
    isCurrentRelation(
      context: AccountRequestContext,
      relation: TtrSelectionRelation,
    ): Promise<boolean>;
  },
) {
  let pending = confirmations.get(database);
  if (!pending) confirmations.set(database, (pending = new Map()));
  const currentConfirms = pending;
  const assertContext = (ctx: AccountRequestContext) =>
    assertAccountRequestContext(ctx, getAccountId);
  function request(context: AccountRequestContext, raw: TtrSelectionRelation) {
    const ctx = contextSchema.parse(context);
    const relation = relationSchema.parse(raw);
    if (
      relation.input.scope.accountId !== ctx.accountId ||
      relation.input.scope.tripId !== ctx.tripId ||
      relation.input.scope.generation !== ctx.generation
    )
      throw new Error("TTR_SCOPE_MISMATCH");
    const qualified = qualifyTtr(relation.input);
    const id =
      qualified.status === "QUALIFIED"
        ? validateTtrSelectionIdentity(qualified.identity)
        : null;
    return { ctx, relation, id };
  }
  async function transaction<T>(ctx: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertContext(ctx);
        result = await work();
        await assertContext(ctx);
      });
      await assertContext(ctx);
      return result;
    });
  }
  async function current(ctx: AccountRequestContext, relation: TtrSelectionRelation) {
    return dependencies.isCurrentRelation(ctx, structuredClone(relation));
  }
  async function requireCurrent(
    ctx: AccountRequestContext,
    relation: TtrSelectionRelation,
  ) {
    if (!(await current(ctx, relation))) throw new Error("TTR_STALE_AUTHORITY");
  }
  async function load(id: TtrIdentity): Promise<TtrSelection | null> {
    const raw = await database.getFirstAsync<unknown>(
      `SELECT * FROM ttr_selections WHERE ${where}`,
      ...keyValues(id),
    );
    if (raw === null) return null;
    const row = rowSchema.parse(raw);
    const stored = validateTtrSelectionIdentity({
      accountId: row.account_id,
      tripId: row.trip_id,
      fromEventId: row.from_event_id,
      toEventId: row.to_event_id,
      occurrenceDiscriminator: row.occurrence_discriminator,
    });
    if (
      ttrIdentityKey(stored) !== ttrIdentityKey(id) ||
      (row.applicable_event_date === null) !== (row.expiry_zone_id === null)
    )
      throw new Error("TTR_INVALID_ROW");
    return {
      identityKey: ttrIdentityKey(id),
      mode: row.confirmed_mode,
      selectedAt: row.selected_at,
      expiry: expiry(
        row.applicable_event_date === null
          ? null
          : { eventDate: row.applicable_event_date, zone: row.expiry_zone_id! },
      ),
    };
  }
  async function maintain(
    context: AccountRequestContext,
    relations: readonly TtrSelectionRelation[],
    cleanup: boolean,
  ) {
    if (relations.length > 100) throw new Error("TTR_BATCH_LIMIT");
    const entries = relations.map((r) => request(context, r));
    const ctx = contextSchema.parse(context);
    const clock = cleanup ? { ...dependencies.clock() } : null;
    if (cleanup && (clock?.certain !== true || clock.instant === null)) {
      await assertContext(ctx);
      return 0;
    }
    if (clock?.instant) instantSchema.parse(clock.instant);
    return transaction(ctx, async () => {
      const touched: TtrSelectionRelation[] = [];
      let removed = 0;
      const seen = new Set<string>();
      for (const { relation, id } of entries) {
        if (!id || !(await current(ctx, relation))) continue;
        const key = ttrIdentityKey(id);
        if (seen.has(key)) throw new Error("TTR_DUPLICATE_RELATION");
        seen.add(key);
        const value = expiry(relation.input.expiry);
        const stored = await load(id);
        if (!stored) continue;
        if (cleanup && ttrExpired(value, clock!.instant!)) {
          const result = await database.runAsync(
            `DELETE FROM ttr_selections WHERE ${where}`,
            ...keyValues(id),
          );
          removed += result.changes;
        } else if (JSON.stringify(stored.expiry) !== JSON.stringify(value)) {
          await database.runAsync(
            `UPDATE ttr_selections SET applicable_event_date=?,expiry_zone_id=? WHERE ${where}`,
            value?.eventDate ?? null,
            value?.zone ?? null,
            ...keyValues(id),
          );
        }
        touched.push(relation);
      }
      for (const relation of touched) await requireCurrent(ctx, relation);
      return removed;
    });
  }
  return {
    async read(
      context: AccountRequestContext,
      raw: TtrSelectionRelation,
    ): Promise<TtrSelection | null> {
      const { ctx, relation, id } = request(context, raw);
      return transaction(ctx, async () => {
        if (!id || !(await current(ctx, relation))) return null;
        const row = await load(id);
        await requireCurrent(ctx, relation);
        return row;
      });
    },
    async confirm(
      context: AccountRequestContext,
      raw: TtrSelectionRelation,
      selectedMode: TtrMode,
    ): Promise<TtrSelection> {
      const { ctx, relation, id } = request(context, raw);
      if (!id || relation.input.period === "PAST") throw new Error("TTR_UNQUALIFIED");
      const mode = ttrModeSchema.parse(selectedMode);
      const clock = { ...dependencies.clock() };
      const selectedAt = instantSchema.parse(clock.instant);
      const value = expiry(relation.input.expiry);
      if (clock.certain && ttrExpired(value, selectedAt)) throw new Error("TTR_EXPIRED");
      const key = ttrIdentityKey(id),
        ticket = Symbol("Explicit TTR Confirm");
      currentConfirms.set(key, ticket);
      const assertLatest = () => {
        if (currentConfirms.get(key) !== ticket)
          throw new Error("TTR_SUPERSEDED_CONFIRM");
      };
      try {
        return await transaction(ctx, async () => {
          assertLatest();
          await requireCurrent(ctx, relation);
          assertLatest();
          await load(id);
          const written = await database.runAsync(
            `INSERT INTO ttr_selections(account_id,trip_id,from_event_id,to_event_id,occurrence_discriminator,confirmed_mode,selected_at,applicable_event_date,expiry_zone_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,trip_id,from_event_id,to_event_id,occurrence_discriminator) DO UPDATE SET confirmed_mode=excluded.confirmed_mode,selected_at=excluded.selected_at,applicable_event_date=excluded.applicable_event_date,expiry_zone_id=excluded.expiry_zone_id`,
            ...keyValues(id),
            mode,
            selectedAt,
            value?.eventDate ?? null,
            value?.zone ?? null,
          );
          if (written.changes !== 1) throw new Error("TTR_WRITE_NOT_APPLIED");
          await requireCurrent(ctx, relation);
          assertLatest();
          return { identityKey: key, mode, selectedAt, expiry: value };
        });
      } finally {
        if (currentConfirms.get(key) === ticket) currentConfirms.delete(key);
      }
    },
    reconcileExpiry: (
      context: AccountRequestContext,
      relations: readonly TtrSelectionRelation[],
    ) => maintain(context, relations, false),
    cleanupExpired: (
      context: AccountRequestContext,
      relations: readonly TtrSelectionRelation[],
    ) => maintain(context, relations, true),
  };
}
