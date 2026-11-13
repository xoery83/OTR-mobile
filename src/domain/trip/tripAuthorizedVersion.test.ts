import { expect, it } from "vitest";
import { authorizedTripVersionSchema } from "./tripAuthorizedVersion";
const version = {
  version: "otr.core.authorized-trip-version/1",
  actorAccountId: "f4b059c5-8241-4ffb-aa15-37fa25474543",
  tripId: "825f79b2-4a9d-4535-a62e-43000ca50c4a",
  token: "a".repeat(64),
};
it("accepts only the bounded Actor/Trip opaque version DTO", () => {
  expect(authorizedTripVersionSchema.parse(version)).toEqual(version);
  expect(authorizedTripVersionSchema.safeParse({ ...version, revision: 7 }).success).toBe(
    false,
  );
  expect(authorizedTripVersionSchema.safeParse({ ...version, token: "7" }).success).toBe(
    false,
  );
  expect(
    authorizedTripVersionSchema.safeParse({ ...version, actorAccountId: "guest" })
      .success,
  ).toBe(false);
});
