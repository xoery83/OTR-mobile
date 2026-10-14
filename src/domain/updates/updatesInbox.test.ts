import { expect, it } from "vitest";
import {
  isActionableIntakeFailure,
  matchesUpdatesFilter,
  type CaptureUpdateCard,
} from "./updatesInbox";
const card: CaptureUpdateCard = {
  notificationId: "capture-intake:example",
  jobId: "example",
  batchId: "example",
  materialVersion: 1,
  source: "CAPTURE_INTAKE",
  scope: "ACCOUNT_PERSONAL",
  tripId: null,
  createdAt: "2026-10-15T01:02:03Z",
  clock: "DEVICE_WALL",
  unread: true,
  sourceState: "ACTION_REQUIRED",
  recoveryInputs: [],
  searchText: "capture import EMPTY_PAYLOAD",
};
it("finite actionable failures exclude infra/quota and unavailable processing", () => {
  for (const code of [
    "EMPTY_PAYLOAD",
    "PAYLOAD_TOO_LARGE",
    "INVALID_UTF8",
    "CONTENT_MISMATCH",
  ])
    expect(isActionableIntakeFailure(code)).toBe(true);
  for (const code of [
    null,
    "READER_FAILURE",
    "HASH_FAILURE",
    "ROW_QUOTA",
    "NOT_INSTALLED",
    "PENDING",
  ])
    expect(isActionableIntakeFailure(code)).toBe(false);
});
it("category and independent unread/query filters use current attention while personal scope is preserved", () => {
  const filter = {
    category: "NEEDS_ATTENTION" as const,
    query: "empty_payload",
    unreadOnly: true,
    currentTripId: null,
  };
  expect(matchesUpdatesFilter(card, filter)).toBe(true);
  expect(matchesUpdatesFilter({ ...card, sourceState: "RECOVERED" }, filter)).toBe(false);
  expect(matchesUpdatesFilter({ ...card, unread: false }, filter)).toBe(false);
  expect(matchesUpdatesFilter(card, { ...filter, category: "MESSAGES" })).toBe(false);
  expect(
    matchesUpdatesFilter(
      { ...card, sourceState: "RECOVERED" },
      { ...filter, category: "ACTIVITY" },
    ),
  ).toBe(true);
});
