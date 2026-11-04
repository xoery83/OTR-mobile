import { ZodError } from "zod";
import {
  itinerary_eventsSchema,
  trip_instruction_entriesSchema,
  type CoreItem,
  type CoreInstruction,
} from "./tripCoreV2";
import { validateCoreCommand } from "./tripCoreV2Commands";
import {
  applyCoreCommand,
  type CoreActor,
  type CoreGraph,
  type CoreRow,
} from "./tripCoreV2Mutation";

export type CoreInstructionParentScope = Readonly<{
  parentItemId: string;
  family: CoreItem["experience_family"];
  section: CoreInstruction["section"];
}>;

export class CoreInstructionScopeError extends Error {
  readonly code = "CORE_INSTRUCTION_SCOPE_UNRESOLVED" as const;
  constructor() {
    super("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
    this.name = "CoreInstructionScopeError";
  }
}
const canonicalScopeErrors = new Set([
  "INVALID_TARGET_KIND",
  "INVALID_BASE_VECTOR",
  "UNUSED_BASE_VECTOR",
  "INVALID_ADMISSION_BINDING",
  "TRIP_NOT_AUTHORIZED",
  "INVALID_PROVENANCE",
  "NOT_VISIBLE",
  "REVISION_CONFLICT",
  "REVISION_OVERFLOW",
  "SCOPE_NOT_AUTHORIZED",
  "CROSS_TRIP_PERSON",
  "CROSS_TRIP_REFERENCE",
  "DUPLICATE_CORE_ROW",
  "ORPHAN_CORE_ROW",
  "INVALID_CORRECTION_CHAIN",
]);

// Only NEW-submit parent scope resolution on the authorized pre-command graph.
// This is not Source provenance, a receipt resolver, or permission to dispatch.
export function resolveCoreInstructionParentForSubmit(
  graph: CoreGraph,
  actor: CoreActor,
  input: unknown,
  now: string,
): CoreInstructionParentScope {
  try {
    const command = validateCoreCommand(input);
    if (
      command.admission.mode !== "MANUAL" ||
      !["APPEND_INSTRUCTION", "CORRECT_INSTRUCTION"].includes(command.command)
    )
      throw new CoreInstructionScopeError();
    const unique = (rows: CoreRow[], id: unknown) => {
      const found = rows.filter((r) => r.id === id);
      if (found.length !== 1) throw new CoreInstructionScopeError();
      return found[0];
    };
    const payload = command.payload as { itemId?: string; section?: string };
    let parentId: unknown = payload.itemId,
      section: unknown = payload.section;
    // Immutable identity comes from actual entry records, not the ITEM-shaped
    // interpretation of target.id or a UI parent/family hint.
    if (command.command === "CORRECT_INSTRUCTION") {
      const target = unique(graph.trip_instruction_entries, command.target.id);
      parentId = target.event_id;
      section = target.section;
      let row: CoreRow = target;
      const seen = new Set<unknown>();
      let childId: unknown = null;
      while (true) {
        if (
          seen.has(row.id) ||
          row.trip_id !== actor.tripId ||
          row.event_id !== parentId ||
          row.section !== section ||
          row.hidden_at !== null
        )
          throw new CoreInstructionScopeError();
        seen.add(row.id);
        const next = graph.trip_instruction_entries.filter(
          (r) => r.supersedes_id === row.id,
        );
        if (
          next.length !== (childId === null ? 0 : 1) ||
          (childId !== null && next[0].id !== childId)
        )
          throw new CoreInstructionScopeError();
        if (row.supersedes_id === null) break;
        childId = row.id;
        row = unique(graph.trip_instruction_entries, row.supersedes_id);
      }
    }
    const parent = unique(graph.itinerary_events, parentId);
    if (
      parent.trip_id !== actor.tripId ||
      parent.hidden_at !== null ||
      parent.status === "cancelled" ||
      parent.status === "skipped"
    )
      throw new CoreInstructionScopeError();
    // Reuse canonical current Actor/Trip management, old/new/null bases,
    // head checks and graph validation. Discard the cloned preview completely.
    // Never rebase to fit an optimistic post-command graph.
    applyCoreCommand(graph, command, actor, now, false, undefined, true);
    return {
      parentItemId: String(parent.id),
      family: itinerary_eventsSchema.shape.experience_family.parse(
        parent.experience_family,
      ),
      section: trip_instruction_entriesSchema.shape.section.parse(section),
    };
  } catch (error) {
    if (error instanceof CoreInstructionScopeError) throw error;
    // Expected validation/ACL/CAS refusals expose no body or hidden facts.
    if (
      error instanceof ZodError ||
      (error instanceof Error && canonicalScopeErrors.has(error.message))
    )
      throw new CoreInstructionScopeError();
    // A programmer fault is still fail-closed, but must remain diagnosable.
    throw error;
  }
}
