const listeners = new Set<(accountId: string, jobId: string) => void>();
export function subscribeCaptureProcessingActivity(
  listener: (accountId: string, jobId: string) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function announceCaptureProcessingActivity(accountId: string, jobId: string) {
  for (const listener of listeners) {
    try {
      listener(accountId, jobId);
    } catch {
      // UI observers must not interrupt durable processing after settlement.
    }
  }
}
