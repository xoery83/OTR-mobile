type Stage = "SYNC_REQUEST" | "SYNC_RESPONSE" | "SQLITE_COMMIT";
const events: { stage: Stage; at: number; revision?: number }[] = [];

export function recordQaMetadataTiming(tripId: string, stage: Stage, revision?: number) {
  if (tripId !== process.env.EXPO_PUBLIC_OTR_QA_METADATA_TIMING_TRIP) return;
  try {
    const at = Date.now();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const file = new File(Paths.document, "otr-qa-metadata-timing.json");
    events.push({ stage, at, ...(revision !== undefined ? { revision } : {}) });
    if (events.length > 72) events.shift();
    if (!file.exists) file.create({ overwrite: false });
    file.write(JSON.stringify(events));
  } catch {
    // Device diagnostics cannot stop synchronization.
  }
}
