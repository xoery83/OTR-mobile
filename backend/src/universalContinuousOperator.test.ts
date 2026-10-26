import { describe, expect, it } from "vitest";
import { selectedCommand, safeOperatorFailure } from "../../scripts/import/universal_continuous_operator";
const actor = "f4b059c5-8241-4ffb-aa15-37fa25474543";
const value = () => ({ actorId: actor, project: "tuqigdxrvrerfewsxqgm",
  startsAt: "2026-10-25T06:00:00Z", adminControl: { expiresAt: "2026-10-25T06:15:00Z" },
  providerControl: { activationCommands: [{ kind: "flight_activation_select",
    command: { actor_id: actor, environment: "DEV", integration_id: "otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d" },
    context: { verified_actor_id: actor, verified_account_id: actor, gateway_identity: "otr_external_integration_admin_gateway" } }] } });
describe("exact offline operator selection, not DEV evidence", () => {
  it("allows one exact sealed command within finite window", () => {
    const plan = value();
    expect(selectedCommand(plan, "activationCommands", 0, Date.parse(plan.startsAt))).toBe(plan.providerControl.activationCommands[0]);
  });
  it("rejects invalid/expired windows and arbitrary selection", () => {
    for (const [phase, index, date] of [["activationCommands", 0, "2026-10-25T06:15:00Z"],
      ["other", 0, "2026-10-25T06:01:00Z"], ["activationCommands", -1, "2026-10-25T06:01:00Z"]] as const)
      expect(() => selectedCommand(value(), phase, index, Date.parse(date))).toThrow();
    const plan = value(); plan.adminControl.expiresAt = "invalid";
    expect(() => selectedCommand(plan, "activationCommands", 0, Date.now())).toThrow();
  });
  it("rejects identity, environment and integration changes", () => {
    const plan = value();
    for (const field of ["actor_id", "environment", "integration_id"] as const) {
      const changed = structuredClone(plan); changed.providerControl.activationCommands[0].command[field] = "wrong";
      expect(() => selectedCommand(changed, "activationCommands", 0, Date.parse(plan.startsAt))).toThrow();
    }
  });
});

it("safe diagnostics preserve SQLSTATE/fixed contract only and never raw messages", () => {
 expect(safeOperatorFailure({code:"42501",message:"CP14_ADMIN_FORBIDDEN"},"SQL_COMMAND")).toMatchObject({stage:"SQL_COMMAND",code:"42501",contract:"CP14_ADMIN_FORBIDDEN"});
 for(const message of ["password=secret-value", "private response body", "https://private.invalid/token"]) expect(JSON.stringify(safeOperatorFailure({message},"PG_CONNECT"))).not.toContain(message);
});
