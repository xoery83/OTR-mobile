import { requireActiveUserId } from "../auth/authRepository";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { openDatabase } from "../db/database";
import { createCaptureFlightNativeRepository } from "../repositories/captureFlightNativeRepository";
import {
  getDefaultLocalCaptureInboxRepository,
  captureStorageDependencies,
} from "../repositories/defaultLocalCaptureInboxRepository";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import { createFlightPdfExtractor } from "@/native/flightPdf";

// Explicit C2 handoff; no startup caller or runtime gate is enabled.
export async function extractDefaultCaptureFlightPdf(
  tripId: string,
  jobId: string,
  inputId: string,
) {
  const context = await captureAccountRequestContext(tripId, requireActiveUserId);
  const job = await (
    await getDefaultCaptureSubmissionRepository()
  ).reopen(jobId, context);
  const input = job.inputs.find((i) => i.id === inputId && i.state === "ACCEPTED");
  if (!input?.captureId) throw new Error("NATIVE_FLIGHT_INPUT_NOT_ACCEPTED");
  const inbox = await getDefaultLocalCaptureInboxRepository();
  const original = await inbox.getForSourceHandoff(input.captureId);
  if (original.capture.tripId !== tripId)
    throw new Error("NATIVE_FLIGHT_TRIP_ASSIGNMENT_REQUIRED");
  const repository = createCaptureFlightNativeRepository(
    await openDatabase(),
    requireActiveUserId,
    {
      ...captureStorageDependencies,
      handoff: (id) => inbox.getForSourceHandoff(id),
      extract: createFlightPdfExtractor(),
    },
  );
  return repository.extract(context, input.captureId, original.capture.revision);
}
