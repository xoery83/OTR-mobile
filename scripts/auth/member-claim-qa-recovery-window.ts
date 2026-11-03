import { z } from "zod";
import {
  parseMemberClaimQaCase,
  type MemberClaimQaCase,
} from "../../backend/src/tripMemberClaimQa";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const expectedSchema = z.strictObject({
  qaCase: z.unknown().transform(parseMemberClaimQaCase),
  image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  containerId: hash,
  configSHA256: hash,
  planSHA256: hash,
});
type QualificationInput = {
  expected: z.input<typeof expectedSchema>;
  readControl(): Promise<unknown>;
  now?: () => number;
};

// Expected identity is supplied from the frozen plan/staged CID, never learned from readControl().
function createWindowQualifier(
  input: QualificationInput,
  mode: "RECOVERY_ONLY" | "ORIGINAL_ID_RESUME" | "FRESH_INVITATION",
) {
  const recovery = mode === "RECOVERY_ONLY";
  const statuses = {
    RECOVERY_ONLY: "AUTH_C04_RECOVERY_WINDOW_QUALIFIED",
    ORIGINAL_ID_RESUME: "AUTH_C04_RESUME_WINDOW_QUALIFIED",
    FRESH_INVITATION: "AUTH_C04_FRESH_INVITATION_WINDOW_QUALIFIED",
  } as const;
  const controlSchema = expectedSchema.extend({
    status: z.literal(statuses[mode]),
    executionMode: z.literal(mode),
    businessMutationAuthorized: z.literal(!recovery),
  });
  const expected = expectedSchema.parse(input.expected);
  const readControl = input.readControl;
  const now = input.now ?? Date.now;
  const require = (ok: unknown) => {
    if (!ok) throw Error("C04_QA_RECOVERY_WINDOW_UNQUALIFIED");
  };
  require(
    Date.parse(expected.qaCase.closesAt) - Date.parse(expected.qaCase.opensAt) <=
      (recovery ? 900000 : 1800000) &&
      Date.parse(expected.qaCase.inviteExpiresAt) - Date.parse(expected.qaCase.opensAt) <=
        600000,
  );
  const sameCase = (value: MemberClaimQaCase) =>
    Object.entries(expected.qaCase).every(
      ([key, v]) => value[key as keyof MemberClaimQaCase] === v,
    );
  const current = () => {
    const time = now();
    require(
      Number.isFinite(time) &&
        time >= Date.parse(expected.qaCase.opensAt) &&
        time < Date.parse(expected.qaCase.closesAt) &&
        time < Date.parse(expected.qaCase.inviteExpiresAt),
    );
  };
  return async (qa: MemberClaimQaCase): Promise<void> => {
    try {
      require(sameCase(parseMemberClaimQaCase(qa)));
      current();
      const result = controlSchema.parse(await readControl());
      current();
      require(
        sameCase(result.qaCase) &&
          result.image === expected.image &&
          result.containerId === expected.containerId &&
          result.configSHA256 === expected.configSHA256 &&
          result.planSHA256 === expected.planSHA256,
      );
    } catch {
      throw Error("C04_QA_RECOVERY_WINDOW_UNQUALIFIED");
    }
  };
}

export function createMemberClaimQaRecoveryWindowQualifier(input: QualificationInput) {
  return createWindowQualifier(input, "RECOVERY_ONLY");
}

// A different, explicitly authorized mode; a read-only qualification can never pass here.
export function createMemberClaimQaResumeWindowQualifier(input: QualificationInput) {
  return createWindowQualifier(input, "ORIGINAL_ID_RESUME");
}

export function createFreshInvitationQaWindowQualifier(input: QualificationInput) {
  return createWindowQualifier(input, "FRESH_INVITATION");
}
