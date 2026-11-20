import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateBetaPlan, resolveBetaPlanIdentities } from "./betaPlanning";
import { responseSchemas } from "../docs/mcp/beta-layer2/schema/responses";
const plan = JSON.parse(
  readFileSync(
    new URL(
      "../docs/mcp/beta-layer2/results/POS-TRIP-CREATE.actual.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
it("reuses the qualified positive plan and restores frozen response aliases after both success and rejection", () => {
  const aliases = { ...responseSchemas };
  expect(validateBetaPlan(plan).executed).toBe(false);
  expect(responseSchemas).toEqual(aliases);
  const bad = structuredClone(plan);
  const confirm = bad.steps.find((s: any) => s.stage === "CONFIRM");
  confirm.confirmation.boundStepIds = [confirm.id];
  expect(() => validateBetaPlan(bad)).toThrow();
  expect(responseSchemas).toEqual(aliases);
});

it("retains Account/intent identities across process-independent resolution without granting execution", () => {
  const account = "11111111-1111-4111-a111-111111111111";
  const resolved = resolveBetaPlanIdentities(plan, account);
  expect(Object.keys(resolved.identities).length).toBeGreaterThan(0);
  expect(resolveBetaPlanIdentities(structuredClone(plan), account)).toEqual(resolved);
  expect(
    resolveBetaPlanIdentities(plan, "22222222-2222-4222-a222-222222222222").identities,
  ).not.toEqual(resolved.identities);
  expect(resolved.executed).toBe(false);
});
