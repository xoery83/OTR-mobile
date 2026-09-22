import { describe, expect, it } from "vitest";

import type { RateQuote } from "@/domain/ledger/types";
import { selectPersonalPaymentReference } from "./personalPaymentFx";

const quote = (date: string, id = date) => ({ id, referenceDate: date }) as RateQuote;

describe("selectPersonalPaymentReference", () => {
  it("prefers requested date, then nearby, then historical without using the future", () => {
    expect(
      selectPersonalPaymentReference(
        [quote("2026-09-20"), quote("2026-09-18"), quote("2026-08-01")],
        "2026-09-20",
      )?.kind,
    ).toBe("REQUESTED_DATE");
    expect(
      selectPersonalPaymentReference(
        [
          {
            ...quote("2026-09-18", "weekend-request"),
            economicDate: "2026-09-20",
          },
        ],
        "2026-09-20",
      ),
    ).toMatchObject({
      kind: "REQUESTED_DATE",
      quote: { referenceDate: "2026-09-18" },
    });
    expect(
      selectPersonalPaymentReference(
        [quote("2026-09-21", "future"), quote("2026-09-18")],
        "2026-09-20",
      ),
    ).toMatchObject({ kind: "NEAR_DATE", quote: { referenceDate: "2026-09-18" } });
    expect(
      selectPersonalPaymentReference([quote("2026-08-01")], "2026-09-20")?.kind,
    ).toBe("HISTORICAL");
    expect(selectPersonalPaymentReference([], "2026-09-20")).toBeNull();
  });
});
