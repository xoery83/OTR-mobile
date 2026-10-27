import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createUniversalBackendRuntime } from "./universalRuntime";
import { registeredUniversalModelProfile } from "./universalModelProfile";

describe("Universal owning Host deployment boundary", () => {
  it("starts CLOSED without owning provisioning", async () => {
    expect(await createUniversalBackendRuntime()).toEqual({ status: "CLOSED" });
  });
  it("pins the same exact optional-output profile in typed and SQL contracts", () => {
    const vector = JSON.parse(
      readFileSync("scripts/import-workbench/universal-profile-vector.json", "utf8"),
    );
    expect(vector.profile).toEqual(registeredUniversalModelProfile);
    for (const path of [
      "backend/sql/universal_provider_admission_candidate.sql",
      "backend/sql/universal_task_read_candidate.sql",
    ]) {
      expect(readFileSync(path, "utf8")).toContain(
        JSON.stringify(registeredUniversalModelProfile),
      );
    }
  });
});
