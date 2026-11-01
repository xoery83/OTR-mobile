import { z } from "zod";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import { createUuid } from "@/domain/localId";
import { coreUuid } from "@/domain/trip/tripCoreV2";

const actionSchema = z.enum(["CONFIRM", "REJECT"]);
const contextSchema = z.strictObject({
  accountId: coreUuid,
  tripId: coreUuid,
  generation: z.number().int().nonnegative(),
});
const invitationSchema = z
  .strictObject({
    evidence: z.literal("SYNTHETIC"),
    context: contextSchema,
    invitationId: coreUuid,
    status: z.enum(["PENDING", "EXPIRED", "REVOKED"]),
    suggestedPersonId: coreUuid.nullable(),
    people: z.array(z.strictObject({ personId: coreUuid, displayName: z.string() })),
  })
  .superRefine((value, ctx) => {
    const ids = value.people.map((p) => p.personId);
    if (
      new Set(ids).size !== ids.length ||
      (value.suggestedPersonId && !ids.includes(value.suggestedPersonId))
    )
      ctx.addIssue({ code: "custom" });
  });
const commandSchema = z.strictObject({
  evidence: z.literal("SYNTHETIC"),
  context: contextSchema,
  invitationId: coreUuid,
  operationId: coreUuid,
  action: actionSchema,
  personId: coreUuid.nullable(),
});
const responseSchema = commandSchema.extend({
  outcome: z.enum(["SIMULATED", "UNKNOWN", "EXPIRED", "REVOKED"]),
});
export type ClaimPreviewInvitation = z.infer<typeof invitationSchema>;
export type ClaimPreviewCommand = z.infer<typeof commandSchema>;
export type ClaimPreviewResponse = z.infer<typeof responseSchema>;
export type ClaimPreviewSnapshot = Readonly<{
  invitation: ClaimPreviewInvitation;
  selectedPersonId: string | null;
  stage: "REVIEW" | "CHOOSE_ANOTHER" | "CREATE_NEW";
  outcome: "IDLE" | "PENDING" | "SIMULATED" | "UNKNOWN" | "EXPIRED" | "REVOKED";
}>;

// Client interaction evidence only: no Token, server authority, permission queue or connection state.
export function createInviteClaimPreview(
  input: ClaimPreviewInvitation,
  respond: (command: ClaimPreviewCommand) => Promise<ClaimPreviewResponse>,
) {
  const invitation = invitationSchema.parse(input);
  let active = true;
  let running = false;
  let attempt: ClaimPreviewCommand | null = null;
  let state: ClaimPreviewSnapshot = {
    invitation,
    selectedPersonId: invitation.suggestedPersonId,
    stage: "REVIEW",
    outcome: invitation.status === "PENDING" ? "IDLE" : invitation.status,
  };
  const seal = (value: ClaimPreviewSnapshot) => {
    Object.freeze(value.invitation.context);
    value.invitation.people.forEach(Object.freeze);
    Object.freeze(value.invitation.people);
    Object.freeze(value.invitation);
    return Object.freeze(value);
  };
  state = seal(state);
  const listeners = new Set<() => void>();
  const valid = () => {
    if (!active) return false;
    try {
      assertAccountRequestGeneration(invitation.context);
      return true;
    } catch {
      return false;
    }
  };
  const publish = (change: Partial<ClaimPreviewSnapshot>) => {
    state = seal({ ...state, ...change });
    for (const listener of listeners) listener();
  };
  const editable = () => valid() && !running && !attempt && state.outcome === "IDLE";
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    chooseAnother() {
      if (editable()) publish({ stage: "CHOOSE_ANOTHER" });
    },
    createNew() {
      if (editable()) publish({ stage: "CREATE_NEW" });
    },
    cancelChoice() {
      if (editable()) publish({ stage: "REVIEW" });
    },
    selectPerson(personId: string) {
      if (editable() && state.invitation.people.some((p) => p.personId === personId))
        publish({ selectedPersonId: personId, stage: "REVIEW" });
    },
    // A synthetic AddTravelerSheet completion only; never saved as a real Person.
    previewNewPerson(person: ClaimPreviewInvitation["people"][number]) {
      if (!editable() || state.stage !== "CREATE_NEW") return;
      const parsed = invitationSchema.shape.people.element.parse(person);
      if (state.invitation.people.some((p) => p.personId === parsed.personId)) return;
      publish({
        invitation: { ...state.invitation, people: [...state.invitation.people, parsed] },
        selectedPersonId: parsed.personId,
        stage: "REVIEW",
      });
    },
    async submit(action: z.infer<typeof actionSchema>) {
      actionSchema.parse(action);
      if (
        !valid() ||
        running ||
        !["IDLE", "UNKNOWN"].includes(state.outcome) ||
        state.stage !== "REVIEW"
      )
        return;
      if (attempt && attempt.action !== action) return;
      if (!attempt && action === "CONFIRM" && !state.selectedPersonId) return;
      attempt ??= commandSchema.parse({
        evidence: "SYNTHETIC",
        context: invitation.context,
        invitationId: invitation.invitationId,
        operationId: createUuid(),
        action,
        personId: action === "CONFIRM" ? state.selectedPersonId : null,
      });
      const command = attempt;
      running = true;
      publish({ outcome: "PENDING" });
      try {
        const result = responseSchema.parse(await respond(commandSchema.parse(command)));
        if (!valid()) return;
        if (
          result.operationId !== command.operationId ||
          result.invitationId !== command.invitationId ||
          result.action !== command.action ||
          result.personId !== command.personId ||
          result.context.accountId !== command.context.accountId ||
          result.context.tripId !== command.context.tripId ||
          result.context.generation !== command.context.generation
        )
          throw Error("CLAIM_PREVIEW_RESPONSE_MISMATCH");
        publish({ outcome: result.outcome });
      } catch {
        if (valid()) publish({ outcome: "UNKNOWN" });
      } finally {
        running = false;
      }
    },
    dispose() {
      active = false;
      listeners.clear();
    },
  };
}
export type InviteClaimPreview = ReturnType<typeof createInviteClaimPreview>;
