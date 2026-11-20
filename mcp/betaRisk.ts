import { z } from "zod";
import { contentDigest } from "./mutation";
import frozen from "../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import artifact from "../docs/mcp/beta-contract-v1.1/RISK_REGISTRY.json";
import { betaRequestSchema } from "../backend/src/mcpBetaApiSchemas";
export const riskLevelSchema = z.enum([
  "READ",
  "L1_NORMAL_WRITE",
  "L2_SENSITIVE_WRITE",
  "L3_HIGH_IMPACT_WRITE",
  "OUT_OF_SCOPE",
]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export const p5ServiceIdentityFields = [
  "operator_issuer",
  "operator_value",
  "operator_literal",
  "service_number",
  "service_literal",
] as const;
const registrySchema = z.object({
  version: z.literal("otr.mcp-beta.risk/1.1.0"),
  capabilityCount: z.literal(103),
  rules: z.object({
    bulkDestructiveTargetThreshold: z.literal(10),
    decompositionWindowSeconds: z.literal(900),
    planEnforcementVersion: z.literal("otr.mcp-beta.plan-enforcement/1.1.1"),
    declaredPlanFenceSeconds: z.literal(900),
  }),
  capabilities: z
    .array(
      z.object({
        capabilityId: z.string(),
        method: z.string(),
        path: z.string(),
        effect: z.enum(["READ", "WRITE"]),
        risk: riskLevelSchema,
        commandUnits: z.array(z.string()),
        reason: z.string(),
        requiresTrustedConfirmation: z.boolean(),
        dynamicEscalation: z.array(z.string()),
      }),
    )
    .length(103),
});
export const riskRegistry = registrySchema.parse(artifact);
const ids = new Set(riskRegistry.capabilities.map((c) => c.capabilityId));
if (
  ids.size !== 103 ||
  frozen.capabilities.some((c) => {
    const r = riskRegistry.capabilities.find((r) => r.capabilityId === c.capabilityId);
    return (
      !r ||
      r.method !== c.method ||
      r.path !== c.path ||
      r.effect !== c.effect ||
      JSON.stringify(r.commandUnits) !== JSON.stringify(c.commandUnits) ||
      (r.risk === "READ") !== (c.effect === "READ") ||
      r.requiresTrustedConfirmation !== (r.risk === "L3_HIGH_IMPACT_WRITE")
    );
  })
)
  throw Error("RISK_REGISTRY_FROZEN_MISMATCH");
const callEnvelope = z.object({
  capabilityId: z.string(),
  toolName: z.string(),
  pathParams: z.record(z.string(), z.string()),
  query: z.unknown(),
  request: z.unknown(),
});
export function assessBetaRisk(raw: unknown) {
  const call = callEnvelope.parse(raw),
    c = frozen.capabilities.find((c) => c.capabilityId === call.capabilityId),
    row = riskRegistry.capabilities.find((c) => c.capabilityId === call.capabilityId);
  if (!c || !row || c.toolName !== call.toolName)
    throw Error("RISK_OPERATION_OUT_OF_SCOPE");
  const parsed = betaRequestSchema(c.capabilityId).safeParse(
    c.effect === "READ" ? call.query : call.request,
  );
  if (!parsed.success) {
    if (
      parsed.error.issues.some((issue) => issue.message === "INVALID_TRANSPORT_IDENTITY")
    )
      throw Error("CORE_P5_SERVICE_IDENTITY_REQUIRED");
    throw parsed.error;
  }
  const actual = parsed.data as any;
  if (
    actual.tripId !== undefined &&
    c.path.includes("{tripId}") &&
    actual.tripId !== call.pathParams.tripId
  )
    throw Error("RISK_TARGET_MISMATCH");
  // Match the existing Core setSchedule invariant before an invalid create reaches Apply.
  if (
    actual.command === "CREATE_ITEM" &&
    actual.payload.family !== "P5" &&
    !actual.payload.schedule.start.local_date
  )
    throw Error("CORE_START_LOCAL_DATE_REQUIRED");
  const service =
    actual.command === "CREATE_ITEM" && actual.payload.family === "P5"
      ? actual.payload.service
      : actual.command === "SET_TRANSPORT_DETAILS"
        ? (actual.payload.patch?.service ?? actual.payload.service)
        : undefined;
  if (
    service &&
    p5ServiceIdentityFields.some(
      (field) =>
        typeof service[field] === "string" &&
        service[field].replace(/^ +| +$/gu, "").length === 0,
    )
  )
    throw Error("CORE_P5_SERVICE_IDENTITY_REQUIRED");
  let risk = row.risk;
  const reasons = [row.reason];
  if (
    c.effect === "WRITE" &&
    actual.command &&
    !row.commandUnits.includes(actual.command)
  )
    throw Error("RISK_COMMAND_MISMATCH");
  if (c.capabilityId === "otr.expense.update") {
    const patch = actual.envelope.patchOrIntent.patch;
    if (
      patch.participantSplit ||
      patch.financial?.payerMemberId !== undefined ||
      patch.financial?.settlementParticipation !== undefined
    ) {
      risk = "L2_SENSITIVE_WRITE";
      reasons.push("Actual allocation/payer/settlement participation patch");
    }
  }
  const destructive = c.effect === "WRITE" && /\.(delete|hide)$/.test(c.capabilityId);
  const targetId =
    call.pathParams.itemId ??
    call.pathParams.expenseId ??
    actual.target?.id ??
    call.pathParams.tripId ??
    actual.tripId ??
    null;
  return {
    version: riskRegistry.version,
    capabilityId: c.capabilityId,
    risk,
    requiresTrustedConfirmation: risk === "L3_HIGH_IMPACT_WRITE",
    requiresImpactExplanation: risk === "L2_SENSITIVE_WRITE",
    destructive,
    targetId,
    tripId: call.pathParams.tripId ?? actual.tripId ?? null,
    reasons,
  };
}
export const riskPlanSchema = z.strictObject({
  schemaVersion: z.literal("otr.mcp-beta.risk-plan/1.1.0"),
  intentId: z.uuid(),
  steps: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        stage: z.enum(["READ", "PREVIEW", "APPLY"]),
        dependsOn: z.array(z.string()).max(100),
        call: z.unknown(),
      }),
    )
    .min(1)
    .max(100),
});
export function assessRiskPlan(raw: unknown) {
  const plan = riskPlanSchema.parse(raw),
    seen = new Set<string>();
  const effects = plan.steps.map((step) => {
    if (seen.has(step.id) || step.dependsOn.some((id) => !seen.has(id)))
      throw Error("RISK_PLAN_DEPENDENCY_INVALID");
    seen.add(step.id);
    const risk = assessBetaRisk(step.call);
    if ((step.stage === "READ") !== (risk.risk === "READ"))
      throw Error("RISK_PLAN_STAGE_INVALID");
    return { ...risk, stepId: step.id, stage: step.stage };
  });
  const actual = effects.filter((x) => x.stage === "APPLY"),
    targets = new Set(
      actual.filter((x) => x.destructive).map((x) => x.tripId + ":" + x.targetId),
    );
  const rank: Record<RiskLevel, number> = {
    READ: 0,
    L1_NORMAL_WRITE: 1,
    L2_SENSITIVE_WRITE: 2,
    L3_HIGH_IMPACT_WRITE: 3,
    OUT_OF_SCOPE: 4,
  };
  const base = actual.reduce<RiskLevel>(
      (level, x) => (rank[x.risk] > rank[level] ? x.risk : level),
      "READ",
    ),
    risk =
      targets.size >= riskRegistry.rules.bulkDestructiveTargetThreshold
        ? "L3_HIGH_IMPACT_WRITE"
        : base;
  return {
    version: riskRegistry.version,
    intentId: plan.intentId,
    risk,
    requiresTrustedConfirmation: risk === "L3_HIGH_IMPACT_WRITE",
    boundApplyStepIds: actual.map((x) => x.stepId),
    multipleDestructiveTargets:
      targets.size >= riskRegistry.rules.bulkDestructiveTargetThreshold,
    effects,
    executed: false,
    approvalGranted: false,
  };
}

export function bindRiskExecutionPlan(raw: unknown, call: unknown) {
  const plan = riskPlanSchema.parse(raw);
  const assessment = assessRiskPlan(plan);
  const steps = plan.steps.filter((step) => step.stage === "APPLY");
  const operations = steps.map((step) => {
    const request = callEnvelope.parse(step.call).request as {
      operationId?: string;
      envelope?: { idempotencyKey?: string };
    };
    return z.uuid().parse(request.operationId ?? request.envelope?.idempotencyKey);
  });
  if (new Set(operations).size !== operations.length)
    throw Error("RISK_PLAN_DUPLICATE_OPERATION");
  if (
    steps.filter((step) => contentDigest(step.call) === contentDigest(call)).length !== 1
  )
    throw Error("RISK_PLAN_APPLY_BINDING_MISMATCH");
  return { plan, assessment, operations, digest: contentDigest(plan) };
}
