import { describe, expect, it } from "vitest";

import { focusedTransferParams } from "./transferRoute";

describe("focusedTransferParams", () => {
  it("requires one persisted transfer UUID and one Journey UUID", () => {
    const id = "ca2468c3-09d2-4f22-a4a2-a7ce54534dfc";
    const journeyId = "41076e49-0005-599f-af68-5062fd5695f8";

    expect(focusedTransferParams(id, journeyId)).toEqual({ id, journeyId });
    expect(focusedTransferParams("INVALID", journeyId)).toBeNull();
    expect(focusedTransferParams(id, undefined)).toBeNull();
    expect(focusedTransferParams([id], journeyId)).toBeNull();
  });
});
