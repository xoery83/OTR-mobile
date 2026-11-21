import type { z } from "zod";
import { createPeopleFlowView, type DirectedClaimPeopleReadback } from "./directedInviteControllers";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import type { createClaimResolutionRepository } from "@/data/repositories/claimResolutionRepository";
import { claimResolutionCommandSchema, claimResolutionRequestViewSchema, type ClaimResolutionCommand } from "@/data/api/claimResolutionContracts";
import { personCloudCreateSchema } from "@/domain/trip/tripPersonCloudCreate";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";

type Reader = ReturnType<typeof createClaimResolutionRepository>;
type Attempts = ReturnType<typeof createMemberClaimAttemptRepository>;
type View = NonNullable<Awaited<ReturnType<Reader["readView"]>>>;
export type ClaimResolutionChoice = View["eligibleActions"][number];
type Person = Readonly<{ personId: string; displayName: string }>;
export type ClaimResolutionControllerPorts = {
  account(): Promise<string>;
  reader: Pick<Reader, "readView">;
  attempts: Pick<Attempts, "readResolution" | "executeResolutionOnce" | "recoverResolution" | "clearResolvedResolution">;
  readPeople(context: AccountRequestContext): Promise<DirectedClaimPeopleReadback & { labels: readonly Person[] }>;
  // Prepare only: existing parent provenance, no Person creation/queue/dispatch before claimant consent.
  prepareNewPerson?(context: AccountRequestContext, displayName: string, requestId: string, expectedRevision: number): Promise<z.infer<typeof personCloudCreateSchema>>;
};
export type ClaimResolutionControllerState = Readonly<{
  phase: "LOADING" | "READY" | "BUSY" | "UNKNOWN" | "UNAVAILABLE" | "NOT_VISIBLE";
  view: View | null;
  people: readonly Person[];
  eligibleActions: readonly ClaimResolutionChoice[];
  choice: ClaimResolutionChoice | null;
  selectedPersonId: string | null;
  newPersonName: string;
  operationId: string | null;
  memberReadbackVerified?: boolean;
  needsMemberReadback?: boolean;
}>;

// Presentation/controller for the existing online attempt repository, never membership authority or a sync queue.
export function createClaimResolutionController(context: AccountRequestContext, requestId: string, ports: ClaimResolutionControllerPorts) {
  coreUuid.parse(requestId);
  const model = createPeopleFlowView<ClaimResolutionControllerState>(context, ports.account, {
    phase: "LOADING", view: null, people: [], eligibleActions: [], choice: null,
    selectedPersonId: null, newPersonName: "", operationId: null,
    memberReadbackVerified: false, needsMemberReadback: false,
  });
  context = model.context;
  let running = false;
  async function certifiedPeople() {
    const read = await ports.readPeople(model.context);
    await model.guard();
    if (read.status !== "EXECUTED" || read.context.accountId !== context.accountId ||
        read.context.tripId !== context.tripId || read.context.generation !== context.generation ||
        !Number.isSafeInteger(read.refreshGeneration) || read.refreshGeneration < 1 ||
        read.accepted?.certificate.applied_generation !== read.refreshGeneration)
      throw Error("CLAIM_RESOLUTION_PEOPLE_READ_REQUIRED");
    return { ...read, accepted: read.accepted };
  }
  async function readView() {
    const value = claimResolutionRequestViewSchema.nullable().parse(await ports.reader.readView(model.context, requestId));
    await model.guard();
    if (value && (value.accountId !== context.accountId || value.tripId !== context.tripId || value.requestId !== requestId))
      throw Error("CLAIM_RESOLUTION_VIEW_SCOPE_MISMATCH");
    return value;
  }
  async function refresh(minimumRevision = 0, expectedOutcome?: string) {
    model.update({ memberReadbackVerified: false });
    const value = await readView();
    if (!value) {
      model.update({ phase: "NOT_VISIBLE", view: null, people: [], eligibleActions: [],
        needsMemberReadback: expectedOutcome === "LINKED" });
      return;
    }
    if (value.snapshot.revision < minimumRevision || (value.snapshot.revision === minimumRevision &&
        expectedOutcome && value.snapshot.state !== expectedOutcome)) throw Error("CLAIM_RESOLUTION_STALE_READ");
    if (value.snapshot.state === "LINKED" && value.snapshot.claimantAccountId === context.accountId) {
      model.update({ view: value, needsMemberReadback: true, eligibleActions: [] });
      const read = await certifiedPeople();
      const proposal = value.snapshot.proposal;
      const personId = proposal.kind === "EXISTING_PERSON" ? proposal.personId : proposal.create.personId;
      const own = read.accepted.people.filter(person => person.isCurrentActor);
      if (own.length !== 1 || own[0].personId !== personId || !own[0].connected)
        throw Error("CLAIM_RESOLUTION_MEMBER_READ_REQUIRED");
      model.update({ phase: "READY", people: [], memberReadbackVerified: true, needsMemberReadback: false });
      return read;
    }
    if (!value.eligibleActions.length) {
      model.update({ phase: "READY", view: value, people: [], eligibleActions: [] });
      return;
    }
    const read = await certifiedPeople();
    const available = new Set(read.accepted.people.filter(person => !person.connected).map(person => person.personId));
    const people = read.labels.filter(person => available.has(person.personId));
    model.update({ phase: "READY", view: value, people,
      eligibleActions: value.eligibleActions.filter(action => action !== "CREATE_NEW" || !!ports.prepareNewPerson),
    });
  }
  async function fail() {
    try {
      await model.guard();
      const original = await ports.attempts.readResolution(model.context);
      await model.guard();
      model.update({ phase: original?.original.requestId === requestId && !original.receipt && !(original.rejection && original.rejectionSource === "INITIAL_EXECUTION") ? "UNKNOWN" : "UNAVAILABLE",
        operationId: original?.original.requestId === requestId ? original.original.operationId : null,
        eligibleActions: [], memberReadbackVerified: false,
        needsMemberReadback: model.getSnapshot().needsMemberReadback ||
          (original?.original.requestId === requestId && original.receipt?.outcome === "LINKED") });
    } catch { await model.fail({ phase: "UNAVAILABLE", eligibleActions: [], memberReadbackVerified: false, needsMemberReadback: false }); }
  }
  async function finish(operationId: string) {
    await model.guard();
    const original = await ports.attempts.readResolution(model.context);
    await model.guard();
    if (!original?.receipt || original.original.operationId !== operationId) throw Error("CLAIM_RESOLUTION_RECEIPT_REQUIRED");
    const linked = original.receipt.outcome === "LINKED";
    model.update({ needsMemberReadback: linked, memberReadbackVerified: false });
    const refreshed = await refresh(original.receipt.afterRevision, original.receipt.outcome);
    if (linked) {
      const read = refreshed ?? await certifiedPeople();
      const target = read.accepted.people.filter(person => person.personId === original.receipt!.effects.linkedPersonId && person.connected);
      const claimant = model.getSnapshot().view?.snapshot.claimantAccountId === context.accountId;
      const own = read.accepted.people.filter(person => person.isCurrentActor);
      if (target.length !== 1 || (claimant && (!target[0].isCurrentActor || own.length !== 1)))
        throw Error("CLAIM_RESOLUTION_MEMBER_READ_REQUIRED");
      model.update({ needsMemberReadback: false, memberReadbackVerified: claimant });
    }
    await ports.attempts.clearResolvedResolution(model.context, operationId);
    await model.guard();
  }
  async function conflict(operationId: string, currentRevision: number | null) {
    await ports.attempts.clearResolvedResolution(model.context, operationId);
    await model.guard();
    model.update({ choice: null, operationId: null, eligibleActions: [] });
    await refresh(currentRevision ?? 0);
  }
  async function exclusive(work: () => Promise<void>) {
    if (running) return;
    running = true;
    try { await model.guard(); await work(); }
    catch { await fail(); }
    finally { running = false; }
  }
  return {
    context: model.context, getSnapshot: model.getSnapshot, subscribe: model.subscribe, dispose: model.dispose,
    load: () => exclusive(async () => {
      model.update({ phase: "LOADING", eligibleActions: [], memberReadbackVerified: false, needsMemberReadback: false });
      const retained = await ports.attempts.readResolution(model.context);
      await model.guard();
      if (retained) {
        if (retained.original.requestId !== requestId) throw Error("CLAIM_RESOLUTION_ORIGINAL_MISMATCH");
        model.update({ operationId: retained.original.operationId });
        if (retained.rejection && retained.rejectionSource === "INITIAL_EXECUTION") {
          await conflict(retained.original.operationId, retained.rejection.currentRevision);
          return;
        }
        if (!retained.receipt) {
          const value = await readView();
          model.update({ phase: "UNKNOWN", view: value, people: [], eligibleActions: [] });
          return;
        }
        await finish(retained.original.operationId);
      } else await refresh();
    }),
    choose(choice: ClaimResolutionChoice) {
      const state = model.getSnapshot();
      if (state.phase === "READY" && state.eligibleActions.includes(choice)) model.update({ choice });
    },
    selectPerson(personId: string) {
      const state = model.getSnapshot();
      if (state.phase === "READY" && state.people.some(person => person.personId === personId)) model.update({ selectedPersonId: personId });
    },
    changeName(newPersonName: string) { if (model.getSnapshot().phase === "READY") model.update({ newPersonName }); },
    submit: () => exclusive(async () => {
      const state = model.getSnapshot(), choice = state.choice;
      if (state.phase !== "READY" || !choice || !state.view || !state.eligibleActions.includes(choice)) return;
      model.update({ phase: "BUSY", eligibleActions: [] });
      let decision: Extract<ClaimResolutionCommand, { kind: "RESOLVE_CLAIM_REQUEST" }>["decision"];
      if (choice === "CREATE_NEW") {
        const name = personCloudCreateSchema.shape.displayName.parse(state.newPersonName.trim());
        if (!ports.prepareNewPerson) throw Error("CLAIM_PERSON_INTENT_UNAVAILABLE");
        const create = personCloudCreateSchema.parse(await ports.prepareNewPerson(model.context, name, requestId, state.view.snapshot.revision));
        await model.guard();
        if (create.tripId !== context.tripId || create.displayName !== name) throw Error("CLAIM_PERSON_INTENT_SCOPE");
        decision = { kind: choice, create };
      } else if (choice === "CHOOSE_ANOTHER") {
        if (!state.people.some(person => person.personId === state.selectedPersonId) || state.selectedPersonId === state.view.snapshot.originalPersonId)
          throw Error("CLAIM_PERSON_SELECTION_REQUIRED");
        decision = { kind: choice, personId: state.selectedPersonId! };
      } else decision = { kind: choice };
      const command = claimResolutionCommandSchema.parse({ kind: "RESOLVE_CLAIM_REQUEST", requestId,
        operationId: createUuid(), expectedRevision: state.view.snapshot.revision, decision });
      model.update({ operationId: command.operationId });
      const result = await ports.attempts.executeResolutionOnce(model.context, command);
      await model.guard();
      if (result.status === "CONFLICT" || result.status === "DENIED") { await conflict(command.operationId, result.status === "CONFLICT" ? result.currentRevision : null); return; }
      if (result.status !== "RECORDED") { await fail(); return; }
      await finish(command.operationId);
    }),
    checkOriginal: () => exclusive(async () => {
      const retained = await ports.attempts.readResolution(model.context);
      await model.guard();
      if (!retained && model.getSnapshot().needsMemberReadback) { await refresh(); return; }
      if (!retained || retained.original.requestId !== requestId) throw Error("CLAIM_RESOLUTION_ORIGINAL_REQUIRED");
      if (retained.rejection && retained.rejectionSource === "INITIAL_EXECUTION") {
        await conflict(retained.original.operationId, retained.rejection.currentRevision);
        return;
      }
      if (retained.receipt) { await finish(retained.original.operationId); return; }
      const result = await ports.attempts.recoverResolution(model.context);
      await model.guard();
      if (result.status === "CONFLICT") { await conflict(retained.original.operationId, null); return; }
      if (result.status !== "FOUND") { model.update({ phase: "UNKNOWN", eligibleActions: [] }); return; }
      await finish(retained.original.operationId);
    }),
    consent: () => exclusive(async () => {
      const state = model.getSnapshot();
      if (state.phase !== "READY" || !state.view?.canConsent) return;
      const command = claimResolutionCommandSchema.parse({ kind: "CONSENT_TO_RESOLUTION", requestId,
        operationId: createUuid(), expectedRevision: state.view.snapshot.revision,
        proposalDigest: state.view.snapshot.proposalDigest, explicitConsent: true });
      model.update({ phase: "BUSY", eligibleActions: [], operationId: command.operationId });
      const result = await ports.attempts.executeResolutionOnce(model.context, command);
      await model.guard();
      if (result.status === "CONFLICT" || result.status === "DENIED") { await conflict(command.operationId, result.status === "CONFLICT" ? result.currentRevision : null); return; }
      if (result.status !== "RECORDED") { await fail(); return; }
      await finish(command.operationId);
    }),
  };
}
