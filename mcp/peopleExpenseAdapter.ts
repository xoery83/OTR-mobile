import { z } from "zod";
import { uuid } from "./contract";
import { contentDigest } from "./mutation";
import { personCloudCreateSchema } from "../src/domain/trip/tripPersonCloudCreate";
import {
  createLedgerExpenseRequestSchema,
  updateLedgerExpenseRequestSchema,
} from "../src/data/api/ledgerMutationContracts";
import { ledgerMoneySchema } from "../src/data/api/ledgerReadContracts";

const reference = z.string().min(1).max(256);
export const personObservation = z.strictObject({
  name: z.string().trim().min(1).max(256),
  source_refs: z.array(reference).min(1).max(20),
  spelling_variants: z.array(z.string().trim().min(1).max(256)).max(10).optional(),
});
export const rosterContract = z.strictObject({
  account_id: uuid,
  trip_id: uuid,
  revision: z.number().int().nonnegative().nullable(),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  name_scope: z.literal("TRIP_DISPLAY_NAMES_ONLY").optional(),
  complete: z.literal(true),
  people: z
    .array(
      z.strictObject({
        person_id: uuid,
        display_name: z.string().max(256),
        nickname: z.string().max(256).optional(),
        visible_document_name: z.string().max(256).optional(),
        confirmed_visible_aka: z.array(z.string().max(256)).max(100),
        participation_active: z.boolean().optional(),
        participation_revision: z.number().int().nonnegative().optional(),
        status: z.string().optional(),
      }),
    )
    .max(256),
});
export const aliasIntent = z.strictObject({
  person_id: uuid,
  alias: z.string().trim().min(1).max(256),
  scope: z.enum(["TRIP", "GLOBAL_SELF"]),
  source_refs: z.array(reference).min(1).max(20),
  expected_revision: z.number().int().nonnegative(),
  action: z.enum(["ADD", "CORRECT", "SUPPRESS"]),
  replaces_alias_id: uuid.optional(),
});
const nameKey = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\s/.,'-]+/g, "");
const orderedNameKey = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .split(/[\s/.,'-]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
function scope(
  context: { account_id: string; trip_id: string },
  snapshot: { account_id: string; trip_id: string },
) {
  if (context.account_id !== snapshot.account_id || context.trip_id !== snapshot.trip_id)
    throw Error("OWNING_READ_SCOPE_MISMATCH");
}
export function matchPeople(
  context: { account_id: string; trip_id: string },
  observations: unknown[],
  rawRoster: unknown | null,
) {
  const people = observations.map((o) => personObservation.parse(o));
  if (rawRoster === null)
    return people.map((p) => ({
      ...p,
      decision: "BLOCKED",
      candidates: [],
      reason: "ROSTER_READER_UNAVAILABLE_NOT_EMPTY_ROSTER",
    }));
  const roster = rosterContract.parse(rawRoster);
  scope(context, roster);
  return people.map((p) => {
    const candidates = roster.people.flatMap((person) => {
      const names = [
        person.display_name,
        person.nickname,
        person.visible_document_name,
        ...person.confirmed_visible_aka,
      ].filter((n): n is string => !!n);
      const observed = [p.name, ...(p.spelling_variants ?? [])];
      const matched = names.filter((name) =>
        observed.some(
          (variant) =>
            nameKey(name) === nameKey(variant) ||
            orderedNameKey(name) === orderedNameKey(variant),
        ),
      );
      return matched.length
        ? [
            {
              person_id: person.person_id,
              display_name: person.display_name,
              matched_visible_names: matched,
            },
          ]
        : [];
    });
    return {
      ...p,
      decision: "NEEDS_INPUT",
      candidates,
      reason:
        candidates.length > 1
          ? "SAME_NAME_DIFFERENT_PEOPLE"
          : candidates.length
            ? "CONFIRM_EXISTING_PERSON_NOT_ACCOUNT_LINK"
            : "CHOOSE_NEW_TRAVELER_OR_UNRESOLVED",
    };
  });
}
export const personChoiceSchema = z.strictObject({
  observation_name: z.string().trim().min(1).max(256),
  source_refs: z.array(reference).min(1).max(20),
  choice: z.enum(["MATCH_EXISTING", "CREATE_UNLINKED", "UNRESOLVED"]),
  person_id: uuid.optional(),
  choice_revision: z.number().int().positive(),
  previous_choice_revision: z.number().int().positive().optional(),
  expected_roster_revision: z.number().int().nonnegative().nullable(),
  expected_roster_fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export function planPersonChoice(
  context: { account_id: string; trip_id: string },
  raw: unknown,
  rawRoster: unknown | null,
  previousChoice?: unknown,
) {
  const intent = personChoiceSchema.parse(raw);
  const previous =
    previousChoice === undefined ? null : personChoiceSchema.parse(previousChoice);
  if (
    previous
      ? intent.previous_choice_revision !== previous.choice_revision ||
        nameKey(intent.observation_name) !== nameKey(previous.observation_name) ||
        contentDigest([...intent.source_refs].sort()) !==
          contentDigest([...previous.source_refs].sort())
      : intent.previous_choice_revision !== undefined || intent.choice_revision !== 1
  )
    throw Error("PERSON_CHOICE_REVISION_CONFLICT");
  if (
    intent.previous_choice_revision !== undefined &&
    intent.choice_revision !== intent.previous_choice_revision + 1
  )
    throw Error("PERSON_CHOICE_REVISION_CONFLICT");
  if (!rawRoster)
    return {
      decision: "BLOCKED",
      intent,
      reason: "ROSTER_READER_UNAVAILABLE",
      writes: 0,
    };
  const roster = rosterContract.parse(rawRoster);
  scope(context, roster);
  if (roster.revision !== intent.expected_roster_revision)
    throw Error("ROSTER_REVISION_CONFLICT");
  if (
    roster.revision === null &&
    (!roster.fingerprint || roster.fingerprint !== intent.expected_roster_fingerprint)
  )
    throw Error("ROSTER_FINGERPRINT_CONFLICT");
  if (
    (intent.choice === "MATCH_EXISTING" &&
      !roster.people.some((p) => p.person_id === intent.person_id)) ||
    (intent.choice !== "MATCH_EXISTING" && intent.person_id)
  )
    throw Error("EXPLICIT_PERSON_CHOICE_REQUIRED");
  return {
    decision: intent.choice,
    intent,
    requires_trusted_confirmation: intent.choice !== "UNRESOLVED",
    automatic_aka_writes: false,
    account_connections: 0,
    writes: 0,
  };
}
export function prepareTravelerPlan(raw: unknown) {
  // Uses the actual unlinked-traveler request; no alias/Account/membership writer.
  return {
    decision: "CREATE",
    owning_request: personCloudCreateSchema.parse(raw),
    requires_trusted_confirmation: true,
    dispatch: "NOT_CONNECTED",
  };
}
export function prepareAliasPlan(raw: unknown) {
  const intent = aliasIntent.parse(raw);
  if (
    (intent.action === "CORRECT" || intent.action === "SUPPRESS") &&
    !intent.replaces_alias_id
  )
    throw Error("EXACT_ALIAS_ID_REQUIRED");
  return {
    decision: "BLOCKED",
    intent,
    reason: "AUTH_ALIAS_READER_MUTATION_AND_SCOPE_NOT_QUALIFIED",
    requires_trusted_confirmation: true,
  };
}

export const moneyObservation = z.strictObject({
  key: reference,
  arrangement_key: reference,
  title: z.string().trim().min(1).max(200).optional(),
  economic_date: z.iso.date().optional(),
  item_id: uuid.optional(),
  item_ids: z.array(uuid).max(100).optional(),
  existing_expense_id: uuid.optional(),
  nature: z.enum(["TOTAL", "QUOTE", "DEPOSIT", "BALANCE", "REFUND", "PAYMENT"]),
  money: ledgerMoneySchema.refine((m) => Number.isSafeInteger(m.minor) && m.minor > 0),
  paid: z.enum(["YES", "NO", "UNKNOWN"]),
  source_refs: z.array(reference).min(1).max(20),
  payer_person_id: uuid.optional(),
  split_person_ids: z.array(uuid).max(256).optional(),
});
export const expenseSnapshotContract = z.strictObject({
  account_id: uuid,
  trip_id: uuid,
  complete: z.literal(true),
  links_complete: z.boolean().optional(),
  expenses: z
    .array(
      z.strictObject({
        expense_id: uuid,
        revision: z.number().int().positive(),
        arrangement_key: reference,
        title: z.string().optional(),
        economic_date: z.iso.date().optional(),
        original: ledgerMoneySchema,
        payer_person_id: uuid,
        split_person_ids: z.array(uuid).min(1).max(256),
      }),
    )
    .max(500),
  links: z.array(z.strictObject({ expense_id: uuid, item_id: uuid })).max(1000),
});
export function reviewMoney(
  context: { account_id: string; trip_id: string },
  observations: unknown[],
  rawSnapshot: unknown | null,
) {
  const values = observations.map((o) => moneyObservation.parse(o));
  if (new Set(values.map((o) => o.key)).size !== values.length)
    throw Error("DUPLICATE_MONEY_OBSERVATION_ID");
  const snapshot =
    rawSnapshot === null ? null : expenseSnapshotContract.parse(rawSnapshot);
  if (snapshot) scope(context, snapshot);
  return values.map((o) => {
    const related = values.filter((r) => r.arrangement_key === o.arrangement_key);
    const totals = related.filter((r) => r.nature === "TOTAL");
    const matches =
      snapshot?.expenses.filter((e) =>
        o.existing_expense_id
          ? e.expense_id === o.existing_expense_id
          : e.arrangement_key === o.arrangement_key,
      ) ?? [];
    const existing = matches.length === 1 ? matches[0] : null;
    const possible =
      snapshot?.expenses.filter(
        (e) =>
          !o.existing_expense_id &&
          e.arrangement_key !== o.arrangement_key &&
          ((o.title && nameKey(e.title ?? "") === nameKey(o.title)) ||
            (contentDigest(e.original) === contentDigest(o.money) &&
              (!o.economic_date ||
                !e.economic_date ||
                o.economic_date === e.economic_date))),
      ) ?? [];
    let decision = "NEEDS_INPUT",
      reason = "CONFIRM_PAYER_SPLITS_AND_EXPENSE_IDENTITY";
    if (!snapshot) {
      decision = "BLOCKED";
      reason = "EXPENSE_READER_UNAVAILABLE_NOT_ZERO_EXPENSES";
    } else if (o.nature === "QUOTE") {
      decision = "NO_CHANGE";
      reason = "QUOTE_NOT_PAID_EXPENSE";
    } else if (o.nature !== "TOTAL") {
      decision = "NEEDS_INPUT";
      reason =
        o.nature === "REFUND"
          ? "CLARIFY_REFUND_OF_CONSUMPTION_VS_PAYMENT_NO_AUTOMATIC_NETTING"
          : totals.length
            ? "PAYMENT_OR_BALANCE_NOT_ADDITIONAL_CONSUMPTION"
            : "DETERMINE_EXPENSE_VS_PAYMENT_EVIDENCE";
    } else if (totals.some((t) => contentDigest(t.money) !== contentDigest(o.money)))
      reason = "CONFLICTING_TOTALS_OR_CURRENCIES";
    else if (o.existing_expense_id && !existing) {
      decision = "BLOCKED";
      reason = "REQUESTED_EXPENSE_NOT_VISIBLE";
    } else if (matches.length > 1) reason = "AMBIGUOUS_EXISTING_EXPENSES";
    else if (
      totals.find((t) => contentDigest(t.money) === contentDigest(o.money))?.key !== o.key
    ) {
      decision = "NO_CHANGE";
      reason = "DUPLICATE_TOTAL_EVIDENCE_NOT_ANOTHER_EXPENSE";
    } else if (existing) {
      const samePayer =
        !o.payer_person_id || o.payer_person_id === existing.payer_person_id;
      const sameSplits =
        !o.split_person_ids ||
        contentDigest([...o.split_person_ids].sort()) ===
          contentDigest([...existing.split_person_ids].sort());
      decision =
        contentDigest(existing.original) === contentDigest(o.money) &&
        samePayer &&
        sameSplits
          ? "NO_CHANGE"
          : "UPDATE";
      reason = "CONFIRM_EXISTING_EXPENSE_MATCH_AND_DIFF";
    } else if (possible.length) {
      reason = "CHOOSE_EXISTING_EXPENSE_ID_OR_CONFIRM_DISTINCT_CHARGE";
    } else if (o.payer_person_id && o.split_person_ids?.length) {
      decision = "CREATE";
      reason = "CANDIDATE_ONLY_VALIDATE_EXACT_LEDGER_AGGREGATE";
    }
    const links = [
      ...new Set([...(o.item_id ? [o.item_id] : []), ...(o.item_ids ?? [])]),
    ].flatMap((itemId) =>
      existing
        ? [
            snapshot!.links.some(
              (l) => l.expense_id === existing.expense_id && l.item_id === itemId,
            )
              ? {
                  decision: "NO_CHANGE",
                  expense_id: existing.expense_id,
                  item_id: itemId,
                }
              : {
                  decision: "BLOCKED",
                  ...(snapshot!.links_complete === false
                    ? {}
                    : { proposed_action: "LINK" }),
                  expense_id: existing.expense_id,
                  item_id: itemId,
                  reason:
                    snapshot!.links_complete === false
                      ? "LINK_READER_UNAVAILABLE_NOT_PROOF_OF_MISSING_LINK"
                      : "OWNING_LINK_CAPABILITY_NOT_CONNECTED",
                },
          ]
        : [],
    );
    return {
      ...o,
      decision,
      reason,
      expense_id: existing?.expense_id ?? null,
      expected_revision: existing?.revision ?? null,
      existing_money: existing?.original ?? null,
      possible_existing_expense_ids: possible.map((e) => e.expense_id),
      link: links[0] ?? null,
      links,
      payment_claimed_by_source: o.paid === "YES",
      payment_evidence_qualified: false,
      requires_trusted_confirmation: decision === "CREATE" || decision === "UPDATE",
      writes: 0,
    };
  });
}
export function prepareExpensePlan(kind: "CREATE" | "UPDATE", raw: unknown) {
  const request =
    kind === "CREATE"
      ? createLedgerExpenseRequestSchema.parse(raw)
      : updateLedgerExpenseRequestSchema.parse(raw);
  const people = request.participants.map((p) => p.memberId),
    splits = request.splits.map((s) => s.memberId);
  if (
    new Set(people).size !== people.length ||
    new Set(splits).size !== splits.length ||
    people.length !== splits.length ||
    splits.some((id) => !people.includes(id)) ||
    request.splits.reduce((sum, s) => sum + s.originalMinor, 0) !== request.original.minor
  )
    throw Error("EXACT_ALLOCATION_REQUIRED");
  return {
    decision: kind,
    owning_request: request,
    requires_trusted_confirmation: true,
    dispatch: "NOT_CONNECTED",
  };
}
export const expenseLinkIntent = z.strictObject({
  trip_id: uuid,
  expense_id: uuid,
  item_id: uuid,
  operation_id: uuid,
  action: z.enum(["LINK", "UNLINK"]),
  expected_expense_revision: z.number().int().positive(),
  expected_item_revision: z.number().int().positive(),
});
export function prepareExpenseLinkPlan(raw: unknown) {
  return {
    decision: "BLOCKED",
    intent: expenseLinkIntent.parse(raw),
    reason: "CORE_LEDGER_OWNING_CAPABILITY_REQUIRED",
    writes: 0,
  };
}
