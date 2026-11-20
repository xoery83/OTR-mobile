import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { validatePlan } from "./validate";
import { registry } from "./requests";
import { assess } from "./assess";
const root = new URL("../", import.meta.url),
  read = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const cases = read("corpus/cases.json"),
  materials = read("corpus/manifest.json").materials;
const categories = [
  "Wrong Tool",
  "Wrong Field",
  "Missing Required Data",
  "Duplicate Creation",
  "Incorrect Object Match",
  "Invalid Dependency",
  "Hallucinated Fact",
  "Missing Confirmation",
  "Unsupported Operation",
  "Invalid Schema",
];
const manual = existsSync(new URL("results/manual-review.json", root))
  ? read("results/manual-review.json")
  : {};
const snapshotBundle = read("corpus/snapshots.json");
function suppliedReads(plan: any, caseData: any) {
  const chosen = snapshotBundle.filter((s: any) =>
      caseData.snapshotNames.includes(s.name),
    ),
    results: Record<string, unknown> = {},
    afterWrite = new Set<string>();
  for (const step of plan.steps) {
    if (
      step.stage === "APPLY" ||
      step.dependsOn.some((id: string) => afterWrite.has(id))
    ) {
      afterWrite.add(step.id);
      continue;
    }
    const c = registry.find((c) => c.capabilityId === step.call?.capabilityId);
    if (!c || c.effect !== "READ") continue;
    const params = step.call.pathParams,
      query = step.call.query;
    const candidates = chosen.filter((s: any) => {
      if (s.schema !== c.responseSchema) return false;
      const r = s.response;
      if (c.family && (r.family ?? r.item?.family) !== c.family) return false;
      if (
        params.tripId &&
        typeof params.tripId === "string" &&
        (r.tripId ?? r.journeyId ?? r.item?.tripId) &&
        params.tripId !== (r.tripId ?? r.journeyId ?? r.item?.tripId)
      )
        return false;
      if (params.itemId && params.itemId !== (r.itemId ?? r.item?.itemId)) return false;
      if (params.expenseId && params.expenseId !== r.id) return false;
      if (
        query.lifecycle &&
        query.lifecycle !== "ALL" &&
        r.trips?.some((t: any) => t.lifecycleState !== query.lifecycle)
      )
        return false;
      return true;
    });
    if (candidates.length === 1) results[step.id] = candidates[0].response;
  }
  return results;
}
function syntheticIds(plan: any) {
  const ids: Record<string, string> = {};
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    if (v.$identity) {
      const key = plan.intentId + ":" + v.$identity.stepId + ":" + v.$identity.kind;
      const h = createHash("sha256").update(key).digest("hex");
      ids[key] =
        h.slice(0, 8) +
        "-" +
        h.slice(8, 12) +
        "-4" +
        h.slice(13, 16) +
        "-8" +
        h.slice(17, 20) +
        "-" +
        h.slice(20, 32);
    } else Object.values(v).forEach(visit);
  }
  visit(plan);
  return ids;
}
const reports = cases.map((c: any) => {
  const path = "results/" + c.id + ".actual.json";
  if (!existsSync(new URL(path, root)))
    return {
      caseId: c.id,
      status: "NOT_RUN",
      expectedPlan: c.expectedPlan,
      actual: null,
      failures: [],
    };
  const bytes = readFileSync(new URL(path, root));
  let plan: any,
    staticValidation: any,
    failures: any[] = [];
  try {
    plan = JSON.parse(bytes.toString());
    staticValidation = validatePlan(plan);
    const fixtureValidation = validatePlan(
      plan,
      suppliedReads(plan, c),
      syntheticIds(plan),
    );
    staticValidation = {
      ...staticValidation,
      fixtureResolution: {
        ...fixtureValidation,
        scope:
          "ONLY_SUPPLIED_PREWRITE_SIMULATED_READS_AND_LOCAL_SYNTHETIC_UUIDS_NO_EXECUTION",
      },
    };
  } catch (e) {
    staticValidation = { status: "FAIL", error: String(e) };
    const detail = String(e);
    const category =
      /Wrong verification field|Unknown or untyped response pointer|Reference type mismatch/.test(
        detail,
      )
        ? "Wrong Field"
        : /independent verification|Dependency|Guard requires/.test(detail)
          ? "Invalid Dependency"
          : /confirmation|Confirmation/.test(detail)
            ? "Missing Confirmation"
            : /APPLY must name|requires real base/.test(detail)
              ? "Missing Required Data"
              : "Invalid Schema";
    failures.push({ category, detail });
  }
  if (plan?.materials)
    for (const m of plan.materials) {
      const original = materials.find((v: any) => v.path === m.name);
      if (original && m.sha256 && m.sha256 !== original.sha256)
        failures.push({
          category: "Hallucinated Fact",
          detail: "Material SHA mismatch " + m.name,
        });
    }
  let review: any;
  if (plan) {
    try {
      review = assess(c, plan);
    } catch (e) {
      review = {
        complete: false,
        failures: [
          {
            category: "Missing Required Data",
            detail: "Semantic assessment incomplete: " + String(e),
          },
        ],
      };
    }
  }
  if (manual[c.id]) review = manual[c.id];
  if (review?.failures) failures.push(...review.failures);
  const status = failures.length ? "FAIL" : review?.complete ? "PASS" : "REVIEW_PENDING";
  return {
    caseId: c.id,
    status,
    userTask: c.userTask,
    providedMaterials: c.materials,
    providedSnapshots: c.snapshotNames,
    actual: path,
    actualSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedPlan: c.expectedPlan,
    staticValidation,
    review: review ?? null,
    failures,
    observedCapabilities:
      plan?.steps?.flatMap((s: any) => (s.call ? [s.call.capabilityId] : [])) ?? [],
  };
});
const totals = Object.fromEntries(
  ["PASS", "FAIL", "REVIEW_PENDING", "NOT_RUN", "BLOCKED"].map((status) => [
    status,
    reports.filter((r: any) => r.status === status).length,
  ]),
);
const errors = Object.fromEntries(
  categories.map((category) => [
    category,
    reports.filter((r: any) => r.failures.some((f: any) => f.category === category))
      .length,
  ]),
);
const report = {
  scope: "SYNTHETIC_PLAN_ONLY_ACTUAL_GPT_OUTPUTS",
  qualification:
    totals.PASS === cases.length &&
    registry.every((capability) =>
      reports.some(
        (r: any) =>
          r.status === "PASS" &&
          r.observedCapabilities?.includes(capability.capabilityId),
      ),
    )
      ? "LAYER2_PLAN_QUALIFIED"
      : "NOT_QUALIFIED",
  totals,
  errors,
  cases: reports,
  realOTRCalls: 0,
};
writeFileSync(
  new URL("results/EVALUATION.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
const matrix = registry.map((c) => ({
  ...c,
  guideCovered: true,
  requestBranchCovered: true,
  expectedCaseId: cases.find(
    (t: any) => t.expectedPlan.mustConsiderCapability === c.capabilityId,
  )?.id,
  actualCases: reports
    .filter((r: any) => r.observedCapabilities?.includes(c.capabilityId))
    .map((r: any) => ({ id: r.caseId, status: r.status })),
  modelConformance: reports.some(
    (r: any) => r.status === "PASS" && r.observedCapabilities?.includes(c.capabilityId),
  )
    ? "OBSERVED_IN_PASS_CASE"
    : reports.some(
          (r: any) =>
            r.status === "PASS" &&
            r.caseId ===
              cases.find(
                (t: any) => t.expectedPlan.mustConsiderCapability === c.capabilityId,
              )?.id,
        )
      ? "LEGAL_BLOCK_OR_MATCH_IN_PASS_CASE"
      : "NOT_QUALIFIED",
}));
writeFileSync(
  new URL("CONFORMANCE_MATRIX.json", root),
  JSON.stringify(matrix, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    qualification: report.qualification,
    totals,
    errors,
    capabilities: matrix.length,
  }),
);
