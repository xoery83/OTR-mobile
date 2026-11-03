import { requireAdoptedUserId } from "../auth/authRepository";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { PDF_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePdfPreparation";
import { getDefaultCaptureSubmissionDependencies } from "./defaultCaptureSubmission";
import { prepareDefaultUniversalCaptureSources } from "./defaultUniversalOriginalSource";
import { createUniversalP3SourceInterpreter } from "./universalP3SourceInterpreter";

// Unmounted composition only. Backend Source/Task capability still decides authorization.
export async function createDefaultUniversalP3SourceInterpreter() {
  const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
  if (!baseUrl) throw Error("UNIVERSAL_BACKEND_UNAVAILABLE");
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED !== "true")
    throw Error("OWNING_TASK_PREPARATION_UNAVAILABLE");
  const pdfEnabled = process.env.EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED === "true";
  let invocation: {
    transport: ReturnType<typeof createUniversalImportTransport>;
    assertCurrent(): void;
  } | null = null;
  const interpret = createUniversalP3SourceInterpreter({
    requireNormalAccount: requireAdoptedUserId,
    submission: await getDefaultCaptureSubmissionDependencies(),
    createTransport: (options) => {
      const transport = createUniversalImportTransport(requireAdoptedUserId, {
        baseUrl,
        ...options,
      });
      invocation = { transport, assertCurrent: options.assertCurrent };
      return transport;
    },
    prepareSources: async (context, model) => {
      const active = invocation;
      if (!active) throw Error("UNIVERSAL_PREPARATION_UNAVAILABLE");
      active.assertCurrent();
      await prepareDefaultUniversalCaptureSources(context, model, {
        baseUrl,
        getAccountId: requireAdoptedUserId,
        assertCurrent: active.assertCurrent,
        ...(pdfEnabled ? { pendingPdfProfile: PDF_CAPTURE_ORIGINAL_PROFILE } : {}),
        prepareTask: async (input) => {
          active.assertCurrent();
          await active.transport.prepare(context, input);
          active.assertCurrent();
        },
      });
      active.assertCurrent();
    },
  });
  return (...args: Parameters<typeof interpret>) => {
    const material = args[2];
    const textOnly =
      material.length > 0 &&
      material.every((m) => m.source === "files" && m.typeHint === "text/plain");
    const singlePdf =
      pdfEnabled &&
      material.length === 1 &&
      material[0].source === "files" &&
      material[0].typeHint === "application/pdf";
    if (!textOnly && !singlePdf) throw Error("UNIVERSAL_FORM_INPUT_UNSUPPORTED");
    return interpret(...args);
  };
}
