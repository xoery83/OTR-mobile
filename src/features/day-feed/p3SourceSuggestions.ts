import {
  universalP3FormContextSchema,
  universalP3FormInterpretationSchema,
  isCurrentUniversalP3FormContext,
  type UniversalP3FormContext,
  type UniversalP3FormInterpretation,
} from "@/data/operations/universalP3FormInterpretation";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
} from "@/data/auth/accountRequestContext";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import {
  applyStaySuggestionFields,
  type StaySuggestionBinding,
  type StaySuggestionKey,
} from "./p3FormSuggestions";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";

// The owning interpreter supplies authorized Source/Task results, never raw URI authority.
export type P3SourceInterpreter = (
  context: UniversalP3FormContext,
  signal: AbortSignal,
  material: readonly CaptureSelection[],
) => Promise<UniversalP3FormInterpretation>;
export type SourceStayResult = {
  kind: "SOURCE_STAY_SUGGESTIONS";
  binding: StaySuggestionBinding;
  interpretation: UniversalP3FormInterpretation;
  candidates: {
    id: string;
    targetItemId?: string;
    fields: UniversalP3FormInterpretation["candidates"][number]["fields"];
    evidence: UniversalP3FormInterpretation["candidates"][number]["evidence"];
    unsupported: UniversalP3FormInterpretation["candidates"][number]["unsupported"];
  }[];
};
function bindingOf(context: UniversalP3FormContext): StaySuggestionBinding {
  const { accountId: _accountId, formType: _formType, ...binding } = context;
  return binding;
}
export function isSourceStayResult(input: unknown): input is SourceStayResult {
  if (!input || typeof input !== "object") return false;
  const result = input as SourceStayResult;
  const parsed = universalP3FormInterpretationSchema.safeParse(result.interpretation);
  if (!parsed.success || result.kind !== "SOURCE_STAY_SUGGESTIONS") return false;
  const envelope = parsed.data;
  const expected = bindingOf(envelope.context);
  if (
    !result.binding ||
    Object.keys(result.binding).length !== Object.keys(expected).length ||
    Object.keys(expected).some(
      (key) =>
        result.binding[key as keyof StaySuggestionBinding] !==
        expected[key as keyof StaySuggestionBinding],
    ) ||
    !Array.isArray(result.candidates) ||
    result.candidates.length !== envelope.candidates.length
  )
    return false;
  return result.candidates.every((candidate, index) => {
    const original = envelope.candidates[index];
    return (
      candidate !== null &&
      typeof candidate === "object" &&
      candidate.id === original.id &&
      JSON.stringify(candidate.fields) === JSON.stringify(original.fields) &&
      JSON.stringify(candidate.unsupported) === JSON.stringify(original.unsupported) &&
      JSON.stringify(candidate.evidence) === JSON.stringify(original.evidence) &&
      (candidate.targetItemId === undefined ||
        (envelope.context.mode === "EDIT" &&
          candidate.targetItemId === envelope.context.itemId))
    );
  });
}

export function createP3SourceScanConsumer(
  interpret: P3SourceInterpreter,
  account = requireAdoptedUserId,
) {
  return async (
    binding: StaySuggestionBinding,
    signal: AbortSignal,
    material: readonly CaptureSelection[],
  ): Promise<SourceStayResult> => {
    const captured = structuredClone(binding);
    const accountId = await account();
    const context = universalP3FormContextSchema.parse({
      ...captured,
      itemRevision: captured.itemRevision ?? null,
      accountId,
      formType: "P3",
    });
    await assertAccountRequestContext(context, account);
    if (signal.aborted) throw Error("FORM_SCAN_CANCELLED");
    const interpretation = universalP3FormInterpretationSchema.parse(
      await interpret(Object.freeze(context), signal, material),
    );
    await assertAccountRequestContext(context, account);
    if (
      signal.aborted ||
      !isCurrentUniversalP3FormContext(context, interpretation.context)
    )
      throw Error("FORM_SCAN_STALE");
    return {
      kind: "SOURCE_STAY_SUGGESTIONS",
      binding: bindingOf(context),
      interpretation,
      candidates: interpretation.candidates.map(
        ({ id, fields, evidence, unsupported }) => ({
          id,
          fields,
          evidence,
          unsupported,
        }),
      ),
    };
  };
}

export function applySourceStaySuggestions(
  result: SourceStayResult,
  current: StaySuggestionBinding,
  candidateId: string,
  selected: readonly StaySuggestionKey[],
  fields: ManualStayFields,
) {
  if (!isSourceStayResult(result)) return null;
  try {
    assertAccountRequestGeneration(result.interpretation.context);
  } catch {
    return null;
  }
  return applyStaySuggestionFields(result, current, candidateId, selected, fields);
}
