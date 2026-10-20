import type { CaptureCustodyBatch } from "@/domain/capture/captureCustody";
export type CaptureCustodyDevConfiguration = Readonly<{
  batch: CaptureCustodyBatch;
  expiresAt: string;
}>;
// Only an explicitly approved Native QA overlay may set this; normal startup is CLOSED.
export const captureCustodyDevConfig: CaptureCustodyDevConfiguration | null =
  null;
