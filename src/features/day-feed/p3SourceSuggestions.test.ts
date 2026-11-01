import { beforeEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  createP3SourceScanConsumer,
  isSourceStayResult,
  applySourceStaySuggestions,
  type P3SourceInterpreter,
} from "./p3SourceSuggestions";
import { p3SourceInterpretationFixture } from "./__fixtures__/p3SourceInterpretation";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";
vi.mock("@/data/auth/authRepository", () => ({
  requireAdoptedUserId: vi.fn(),
  requireActiveUserId: vi.fn(),
}));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const binding = (mode: "CREATE" | "EDIT" = "CREATE"): StaySuggestionBinding => ({
  formId: "form",
  tripId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  itemId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  generation: getAccountGeneration(),
  revision: 2,
  itemRevision: mode === "EDIT" ? 7 : null,
  mode,
});
let accountId = a;
beforeEach(() => {
  accountId = a;
});
function setup(mode: "CREATE" | "EDIT" = "CREATE") {
  const captured = binding(mode),
    controller = new AbortController();
  const interpret = vi.fn<P3SourceInterpreter>(async (context) =>
    p3SourceInterpretationFixture(context, {
      title: "Extracted Inn",
      startDate: "2026-11-04",
      endDate: "2026-11-06",
    }),
  );
  const scan = createP3SourceScanConsumer(
    interpret,
    () => captured,
    async () => accountId,
  );
  return {
    captured,
    controller,
    interpret,
    run: () => scan(captured, controller.signal, []),
  };
}
it("keeps formal provenance, no synthetic relabel, no inferred Edit target and no draft/Save mutation", async () => {
  const f = setup("EDIT"),
    result = await f.run();
  expect(result.kind).toBe("SOURCE_STAY_SUGGESTIONS");
  expect(result.interpretation.sourceBindings[0].sourceId).toBeTruthy();
  expect(result.interpretation.canonicalWrites).toBe(false);
  expect(result.candidates[0]).not.toHaveProperty("targetItemId");
  expect(isSourceStayResult(result)).toBe(true);
  const fields = {
    title: "Mine",
    stayDetails: { propertyName: "Mine" },
    description: "Keep",
  } as ManualStayFields;
  expect(
    applySourceStaySuggestions(
      result,
      f.captured,
      result.candidates[0].id,
      ["title"],
      fields,
    ),
  ).toBeNull();
  result.candidates[0].targetItemId = f.captured.itemId; // Explicit UI target confirmation, never source inference.
  expect(
    applySourceStaySuggestions(
      result,
      f.captured,
      result.candidates[0].id,
      ["title"],
      fields,
    ),
  ).toMatchObject({
    title: "Extracted Inn",
    description: "Keep",
    stayDetails: { propertyName: "Extracted Inn" },
  });
  expect(fields.title).toBe("Mine");
});
it.each([
  "formId",
  "tripId",
  "itemId",
  "generation",
  "revision",
  "itemRevision",
  "mode",
  "accountId",
])("rejects formal response with mismatched %s", async (key) => {
  const f = setup();
  f.interpret.mockImplementationOnce(async (context) => {
    const result = p3SourceInterpretationFixture(context, { title: "Extracted Inn" });
    Object.assign(result.context, {
      [key]:
        key === "accountId"
          ? b
          : key === "tripId" || key === "itemId"
            ? a
            : key === "generation" || key === "revision"
              ? 99
              : key === "itemRevision"
                ? 8
                : key === "mode"
                  ? "EDIT"
                  : "other",
    });
    return result;
  });
  await expect(f.run()).rejects.toThrow();
});
it("discards abort and Account ABA late replies", async () => {
  for (const abort of [true, false]) {
    const f = setup();
    let complete!: () => void;
    const blocked = new Promise<void>((resolve) => {
      complete = resolve;
    });
    f.interpret.mockImplementationOnce(async (context) => {
      await blocked;
      return p3SourceInterpretationFixture(context, { title: "Late" });
    });
    const pending = f.run();
    await vi.waitFor(() => expect(f.interpret).toHaveBeenCalledOnce());
    if (abort) f.controller.abort();
    else {
      advanceAccountGeneration();
      accountId = a;
    }
    complete();
    await expect(pending).rejects.toThrow();
  }
});
it("rejects patch/evidence tampering, stale apply and missing Edit Core revision", async () => {
  const f = setup(),
    result = await f.run();
  result.candidates[0].fields.title = "Unauthenticated patch";
  expect(isSourceStayResult(result)).toBe(false);
  const fresh = await f.run();
  expect(
    applySourceStaySuggestions(
      fresh,
      { ...f.captured, revision: 3 },
      fresh.candidates[0].id,
      ["title"],
      {} as ManualStayFields,
    ),
  ).toBeNull();
  const edit = setup("EDIT");
  edit.captured.itemRevision = null;
  await expect(edit.run()).rejects.toThrow();
  expect(edit.interpret).not.toHaveBeenCalled();
});
it("keeps all 64 independent candidates rather than silently applying synthetic's12 cap", async () => {
  const f = setup();
  f.interpret.mockImplementationOnce(async (context) => {
    const result = p3SourceInterpretationFixture(context, { title: "Extracted Inn" });
    result.candidates = Array.from({ length: 64 }, (_, i) => ({
      ...structuredClone(result.candidates[0]),
      id: i.toString(16).padStart(24, "0"),
      token: `candidate-${i}`,
    }));
    return result;
  });
  const result = await f.run();
  expect(result.candidates).toHaveLength(64);
  expect(isSourceStayResult(result)).toBe(true);
});

it("owning intake reads live UI revisions before its next I/O, not a captured echo", async () => {
  const f = setup();
  f.interpret.mockImplementationOnce(async (context, _signal, _material, current) => {
    expect(current()).toEqual(context);
    f.captured.revision++;
    expect(current()!.revision).toBe(context.revision + 1);
    return p3SourceInterpretationFixture(context, { title: "Stale before prepare" });
  });
  await expect(f.run()).rejects.toThrow("FORM_SCAN_STALE");
});
