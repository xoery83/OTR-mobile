import { parseMemberClaimQaCase } from "../../backend/src/tripMemberClaimQa";
import {
  createNormalRegisteredQaHostDependencies,
  runRegisteredQaHostSession,
  registeredHostQa,
} from "./registered-qa-host-session";
import {
  createMemberClaimQaReadback,
  createFreshInvitationQaReadback,
} from "./member-claim-qa-readback";
import {
  createRootMemberClaimQaResumeWindowQualifier,
  createRootFreshInvitationQaWindowQualifier,
} from "./member-claim-qa-control-read";
import { resumeMemberClaimQaScenario } from "./member-claim-qa-scenario";

type NormalAuth = Parameters<typeof createNormalRegisteredQaHostDependencies>;
type Control = Parameters<typeof createRootMemberClaimQaResumeWindowQualifier>;

type DriverInput = {
  windowId: string;
  expected: Control[0]["expected"];
  retainedIssue: Parameters<typeof resumeMemberClaimQaScenario>[1];
  receivers: { A: NormalAuth[0]; B: NormalAuth[0] };
  publicOptions: NormalAuth[2];
  query: Parameters<typeof createMemberClaimQaReadback>[1];
  noteAuth(actor: "A" | "B", value: Record<string, unknown>): void;
  retain: Parameters<typeof resumeMemberClaimQaScenario>[2]["retain"];
  signal?: AbortSignal;
  now?: () => number;
  controlExecute?: Control[1];
  fetchImplementation?: typeof fetch;
};

function runDriver(
  input: DriverInput,
  readbackFactory: (
    qa: ReturnType<typeof parseMemberClaimQaCase>,
    query: DriverInput["query"],
  ) => Pick<ReturnType<typeof createMemberClaimQaReadback>, "readReceipt" | "readInvite">,
  qualifierFactory = createRootMemberClaimQaResumeWindowQualifier,
) {
  const qa = parseMemberClaimQaCase(input.expected.qaCase);
  // This parser rejects foreign fixture IDs before opening any normal session.
  const readback = readbackFactory(qa, input.query);
  const qualify = qualifierFactory(
    {
      windowId: input.windowId,
      expected: input.expected,
      now: input.now,
    },
    input.controlExecute,
  );
  const ownerAuth = createNormalRegisteredQaHostDependencies(
    input.receivers.A,
    (value) => input.noteAuth("A", value),
    input.publicOptions,
  );
  const claimantAuth = createNormalRegisteredQaHostDependencies(
    input.receivers.B,
    (value) => input.noteAuth("B", value),
    input.publicOptions,
  );
  return qualify(qa).then(() =>
    resumeMemberClaimQaScenario(qa, input.retainedIssue, {
      allowOriginalIdSubmissions: true,
      withOwnerSession: (work) =>
        runRegisteredQaHostSession(ownerAuth, work, {
          accountId: qa.ownerAccountId,
          tripId: qa.tripId,
          email: "otr-qa-3f43c81b-500b-4e59-b0a8-c7ffdbd19a31@eldouzileu.resend.app",
        }),
      withClaimantSession: (work) =>
        runRegisteredQaHostSession(claimantAuth, work, {
          accountId: qa.claimantAccountId,
          tripId: qa.tripId,
          email: registeredHostQa.email,
          createdAt: registeredHostQa.createdAt,
        }),
      qualifyResumeWindow: qualify,
      readReceipt: readback.readReceipt,
      readInvite: readback.readInvite,
      retain: input.retain,
      signal: input.signal,
      now: input.now,
      fetchImplementation: input.fetchImplementation,
    }),
  );
}

// DEV-only composition, invoked only after exact approval and Root's active-window handshake.
export function runMemberClaimQaResumeDriver(input: DriverInput) {
  return runDriver(input, createMemberClaimQaReadback);
}

// A separately approved fresh invitation intent; the prior operations remain untouched.
export function runFreshInvitationQaDriver(input: DriverInput) {
  return runDriver(
    input,
    createFreshInvitationQaReadback,
    createRootFreshInvitationQaWindowQualifier,
  );
}
