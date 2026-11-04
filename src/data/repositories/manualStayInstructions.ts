import type { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { validateCoreCommand, type CoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  coreCanManage,
  type CoreActor,
  type CoreGraph,
} from "@/domain/trip/tripCoreV2Mutation";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";

const sections = {
  checkInInstruction: "ARRIVAL",
  checkOutInstruction: "DEPARTURE",
} as const;
type Field = keyof typeof sections;
type OwningEligibility = Awaited<
  ReturnType<
    ReturnType<typeof createTripCoreV2Repository>["manualInstructionEligibility"]
  >
>;
type EligibilityHints = ReadonlyMap<string, OwningEligibility>;
export type StayInstructionEntry = Readonly<{
  entryId: string;
  revision: number;
  body: string;
  supersedesId: string | null;
  sourceRepresentationId: string | null;
}>;
export type StayInstructionField = Readonly<{
  entries: readonly StayInstructionEntry[];
  editable: boolean;
  value: string;
}>;
export type StayInstructionDraft = Readonly<Record<Field, StayInstructionField>>;
const json = (value: unknown) => canonicalCoreJson(value as Json);

// Private binding is deliberately process-local. This is not persisted saved data.
const bindings = new WeakMap<
  StayInstructionDraft,
  {
    fingerprint: string;
    itemId: string;
    eligibility: EligibilityHints;
  }
>();
function snapshot(
  graph: CoreGraph,
  actor: CoreActor,
  itemId: string,
  eligibility: EligibilityHints,
) {
  const item = graph.itinerary_events.find((r) => r.id === itemId);
  const view = projectCoreItem(graph, actor, itemId);
  if (!item || item.hidden_at !== null || !view || view.family !== "P3")
    throw new Error("MANUAL_STAY_INSTRUCTION_SCOPE");
  const parentEditable = coreCanManage(graph, actor, "ITEM", item);
  const fields = Object.fromEntries(
    Object.entries(sections).map(([field, section]) => {
      const heads = view.instructionShortcuts.filter((r) => r.section === section);
      const rows = heads
        .map((head) => graph.trip_instruction_entries.find((r) => r.id === head.entryId)!)
        .filter((r) => r.hidden_at === null);
      const entries = rows.map((r) =>
        Object.freeze({
          entryId: String(r.id),
          revision: Number(r.revision),
          body: String(r.body),
          supersedesId: r.supersedes_id as string | null,
          sourceRepresentationId: r.source_representation_id as string | null,
        }),
      );
      // A Reader may redact a source reference to null. Null is not proof that an
      // existing head was handwritten. Until the owning commit port supplies its
      // eligibility proof, every existing head is conservatively read-only.
      const editable =
        parentEditable &&
        (heads.length === 0 ||
          (rows.length === 1 &&
            heads.length === 1 &&
            rows[0].source_representation_id === null &&
            eligibility.get(String(rows[0].id))?.status === "ELIGIBLE" &&
            coreCanManage(graph, actor, "INSTRUCTION", rows[0])));
      return [
        field,
        Object.freeze({
          entries: Object.freeze(entries),
          editable,
          value: rows.length === 1 ? String(rows[0].body) : "",
        }),
      ];
    }),
  ) as Record<Field, StayInstructionField>;
  return {
    fields,
    item,
    fingerprint: json({
      actor,
      item,
      fields,
      heads: graph.trip_instruction_entries.filter((r) =>
        view.instructionShortcuts.some((s) => s.entryId === r.id),
      ),
      acl: graph.trip_instruction_visibility_people.filter((r) =>
        view.instructionShortcuts.some((s) => s.entryId === r.instruction_id),
      ),
      parentAcl: graph.trip_item_visibility_people.filter((r) => r.item_id === itemId),
    }),
  };
}
export function readManualStayInstructions(
  graph: CoreGraph,
  actor: CoreActor,
  itemId: string,
  owningHints: EligibilityHints = new Map(),
): StayInstructionDraft {
  const eligibility = new Map(
    [...owningHints].map(([id, hint]) => [id, Object.freeze({ ...hint })]),
  );
  const current = snapshot(graph, actor, itemId, eligibility);
  const draft = Object.freeze(current.fields);
  bindings.set(draft, { fingerprint: current.fingerprint, itemId, eligibility });
  return draft;
}

// Pure command preparation only. Caller must use the existing owning transaction;
// this function never enqueues, dispatches, or manufactures a Hosted capability.
export function prepareManualStayInstruction(
  draft: StayInstructionDraft,
  graph: CoreGraph,
  actor: CoreActor,
  field: Field,
  body: string | undefined,
  ids: { operationId: string; entryId: string },
): CoreCommand | null {
  const binding = bindings.get(draft);
  if (!binding) throw new Error("MANUAL_STAY_INSTRUCTION_DRAFT");
  const current = snapshot(graph, actor, binding.itemId, binding.eligibility);
  if (binding.fingerprint !== current.fingerprint)
    throw new Error("MANUAL_STAY_INSTRUCTION_STALE");
  const selected = draft[field];
  if (body === undefined || body === selected.value) return null;
  if (!selected.editable) throw new Error("MANUAL_STAY_INSTRUCTION_READ_ONLY");
  if (!body.trim()) throw new Error("MANUAL_STAY_INSTRUCTION_EMPTY_NOT_CLEAR");
  const entry = selected.entries[0];
  const row =
    entry && graph.trip_instruction_entries.find((r) => r.id === entry.entryId)!;
  const people = (
    row
      ? graph.trip_instruction_visibility_people.filter(
          (r) => r.instruction_id === row.id,
        )
      : graph.trip_item_visibility_people.filter((r) => r.item_id === current.item.id)
  )
    .map((r) => String(r.person_id))
    .sort();
  const acl = { visibility: (row ?? current.item).visibility, people };
  return validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: ids.operationId,
    tripId: actor.tripId,
    command: entry ? "CORRECT_INSTRUCTION" : "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entry?.entryId ?? ids.entryId },
    baseVector: [
      {
        kind: "INSTRUCTION",
        id: entry?.entryId ?? ids.entryId,
        revision: entry?.revision ?? null,
      },
      ...(entry ? [{ kind: "INSTRUCTION", id: ids.entryId, revision: null }] : []),
      { kind: "ITEM", id: binding.itemId, revision: current.item.semantic_revision },
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: entry
      ? { newEntryId: ids.entryId, body, sensitivity: row!.sensitivity, acl }
      : {
          itemId: binding.itemId,
          section: sections[field],
          body,
          sensitivity: "NORMAL",
          sourceRepresentationId: null,
          acl,
        },
  });
}
