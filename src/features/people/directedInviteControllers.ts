import type { z } from "zod";
import type {
  directedInviteRecipientsSchema,
  directedInvitationDetailSchema,
} from "@/data/api/directedInviteReadContracts";
import type { createDirectedInviteReadRepository } from "@/data/repositories/directedInviteReadRepository";
import type { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import type { CoreAcceptedPeopleConnections } from "@/data/repositories/tripCoreV2Repository";
import type { MemberClaimCommand } from "@/data/api/memberClaimContracts";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";

type Reader = ReturnType<typeof createDirectedInviteReadRepository>;
type Attempts = ReturnType<typeof createMemberClaimAttemptRepository>;
type Outcome = NonNullable<Awaited<ReturnType<Attempts["read"]>>>["outcome"];
type Ports = Readonly<{ account(): Promise<string>; reader: Reader; attempts: Attempts }>;
type Recipients = z.infer<typeof directedInviteRecipientsSchema>;
type Detail = z.infer<typeof directedInvitationDetailSchema>;

// Same subscription shape as the existing preview model; presentation state only, never authority or a queue.
export function createPeopleFlowView<T>(input: AccountRequestContext, account: Ports["account"], initial: T) {
  const context = Object.freeze({ ...input });
  coreUuid.parse(context.accountId);
  coreUuid.parse(context.tripId);
  let active = true,
    snapshot = Object.freeze(initial);
  const listeners = new Set<() => void>();
  return {
    context,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (active) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async guard() {
      if (!active) throw Error("DIRECTED_FLOW_DISPOSED");
      await assertAccountRequestContext(context, account);
      if (!active) throw Error("DIRECTED_FLOW_DISPOSED");
    },
    async fail(next: Partial<T>) {
      try {
        await this.guard();
        this.update(next);
      } catch {
        /* Old views never publish. */
      }
    },
    update(next: Partial<T>) {
      if (active && context.generation === getAccountGeneration()) {
        snapshot = Object.freeze({ ...snapshot, ...next });
        for (const notify of listeners) notify();
      }
    },
    dispose() {
      active = false;
      listeners.clear();
    },
  };
}
export type DirectedInviteState = Readonly<{
  phase: "LOADING" | "READY" | "BUSY" | "UNKNOWN" | "ISSUED" | "UNAVAILABLE";
  recipients: Recipients | null;
  selectedAccountId: string | null;
  outcome: Outcome;
  operationId: string | null;
}>;
export function createDirectedInviteController(
  input: AccountRequestContext,
  personId: string,
  ports: Ports,
) {
  coreUuid.parse(personId);
  const model = createPeopleFlowView<DirectedInviteState>(input, ports.account, {
    phase: "LOADING",
    recipients: null,
    selectedAccountId: null,
    outcome: null,
    operationId: null,
  });
  let running = false;
  const matches = (command: MemberClaimCommand) =>
    command.kind === "ISSUE_TARGETED_INVITE" &&
    command.tripId === model.context.tripId &&
    command.personId === personId &&
    command.target.kind === "REGISTERED_ACCOUNT";
  async function recordFailure() {
    try {
      await model.guard();
      const retained = await ports.attempts.read(model.context);
      await model.guard();
      model.update({
        phase:
          retained && matches(retained.original) && !retained.rejection
            ? "UNKNOWN"
            : "UNAVAILABLE",
        operationId:
          retained && matches(retained.original) ? retained.original.operationId : null,
        selectedAccountId:
          retained?.original.kind === "ISSUE_TARGETED_INVITE" &&
          retained.original.target.kind === "REGISTERED_ACCOUNT"
            ? retained.original.target.accountId
            : null,
      });
    } catch {
      await model.fail({ phase: "UNAVAILABLE" });
    }
  }
  async function issued(outcome: NonNullable<Outcome>, operationId: string) {
    await model.guard();
    if (outcome.status !== "ISSUED" || outcome.personId !== personId)
      throw Error("DIRECTED_INVITE_OUTCOME_MISMATCH");
    // The immutable archive survives closing/restarting; ISSUED still does not mean B accepted.
    await ports.attempts.clearResolved(model.context, operationId);
    await model.guard();
    model.update({
      phase: "ISSUED",
      outcome: Object.freeze({ ...outcome }),
      operationId,
    });
  }
  return {
    context: model.context,
    getSnapshot: model.getSnapshot,
    subscribe: model.subscribe,
    dispose: model.dispose,
    async load() {
      if (running) return;
      running = true;
      try {
        await model.guard();
        model.update({ phase: "LOADING" });
        const retained = await ports.attempts.read(model.context);
        await model.guard();
        if (retained && !matches(retained.original)) {
          model.update({ phase: "UNAVAILABLE" });
          return;
        }
        if (retained?.outcome) {
          await issued(retained.outcome, retained.original.operationId);
          return;
        }
        if (retained?.rejection) {
          await ports.attempts.clearResolved(
            model.context,
            retained.original.operationId,
          );
          await model.guard();
        }
        if (retained && !retained.rejection) {
          model.update({
            phase: "UNKNOWN",
            operationId: retained.original.operationId,
            selectedAccountId:
              retained.original.kind === "ISSUE_TARGETED_INVITE" &&
              retained.original.target.kind === "REGISTERED_ACCOUNT"
                ? retained.original.target.accountId
                : null,
          });
          return;
        }
        const result = await ports.reader.recipients(model.context);
        await model.guard();
        if (
          result.accountId !== model.context.accountId ||
          result.tripId !== model.context.tripId
        )
          throw Error("DIRECTED_INVITE_READER_SCOPE_MISMATCH");
        const recipients = Object.freeze({
          ...result,
          recipients: result.recipients.map((p) => Object.freeze({ ...p })),
        });
        Object.freeze(recipients.recipients);
        model.update({
          phase: "READY",
          recipients,
          selectedAccountId: null,
          outcome: null,
          operationId: null,
        });
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
    async select(accountId: string) {
      try {
        await model.guard();
        const state = model.getSnapshot();
        if (
          !running &&
          state.phase === "READY" &&
          state.recipients?.recipients.some((p) => p.accountId === accountId)
        )
          model.update({ selectedAccountId: accountId });
      } catch {
        /* An invalidated selection is never a new UI action. */
      }
    },
    async send() {
      const state = model.getSnapshot();
      if (
        running ||
        state.phase !== "READY" ||
        !state.selectedAccountId ||
        !state.recipients?.recipients.some((p) => p.accountId === state.selectedAccountId)
      )
        return;
      running = true;
      try {
        await model.guard();
        const operationId = createUuid();
        model.update({ phase: "BUSY", operationId });
        const result = await ports.attempts.executeOnce(model.context, {
          kind: "ISSUE_TARGETED_INVITE",
          operationId,
          tripId: model.context.tripId,
          personId,
          target: { kind: "REGISTERED_ACCOUNT", accountId: state.selectedAccountId },
        });
        await issued(result, operationId);
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
    async checkOriginal() {
      if (running || model.getSnapshot().phase !== "UNKNOWN") return;
      running = true;
      try {
        await model.guard();
        const retained = await ports.attempts.read(model.context);
        await model.guard();
        if (!retained || !matches(retained.original))
          throw Error("DIRECTED_INVITE_ORIGINAL_MISMATCH");
        const result = await ports.attempts.recover(model.context);
        await model.guard();
        if (result.status === "ABSENT_UNCONFIRMED") {
          model.update({ phase: "UNKNOWN" });
          return;
        }
        await issued(result, retained.original.operationId);
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
  };
}

export type DirectedClaimState = Readonly<{
  phase: "LOADING" | "READY" | "BUSY" | "UNKNOWN" | "AWAITING_READBACK" | "UNAVAILABLE";
  detail: Detail | null;
  outcome: Outcome;
  operationId: string | null;
  memberReadbackVerified: boolean;
}>;
export type DirectedClaimPeopleReadback =
  | Readonly<{
      status: "EXECUTED";
      refreshGeneration: number;
      context: AccountRequestContext;
      accepted: CoreAcceptedPeopleConnections | null;
    }>
  | Readonly<{
      status: "SKIPPED" | "UNKNOWN" | "FAILED";
      context: AccountRequestContext;
    }>;

export function createDirectedClaimController(
  input: AccountRequestContext,
  inviteId: string,
  ports: Ports &
    Readonly<{
      // Native must prove an actual scoped Core read before returning the accepted cache.
      refreshAndReadPeople(
        context: AccountRequestContext,
      ): Promise<DirectedClaimPeopleReadback>;
    }>,
) {
  coreUuid.parse(inviteId);
  const model = createPeopleFlowView<DirectedClaimState>(input, ports.account, {
    phase: "LOADING",
    detail: null,
    outcome: null,
    operationId: null,
    memberReadbackVerified: false,
  });
  let running = false;
  const matches = (command: MemberClaimCommand) =>
    command.kind === "CLAIM_PERSON" &&
    command.tripId === model.context.tripId &&
    command.inviteId === inviteId &&
    (!model.getSnapshot().detail ||
      command.personId === model.getSnapshot().detail!.invitation.personId);
  async function recordFailure() {
    try {
      await model.guard();
      const retained = await ports.attempts.read(model.context);
      await model.guard();
      const own = retained && matches(retained.original);
      model.update({
        phase:
          own && !retained.rejection
            ? retained.outcome
              ? "AWAITING_READBACK"
              : "UNKNOWN"
            : "UNAVAILABLE",
        operationId: own ? retained.original.operationId : null,
        memberReadbackVerified: false,
      });
    } catch {
      await model.fail({ phase: "UNAVAILABLE", memberReadbackVerified: false });
    }
  }
  async function readback(
    personId: string,
    outcome?: NonNullable<Outcome>,
    operationId?: string,
  ) {
    await model.guard();
    model.update({
      phase: "BUSY",
      outcome: outcome ? Object.freeze({ ...outcome }) : null,
      operationId: operationId ?? null,
      memberReadbackVerified: false,
    });
    if (
      outcome &&
      (!["LINKED", "ALREADY_LINKED"].includes(outcome.status) ||
        outcome.personId !== personId ||
        outcome.inviteId !== inviteId)
    )
      throw Error("DIRECTED_CLAIM_OUTCOME_MISMATCH");
    if (outcome?.currentAccess === "NONE") {
      if (operationId) {
        await ports.attempts.clearResolved(model.context, operationId);
        await model.guard();
      }
      model.update({ phase: "UNAVAILABLE" });
      return;
    }
    const read = await ports.refreshAndReadPeople(model.context);
    await model.guard();
    if (
      read.status !== "EXECUTED" ||
      read.context.accountId !== model.context.accountId ||
      read.context.tripId !== model.context.tripId ||
      read.context.generation !== model.context.generation
    ) {
      model.update({ phase: "AWAITING_READBACK" });
      return;
    }
    const accepted = read.accepted;
    const own = accepted?.people.filter((p) => p.isCurrentActor);
    if (
      !Number.isSafeInteger(read.refreshGeneration) ||
      read.refreshGeneration < 1 ||
      accepted?.certificate.applied_generation !== read.refreshGeneration ||
      !own ||
      own.length !== 1 ||
      !own[0].connected ||
      own[0].personId !== personId
    ) {
      model.update({ phase: "AWAITING_READBACK" });
      return;
    }
    if (operationId) {
      await ports.attempts.clearResolved(model.context, operationId);
      await model.guard();
    }
    model.update({ phase: "AWAITING_READBACK", memberReadbackVerified: true });
  }
  return {
    context: model.context,
    getSnapshot: model.getSnapshot,
    subscribe: model.subscribe,
    dispose: model.dispose,
    async load() {
      if (running) return;
      running = true;
      try {
        await model.guard();
        model.update({ phase: "LOADING", memberReadbackVerified: false });
        const retained = await ports.attempts.read(model.context);
        await model.guard();
        if (retained && !matches(retained.original)) {
          model.update({ phase: "UNAVAILABLE" });
          return;
        }
        if (retained?.outcome) {
          await readback(
            retained.original.personId,
            retained.outcome,
            retained.original.operationId,
          );
          return;
        }
        if (retained?.rejection) {
          await ports.attempts.clearResolved(
            model.context,
            retained.original.operationId,
          );
          await model.guard();
        }
        if (retained && !retained.rejection) {
          model.update({ phase: "UNKNOWN", operationId: retained.original.operationId });
          return;
        }
        const value = await ports.reader.invitation(model.context, inviteId);
        await model.guard();
        if (
          value.accountId !== model.context.accountId ||
          value.invitation.tripId !== model.context.tripId ||
          value.invitation.inviteId !== inviteId
        )
          throw Error("DIRECTED_CLAIM_READER_SCOPE_MISMATCH");
        const detail = Object.freeze({
          ...value,
          invitation: Object.freeze({ ...value.invitation }),
        });
        model.update({
          detail,
          phase: detail.invitation.status === "PENDING" ? "READY" : "UNAVAILABLE",
          outcome: null,
          operationId: null,
        });
        if (detail.invitation.status === "CLAIMED")
          await readback(detail.invitation.personId);
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
    async confirm() {
      const state = model.getSnapshot();
      if (
        running ||
        state.phase !== "READY" ||
        state.detail?.invitation.status !== "PENDING"
      )
        return;
      running = true;
      try {
        await model.guard();
        const operationId = createUuid();
        model.update({ phase: "BUSY", operationId });
        const result = await ports.attempts.executeOnce(model.context, {
          kind: "CLAIM_PERSON",
          tripId: model.context.tripId,
          personId: state.detail.invitation.personId,
          inviteId,
          operationId,
          explicitConsent: true,
        });
        await readback(state.detail.invitation.personId, result, operationId);
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
    async retryReadback() {
      const state = model.getSnapshot();
      if (
        running ||
        state.memberReadbackVerified ||
        state.phase !== "AWAITING_READBACK" ||
        state.operationId ||
        state.detail?.invitation.status !== "CLAIMED"
      )
        return;
      running = true;
      try {
        await model.guard();
        await readback(state.detail.invitation.personId);
      } catch {
        await model.fail({ phase: "AWAITING_READBACK", memberReadbackVerified: false });
      } finally {
        running = false;
      }
    },
    async checkOriginal() {
      if (running || model.getSnapshot().memberReadbackVerified) return;
      running = true;
      try {
        await model.guard();
        const retained = await ports.attempts.read(model.context);
        await model.guard();
        if (!retained || !matches(retained.original))
          throw Error("DIRECTED_CLAIM_ORIGINAL_MISMATCH");
        const result = await ports.attempts.recover(model.context);
        await model.guard();
        if (result.status === "ABSENT_UNCONFIRMED") {
          model.update({ phase: "UNKNOWN" });
          return;
        }
        await readback(retained.original.personId, result, retained.original.operationId);
      } catch {
        await recordFailure();
      } finally {
        running = false;
      }
    },
  };
}
