export const replayFixtureJourneyIds = new Set([
  "ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65",
  "ec3ae448-3fa5-84a9-a986-655a243cf3ad",
]);

export function assertReplayFixtureWritable(journeyId: string) {
  if (replayFixtureJourneyIds.has(journeyId))
    throw new Error("Europe Replay is an immutable read-only fixture.");
}
