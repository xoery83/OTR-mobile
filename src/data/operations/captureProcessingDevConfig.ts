export type CaptureProcessingDevConfiguration = Readonly<{
  accountId: string;
  batchId: string;
  jobId: string;
}>;

// An explicit Native QA overlay may select one accepted Batch; normal DEV is closed.
export const captureProcessingDevConfig: CaptureProcessingDevConfiguration | null = null;
