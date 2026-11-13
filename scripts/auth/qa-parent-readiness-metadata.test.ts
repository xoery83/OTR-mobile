import { expect, it } from "vitest";
import { PARENT_READINESS_BASELINE, matchesParentReadinessMetadata } from "./qa-parent-readiness-metadata";

const rows = () => PARENT_READINESS_BASELINE.map((entry) => ({
  signature: entry.signature, present: true, owner: "postgres", security_definer: true,
  source_md5: "unused", definition_md5: "unused", [entry.key]: entry.md5,
  executable: true, anon_executable: false, authenticated_executable: false,
  service_role_executable: false, return_type: "jsonb", settings: ["search_path=pg_catalog"],
}));

it("accepts only the fixed installed fingerprints and separate Parent attributes", () => {
  expect(matchesParentReadinessMetadata(rows())).toBe(true);
});
it.each(["owner", "parent-source", "owning-definition", "definer", "anon", "authenticated", "service", "owning-service", "settings", "return", "missing", "duplicate"])("rejects metadata drift: %s", (kind) => {
  const data = rows();
  if (kind === "owner") data[0].owner = "other";
  if (kind === "parent-source") data[0].source_md5 = "0".repeat(32);
  if (kind === "owning-definition") data[1].definition_md5 = "0".repeat(32);
  if (kind === "definer") data[0].security_definer = false;
  if (kind === "anon") data[1].anon_executable = true;
  if (kind === "authenticated") data[2].authenticated_executable = true;
  if (kind === "service") data[0].service_role_executable = true;
  if (kind === "owning-service") data[1].service_role_executable = true;
  if (kind === "settings") data[0].settings = ["search_path=public"];
  if (kind === "return") data[0].return_type = "text";
  if (kind === "missing") data.pop();
  if (kind === "duplicate") data[1] = { ...data[0] };
  expect(matchesParentReadinessMetadata(data)).toBe(false);
});
