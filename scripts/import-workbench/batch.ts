// Browser-only orchestration over the existing one-input API. No new pipeline.
type Runtime = "MAC_COMPONENT" | "IOS_DIAGNOSTIC_COMPONENT";
type Run = { id: string; stage: string };
export type BatchProgress = {
  inputId: string;
  index: number;
  total: number;
  runId?: string;
  stage: string;
};
export async function runSequentialInputs(
  inputIds: string[],
  runtime: Runtime,
  api: (path: string, value?: unknown) => Promise<Run>,
  progress: (value: BatchProgress) => void,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000)),
) {
  const results: BatchProgress[] = [];
  for (const [index, inputId] of [...new Set(inputIds)].entries()) {
    const current: BatchProgress = {
      inputId,
      index: index + 1,
      total: inputIds.length,
      stage: "QUEUING",
    };
    progress({ ...current });
    try {
      const queued = await api("/api/run", { inputId, runtime });
      current.runId = queued.id;
      for (let poll = 0; poll < 180; poll++) {
        const run = await api("/api/run/" + queued.id);
        current.stage = run.stage;
        progress({ ...current });
        if (["FINISHED", "FAILED", "INTERRUPTED"].includes(run.stage)) break;
        if (poll === 179) throw new Error("BATCH_CURRENT_RUN_UNRESOLVED");
        await wait();
      }
      results.push({ ...current });
    } catch {
      // Cannot prove an interrupted transport/model run ended: never start another.
      current.stage = "BATCH_STOPPED_UNRESOLVED";
      results.push({ ...current });
      progress({ ...current });
      break;
    }
  }
  return results;
}
