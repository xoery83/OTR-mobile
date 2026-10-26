import { vi } from "vitest";
import { publishUniversalP1Candidate } from "./universalP1SourcePg";
import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
it("projects the minimum evidenced P3 through the same owning lifecycle and Source Plan", async () => {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", "P3");
  const proposal = await f.run();
  const slot = proposal.body.plan.slots[0];
  expect(proposal.grantsAdmission).toBe(false);
  expect(proposal.qualification.eligibleNewRecords).toHaveLength(1);
  expect(slot.command).toBe("CREATE_ITEM");
  expect(slot.payload).toMatchObject({
    family: "P3",
    core: { title: "海滨住宿" },
    schedule: {
      start: { local_date: "2026-11-03", local_time: null, zone_id: null },
      end: { local_date: "2026-11-05", local_time: null, zone_id: null },
    },
    acl: { visibility: "PRIVATE" },
    participation: { mode: "SELF" },
  });
  expect(slot.selectedFields).toEqual([
    "ROOT.title",
    "START.local_date",
    "END.local_date",
  ]);
  expect(slot.payload).not.toHaveProperty("place");
  expect(slot.payload).not.toHaveProperty("rooms");
  expect(slot.payload).not.toHaveProperty("details");
  expect(proposal.body.evidence).toHaveLength(3);
  expect((await f.run()).candidateSha256).toBe(proposal.candidateSha256);
});
it.each([
  "missing checkout",
  "uncertain checkout",
  "reversed dates",
  "changed bytes",
  "wrong action",
])("rejects %s before creating a P3", async (reason) => {
  const f = await universalP1SourceFixture(
    undefined,
    undefined,
    reason === "reversed dates" ? "2026-11-06" : "2026-11-03",
    "P3",
  );
  if (reason === "missing checkout")
    (f.input.result.candidates[0] as any).fields = (
      f.input.result.candidates[0] as any
    ).fields.filter((field: any) => field.path !== "check_out.date");
  if (reason === "uncertain checkout")
    ((f.input.result.candidates[0] as any).fields[2] as any).uncertainty = "ambiguous";
  if (reason === "changed bytes") f.input.snapshot.materials[0].text += " changed";
  if (reason === "wrong action") f.input.selection.action = "CONFIRM_NEW_P1";
  await expect(f.run()).rejects.toThrow();
});

it("keeps unknown clocks and absent commercial bindings advisory, but rejects lifecycle ambiguity", async () => {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", "P3");
  f.input.result.unresolved = [
    {
      sourceId: "S0",
      reason:
        "check-in and check-out times stated as unknown; no booking, guest, or place inferred",
    },
  ];
  await expect(f.run()).resolves.toHaveProperty("grantsAdmission", false);
  f.input.result.unresolved = [{ sourceId: "S0", reason: "possible cancellation" }];
  await expect(f.run()).rejects.toThrow();
});

it("rejects P3 publication without explicit Source Review before any INSERT or read", async () => {
  const query = vi.fn();
  const read = vi.fn();
  await expect(
    publishUniversalP1Candidate(
      { query } as any,
      {} as any,
      {
        family: "P3",
        batchId: "",
        taskId: "",
        token: "i1",
        requestSha256: "",
      },
      read,
      vi.fn(),
    ),
  ).rejects.toThrow("OWNING_REVIEW_REQUIRED");
  expect(query).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
