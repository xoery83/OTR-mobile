import type { CaptureSubmissionInput } from "./captureSubmission";

// Product support only; retained bytes still need the existing owning Source qualification.
export function isUnsupportedUniversalInputMetadata(
  input: Pick<CaptureSubmissionInput, "kind" | "declaredContentType">,
) {
  return (
    input.kind === "IMAGE" ||
    (input.kind === "FILE" && input.declaredContentType !== "text/plain")
  );
}
