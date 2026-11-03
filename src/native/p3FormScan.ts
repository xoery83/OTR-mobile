import { createDefaultUniversalP3SourceInterpreter } from "@/data/operations/defaultUniversalP3SourceInterpreter";
import { isCurrentUniversalP3FormContext } from "@/data/operations/universalP3FormInterpretation";
import type { P3SourceInterpreter } from "@/features/day-feed/p3SourceSuggestions";

type Factory = typeof createDefaultUniversalP3SourceInterpreter;
// Software candidate only: integrate after the owning runtime gates are qualified.
const qualifiedFactory: Factory = createDefaultUniversalP3SourceInterpreter;

export function createP3SourceScanPort(
  factory: Factory | undefined = process.env
    .EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true"
    ? qualifiedFactory
    : undefined,
): P3SourceInterpreter | undefined {
  if (!factory) return undefined;
  let retained: ReturnType<Factory> | undefined;
  return async (context, signal, material, getCurrentContext) => {
    const current = () => {
      if (signal.aborted) throw Error("FORM_SCAN_CANCELLED");
      if (!isCurrentUniversalP3FormContext(context, getCurrentContext()))
        throw Error("FORM_SCAN_STALE");
    };
    current();
    // Retain rejection too: a retry must not create a fresh UNKNOWN intake factory.
    retained ??= Promise.resolve().then(factory);
    const interpret = await retained;
    current();
    return interpret(context, signal, material, getCurrentContext);
  };
}
