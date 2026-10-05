import { describe, expect, it, vi } from "vitest";
import { createSourceExecutionRecovery } from "./tripSourceExecutionRecovery";
const id = (n: number) => "cd000000-0000-4000-8000-" + n.toString().padStart(12, "0");
function row(phase = "UNKNOWN") {
  return {
    id: id(231),
    operation_id: id(23),
    source_id: id(100),
    representation_id: id(101),
    execution_principal: "otr_trip_source_command_gateway",
    staged_resource_id: id(500),
    profile_id: "PNG_STATIC_RGB8_RGBA8_V1",
    profile_sha256: "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5",
    owner_run: id(901),
    owner_fence: 1,
    phase,
    termination_outstanding: phase !== "TERMINAL",
    run_token: id(701),
    container_id: "a".repeat(64),
    runtime_node_id: id(600),
    operation_sha256: "b".repeat(64),
    terminal_observed_at: phase === "TERMINAL" ? "2026-10-05T00:00:00Z" : null,
    terminal_result: phase === "TERMINAL" ? "PARSER_TIMEOUT" : null,
    terminal_evidence_sha256: phase === "TERMINAL" ? "c".repeat(64) : null,
    staged_resource: {
      id: id(500),
      execution_principal: "otr_trip_source_command_gateway",
      node_id: id(600),
      resource_key: "d".repeat(64),
      payload_sha256: "e".repeat(64),
      byte_count: 20,
      cleaned_at: null,
    },
  };
}
describe("explicit Source execution recovery boundary (not startup/dispatch)", () => {
  for (const phase of [
    "STARTING",
    "RUNNING",
    "TERMINATION_REQUIRED",
    "UNKNOWN",
    "TERMINAL",
  ])
    it("retains " + phase + " responsibility after reader object loss", async () => {
      const stored = row(phase),
        rpc = vi.fn(async () => structuredClone([stored]));
      const first = await createSourceExecutionRecovery(rpc).inventory();
      const restarted = await createSourceExecutionRecovery(rpc).inventory();
      expect(restarted).toEqual(first);
      expect(restarted[0].phase).toBe(phase);
      expect(rpc).toHaveBeenCalledWith("trip_source_execution_inventory", {});
    });
  it("STARTING without external identity remains unresolved", async () => {
    const value = row("STARTING");
    value.container_id = null as unknown as string;
    value.runtime_node_id = null as unknown as string;
    const r = await createSourceExecutionRecovery(async () => [value]).inventory();
    expect(r[0].containerId).toBeNull();
  });
  it("no connector fails unavailable without fallback", async () => {
    await expect(createSourceExecutionRecovery(null).inventory()).rejects.toThrow(
      "UNAVAILABLE",
    );
  });
  it("ambiguous transport does not retry", async () => {
    const rpc = vi.fn(async () => {
      throw Error("lost response");
    });
    await expect(
      createSourceExecutionRecovery(rpc).takeOwnership(id(231), 1, id(902)),
    ).rejects.toThrow("UNAVAILABLE");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("takeover binds exact UUID and newer fence without dispatch", async () => {
    const value = { ...row(), owner_fence: 2, owner_run: id(902) };
    const rpc = vi.fn(async () => value);
    const r = await createSourceExecutionRecovery(rpc).takeOwnership(id(231), 1, id(902));
    expect(r.fence).toBe(2);
    expect(r.phase).toBe("UNKNOWN");
    expect(rpc).toHaveBeenCalledWith("trip_source_execution_claim", {
      attempt: id(231),
      expected_fence: 1,
      new_owner_run: id(902),
    });
  });
  it("terminal cleanup-pending takeover retains proof without reopening execution", async () => {
    const value = { ...row("TERMINAL"), owner_fence: 2, owner_run: id(902) };
    const r = await createSourceExecutionRecovery(async () => value).takeOwnership(
      id(231),
      1,
      id(902),
    );
    expect(r.phase).toBe("TERMINAL");
    expect(r.fence).toBe(2);
  });
  for (const [label, change] of [
    ["service-role identity", { execution_principal: "service_role" }],
    ["wrong runtime node", { runtime_node_id: id(999) }],
    ["missing runtime node", { runtime_node_id: null }],
    ["wrong profile", { profile_id: "JPEG" }],
    ["changed fingerprint", { profile_sha256: "0".repeat(64) }],
    ["UNKNOWN falsely cleared", { termination_outstanding: false }],
    ["unsafe fence", { owner_fence: 9007199254740992 }],
    ["unknown phase", { phase: "FINAL" }],
    ["missing owner", { owner_run: null }],
    ["running without identity", { phase: "RUNNING", container_id: null }],
    ["nonterminal result", { terminal_result: "PARSE_PASS" }],
    ["terminal without proof", { phase: "TERMINAL", termination_outstanding: false }],
  ] as const)
    it("rejects " + label, async () => {
      await expect(
        createSourceExecutionRecovery(async () => [{ ...row(), ...change }]).inventory(),
      ).rejects.toThrow("UNAVAILABLE");
    });
  it("duplicate attempt inventory fails closed", async () => {
    await expect(
      createSourceExecutionRecovery(async () => [row(), row()]).inventory(),
    ).rejects.toThrow("UNAVAILABLE");
  });
  it("positively cleaned resource cannot appear as unresolved", async () => {
    const v = row();
    v.staged_resource.cleaned_at = "2026-10-05" as unknown as null;
    await expect(
      createSourceExecutionRecovery(async () => [v]).inventory(),
    ).rejects.toThrow("UNAVAILABLE");
  });
  it("wrong resource association fails closed", async () => {
    const v = row();
    v.staged_resource.id = id(999);
    await expect(
      createSourceExecutionRecovery(async () => [v]).inventory(),
    ).rejects.toThrow("UNAVAILABLE");
  });
  for (const change of [
    { owner_fence: 1, owner_run: id(902) },
    { owner_fence: 2, owner_run: id(901) },
    { owner_fence: 2, owner_run: id(902), phase: "RUNNING" },
    { owner_fence: 2, owner_run: id(902), id: id(999) },
  ])
    it("rejects stale/corrupt takeover response " + JSON.stringify(change), async () => {
      await expect(
        createSourceExecutionRecovery(async () => ({
          ...row(),
          ...change,
        })).takeOwnership(id(231), 1, id(902)),
      ).rejects.toThrow("UNAVAILABLE");
    });
  it("malformed input consumes no RPC", async () => {
    const rpc = vi.fn(async () => row());
    await expect(
      createSourceExecutionRecovery(rpc).takeOwnership("wrong", 1, id(902)),
    ).rejects.toThrow("UNAVAILABLE");
    expect(rpc).not.toHaveBeenCalled();
  });
});
