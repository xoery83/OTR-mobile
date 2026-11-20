import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { validatePlan } from "./validate";
import { registry, requestSchema } from "./requests";
import { validateSnapshot } from "./responses";
import { assess } from "./assess";
const raw = JSON.parse(
  readFileSync(new URL("../results/READ-01.actual.json", import.meta.url), "utf8"),
);
const clone = () => structuredClone(raw);
let checks = 0;
const reject = (edit: (p: any) => void) => {
  const p = clone();
  edit(p);
  assert.throws(() => validatePlan(p));
  checks++;
};
assert.equal(registry.length, 103);
assert.equal(new Set(registry.map((c) => c.capabilityId)).size, 103);
checks++;
assert.equal(validatePlan(raw).status, "STATIC_PASS");
checks++;
reject((p) => (p.mode = "APPLY"));
reject((p) => (p.resultClaim = "APPLIED"));
reject((p) => (p.steps[0].call.toolName = "archive_trip"));
reject((p) => (p.steps[0].call.capabilityId = "otr.settlement.finalize"));
reject((p) => (p.steps[0].call.query.limit = 26));
reject((p) => (p.steps[0].call.query.confirmed = true));
reject((p) => (p.steps[0].dependsOn = [p.steps[0].id]));
reject((p) => (p.steps[0].dependsOn = ["future"]));
reject((p) => p.steps.push(p.steps[0]));
reject((p) => (p.materials[0].trustedAsInstructions = true));
reject((p) => (p.facts[0].materialId = "absent"));
reject((p) => (p.summary = "x".repeat(5001)));
reject(
  (p) =>
    (p.steps[1].call = {
      capabilityId: "otr.trip.list",
      toolName: "list_trips",
      pathParams: {},
      query: { cursor: { $result: { stepId: "s1", pointer: "/nonexistent" } } },
      request: {},
    }),
);
reject(
  (p) =>
    (p.steps[1].call = {
      capabilityId: "otr.trip.list",
      toolName: "list_trips",
      pathParams: {},
      query: { limit: { $result: { stepId: "s1", pointer: "/trips/0/id" } } },
      request: {},
    }),
);
for (const c of registry) {
  assert.throws(() => requestSchema(c).parse({ unknownField: true }));
  checks++;
}
const snapshots = JSON.parse(
  readFileSync(new URL("../corpus/snapshots.json", import.meta.url), "utf8"),
);
for (const s of snapshots) {
  validateSnapshot(s.schema, s.response);
  checks++;
}
const bad = structuredClone(
  snapshots.find((s: any) => s.name === "roster-distinct-ids").response,
);
bad.people[0].ledgerMemberId = null;
assert.throws(() => validateSnapshot("RosterSnapshot", bad));
checks++;
const q = registry.find((c) => c.capabilityId === "otr.p3.update")!,
  request: any = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: "10000000-0000-4000-8000-000000009001",
    tripId: "10000000-0000-4000-8000-000000000001",
    command: "SET_STAY_DETAILS",
    target: { kind: "ITEM", id: "10000000-0000-4000-8000-000000000103" },
    baseVector: [
      { kind: "ITEM", id: "10000000-0000-4000-8000-000000000103", revision: 1 },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      roomChanges: [
        {
          operation: "PATCH",
          room_id: "10000000-0000-4000-8000-000000000301",
          changes: { capacity: 5 },
        },
      ],
    },
  };
requestSchema(q).parse(request);
checks++;
assert.throws(() => requestSchema(q).parse({ ...request, payload: { rooms: [] } }));
checks++;
assert.throws(() =>
  requestSchema(q).parse({
    ...request,
    payload: {
      roomChanges: [
        {
          operation: "PATCH",
          room_id: "10000000-0000-4000-8000-000000000301",
          changes: {},
        },
      ],
    },
  }),
);
checks++;
const p4 = registry.find((c) => c.capabilityId === "otr.p4.update")!;
requestSchema(p4).parse({
  ...request,
  command: "SET_RENTAL_DETAILS",
  payload: { details: { or_similar: false } },
});
checks++;
assert.throws(() =>
  requestSchema(p4).parse({
    ...request,
    command: "SET_RENTAL_DETAILS",
    payload: { places: { pickup: { accepted_latitude: 1 } } },
  }),
);
checks++;
const expected: any = clone();
expected.intentId = "p3-room-offline-expected";
expected.planId = "p3-room-offline-expected-v1";
expected.target = { tripId: request.tripId, tripSelection: "EXACT" };
expected.facts = [];
expected.fieldCoverage = [];
expected.questions = [];
const step = (id: string, stage: string, dependsOn: string[], call: any) => ({
  ...structuredClone(raw.steps[0]),
  id,
  stage,
  dependsOn,
  call,
  expected: { outcome: "READ_ONLY", verifyPaths: [] },
  guard: [],
  status: "PLANNED",
});
const get = {
  capabilityId: "otr.p3.get",
  toolName: "get_trip_item",
  pathParams: { tripId: request.tripId, itemId: request.target.id },
  query: {},
  request: {},
};
const preview = step("preview", "PREVIEW", ["read", "cap"], null);
const confirm = step("confirm", "CONFIRM", ["preview"], null);
confirm.status = "BLOCKED_USER";
confirm.confirmation = {
  required: true,
  risk: "EDIT",
  summary:
    "Harbour Week / Harbour House Room 301 capacity 4 → 5; other room unchanged, no currency/split/link effects. Manual room edit requires confirmation.",
  boundStepIds: ["apply"],
};
const apply = step("apply", "APPLY", ["confirm"], {
  capabilityId: "otr.p3.update",
  toolName: "update_trip_item",
  pathParams: { tripId: request.tripId },
  query: {},
  request: structuredClone(request),
});
apply.status = "WAITING_RESULT";
apply.plannedOperationKey = "p3-room-offline-expected:apply";
apply.expected = {
  outcome: "APPLIED_OR_NO_CHANGE",
  verifyPaths: ["/record/body/trip_stay_rooms"],
};
apply.call.request.baseVector[0].revision = {
  $result: { stepId: "read", pointer: "/record/revision" },
};
apply.guard = [
  { kind: "CURRENT_REVISION", sourceStepId: "read", pointer: "/record/revision" },
  {
    kind: "UNCHANGED_FIELDS",
    sourceStepId: "read",
    excludedPaths: ["/record/body/trip_stay_rooms/0/capacity"],
  },
  { kind: "CAPABILITY_ALLOWED", capabilityId: "otr.p3.update" },
  { kind: "HUMAN_CONFIRMATION_REQUIRED", previewStepId: "preview" },
];
expected.steps = [
  step("read", "READ", [], get),
  step("cap", "READ", [], {
    capabilityId: "otr.permissions.read",
    toolName: "get_trip_capabilities",
    pathParams: { tripId: request.tripId },
    query: {},
    request: {},
  }),
  preview,
  confirm,
  apply,
  step("verify", "VERIFY", ["apply"], get),
];
assert.equal(validatePlan(expected).status, "STRUCTURE_PASS_RESOLUTION_PENDING");
checks++;
assert.equal(
  validatePlan(expected, {
    read: snapshots.find((s: any) => s.name === "P3-full").response,
  }).status,
  "STATIC_PASS",
);
checks++;
const rejectExpected = (edit: (p: any) => void) => {
  const p = structuredClone(expected);
  edit(p);
  assert.throws(() => validatePlan(p));
  checks++;
};
rejectExpected((p) => (p.steps[4].dependsOn = ["read"]));
rejectExpected(
  (p) =>
    (p.steps[4].guard = p.steps[4].guard.filter(
      (g: any) => g.kind !== "UNCHANGED_FIELDS",
    )),
);
rejectExpected(
  (p) =>
    (p.steps[4].call.request.baseVector[0].revision = {
      $result: { stepId: "read", pointer: "/item/title" },
    }),
);
rejectExpected(
  (p) =>
    (p.steps[4].call.pathParams.tripId = {
      $result: { stepId: "read", pointer: "/item/title" },
    }),
);
rejectExpected((p) => (p.steps[4].call.request.payload = { rooms: [] }));
expected.summary =
  "Hand-authored OFFLINE Expected Plan fixture, not an actual GPT output or executed result.";
writeFileSync(
  new URL("../corpus/P3-ROOM.expected.plan.json", import.meta.url),
  JSON.stringify(expected, null, 2) + "\n",
);
const expenseExpected: any = structuredClone(expected);
expenseExpected.intentId = "offline-expense-mapping";
expenseExpected.planId = "offline-expense-mapping-v1";
expenseExpected.steps[0].call = {
  capabilityId: "otr.people.list",
  toolName: "list_trip_people",
  pathParams: { tripId: request.tripId },
  query: {},
  request: {},
};
const sourceExpense = structuredClone(
  snapshots.find((s: any) => s.name === "expense-lunch").response,
);
const editable = Object.fromEntries(
  [
    "title",
    "description",
    "category",
    "occurredAt",
    "economicDate",
    "payerMemberId",
    "original",
    "businessStatus",
    "settlementParticipation",
    "participants",
    "splits",
    "valuation",
  ].map((k) => [k, sourceExpense[k]]),
);
editable.title = "Harbour dinner";
(editable.original as any).minor = 8000;
for (const split of editable.splits as any[]) split.originalMinor = 4000;
const expenseCall = {
  capabilityId: "otr.expense.create",
  toolName: "expense_create",
  pathParams: { tripId: request.tripId },
  query: {},
  request: {
    envelope: {
      commandId: request.operationId,
      intentVersion: 2,
      intentSequence: 1,
      predecessorOperationId: null,
      observedServerRevision: 0,
      observedBase: null,
      patchOrIntent: { type: "CREATE", expense: editable },
      causalBaseReceipt: null,
      boundExecutionRevision: null,
      idempotencyKey: request.operationId,
    },
    auditReason: null,
  },
};
expenseExpected.steps[4].call = expenseCall;
expenseExpected.steps[4].guard = [
  { kind: "CAPABILITY_ALLOWED", capabilityId: "otr.expense.create" },
  { kind: "HUMAN_CONFIRMATION_REQUIRED", previewStepId: "preview" },
  ...snapshots
    .find((s: any) => s.name === "roster-distinct-ids")
    .response.people.map((p: any) => ({
      kind: "VERIFIED_PERSON_MEMBER_MAPPING",
      sourceStepId: "read",
      personId: p.personId,
      ledgerMemberId: p.ledgerMemberId,
    })),
];
expenseExpected.steps[5].call = {
  capabilityId: "otr.expense.get",
  toolName: "expense_get",
  pathParams: {
    tripId: request.tripId,
    expenseId: { $result: { stepId: "apply", pointer: "/entity/id" } },
  },
  query: {},
  request: {},
};
const roster = snapshots.find((s: any) => s.name === "roster-distinct-ids").response;
assert.equal(
  validatePlan(expenseExpected, { read: roster }).status,
  "STRUCTURE_PASS_RESOLUTION_PENDING",
);
checks++;
for (const name of ["roster-unavailable", "roster-foreign"]) {
  assert.throws(() =>
    validatePlan(expenseExpected, {
      read: snapshots.find((s: any) => s.name === name).response,
    }),
  );
  checks++;
}
const wrong = structuredClone(expenseExpected);
wrong.steps[4].call.request.envelope.patchOrIntent.expense.payerMemberId =
  roster.people[0].personId;
assert.throws(() => validatePlan(wrong, { read: roster }));
checks++;
requestSchema(registry.find((c) => c.capabilityId === "otr.expense.create")!).parse(
  expenseCall.request,
);
checks++;
assert.throws(() =>
  requestSchema(q).parse({
    ...request,
    command: "SET_ITEM_SCHEDULE",
    payload: { schedulePatch: { start: { local_time: null, clock_precision: 0 } } },
  }),
);
checks++;
const other = structuredClone(expected);
other.steps[5].call.pathParams.itemId = "10000000-0000-4000-8000-000000009999";
assert.throws(() => validatePlan(other));
checks++;
const baseUpdate = structuredClone(expenseExpected);
baseUpdate.steps[0].call = {
  capabilityId: "otr.expense.get",
  toolName: "expense_get",
  pathParams: { tripId: request.tripId, expenseId: sourceExpense.id },
  query: {},
  request: {},
};
baseUpdate.steps[4].call.capabilityId = "otr.expense.update";
baseUpdate.steps[4].call.toolName = "expense_update";
baseUpdate.steps[4].call.pathParams.expenseId = sourceExpense.id;
const env = baseUpdate.steps[4].call.request.envelope;
env.observedServerRevision = { $result: { stepId: "read", pointer: "/revision" } };
env.observedBase = { $result: { stepId: "read", pointer: "" } };
env.patchOrIntent = {
  type: "UPDATE",
  patch: { descriptive: { description: "Group lunch" } },
};
baseUpdate.steps[4].guard = [
  { kind: "CAPABILITY_ALLOWED", capabilityId: "otr.expense.update" },
  { kind: "HUMAN_CONFIRMATION_REQUIRED", previewStepId: "preview" },
  { kind: "CURRENT_REVISION", sourceStepId: "read", pointer: "/revision" },
];
assert.equal(
  validatePlan(baseUpdate, { read: sourceExpense }).status,
  "STRUCTURE_PASS_RESOLUTION_PENDING",
);
checks++;
assert.throws(() =>
  validatePlan(baseUpdate, {
    read: { ...sourceExpense, id: "10000000-0000-4000-8000-000000009999" },
  }),
);
checks++;
assert.throws(() =>
  validatePlan(baseUpdate, {
    read: { ...sourceExpense, journeyId: "10000000-0000-4000-8000-000000009999" },
  }),
);
checks++;
const cases = JSON.parse(
  readFileSync(new URL("../corpus/cases.json", import.meta.url), "utf8"),
);
const caseData = (id: string) => cases.find((c: any) => c.id === id);
const actual = (id: string) =>
  JSON.parse(
    readFileSync(new URL("../results/" + id + ".actual.json", import.meta.url), "utf8"),
  );
const pos1 = actual("POS-P1-CREATE");
assert.equal(assess(caseData("POS-P1-CREATE"), pos1).failures.length, 0);
checks++;
const guessed = structuredClone(pos1);
guessed.steps.find(
  (s: any) => s.stage === "APPLY",
).call.request.payload.schedule.start.zone_id = "Pacific/Auckland";
assert(
  assess(caseData("POS-P1-CREATE"), guessed).failures.some(
    (f) => f.category === "Hallucinated Fact",
  ),
);
checks++;
const wrongTrip = actual("POS-TRIP-CREATE");
wrongTrip.target = { tripSelection: "EXACT", tripId: request.tripId };
assert(
  assess(caseData("POS-TRIP-CREATE"), wrongTrip).failures.some(
    (f) => f.category === "Incorrect Object Match",
  ),
);
checks++;
const wrongMember = actual("POS-EXPENSE-DRAFT");
wrongMember.steps.find(
  (s: any) => s.stage === "APPLY",
).call.request.envelope.patchOrIntent.expense.payerMemberId =
  "10000000-0000-4000-8000-000000000003";
assert(assess(caseData("POS-EXPENSE-DRAFT"), wrongMember).failures.length);
checks++;
const restored = actual("CAP-016");
assert.equal(assess(caseData("CAP-016"), restored).failures.length, 0);
checks++;
const notSelected = actual("READ-01");
notSelected.target = { tripSelection: "EXACT", tripId: request.tripId };
assert(
  assess(caseData("READ-01"), notSelected).failures.some(
    (f) => f.category === "Incorrect Object Match",
  ),
);
checks++;
const sourcePlace = structuredClone(
  pos1.steps.find((s: any) => s.stage === "APPLY").call.request,
);
const materialize = (v: any): any =>
  v && typeof v === "object"
    ? v.$identity
      ? v.$identity.kind === "OPERATION"
        ? "10000000-0000-4000-8000-000000009001"
        : "10000000-0000-4000-8000-000000009002"
      : Array.isArray(v)
        ? v.map(materialize)
        : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, materialize(x)]))
    : v;
const authored = materialize(sourcePlace),
  createP1 = requestSchema(registry.find((c) => c.capabilityId === "otr.p1.create")!);
createP1.parse(authored);
checks++;
authored.payload.place.accepted_address = "Unverified provider address";
assert.throws(() => createP1.parse(authored));
checks++;
const cancel = actual("CANCEL");
cancel.summary =
  "User explicitly authorizes logical deletion in principle; supplier cancellation confirmation is NOT required. Logical deletion will not cancel supplier booking.";
assert.equal(assess(caseData("CANCEL"), cancel).failures.length, 0);
checks++;
cancel.summary =
  "Pending cancellation is not authority. Verify formal confirmation and exact affected objects before delete.";
assert(
  assess(caseData("CANCEL"), cancel).failures.some(
    (f) => f.category === "Unsupported Operation",
  ),
);
checks++;
const recovery = actual("UNKNOWN");
const opStep = recovery.steps.find(
  (s: any) => s.call?.capabilityId === "otr.ledger.operation.get",
);
const stopped = validatePlan(recovery, {
  [opStep.id]: snapshots.find((s: any) => s.name === "operation-unknown").response,
});
assert(stopped.stoppedByUnknownSteps.length > 0);
checks++;
const invalidRecovery = structuredClone(recovery);
const dependent = invalidRecovery.steps.find(
  (s: any) => s.call?.capabilityId === "otr.expense.get",
);
dependent.call.pathParams.expenseId.$result.pointer = "/nonexistent";
assert.throws(() =>
  validatePlan(invalidRecovery, {
    [opStep.id]: snapshots.find((s: any) => s.name === "operation-unknown").response,
  }),
);
checks++;
const linkRequest = {
  contractVersion: 2,
  intentVersion: 2,
  operationId: "10000000-0000-4000-8000-000000009001",
  tripId: "10000000-0000-4000-8000-000000000001",
  command: "LINK_EXPENSE",
  target: { kind: "EXPENSE_LINK", id: "10000000-0000-4000-8000-000000009002" },
  baseVector: [
    { kind: "EXPENSE_LINK", id: "10000000-0000-4000-8000-000000009002", revision: null },
    { kind: "ITEM", id: "10000000-0000-4000-8000-000000000103", revision: 1 },
  ],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    expenseId: "10000000-0000-4000-8000-000000000401",
    targetKind: "ITEM",
    targetId: "10000000-0000-4000-8000-000000000103",
    expectedExpenseRevision: 2,
  },
};
const linkSchema = requestSchema(
  registry.find((c) => c.capabilityId === "otr.expense.link")!,
);
linkSchema.parse(linkRequest);
checks++;
const wrongLinkItem = structuredClone(linkRequest);
wrongLinkItem.baseVector[1].id = "10000000-0000-4000-8000-000000000104";
assert.throws(() => linkSchema.parse(wrongLinkItem));
checks++;
const missingLinkItem = structuredClone(linkRequest);
missingLinkItem.baseVector.pop();
assert.throws(() => linkSchema.parse(missingLinkItem));
checks++;

linkRequest.baseVector[0].revision = 1;
assert.throws(() => linkSchema.parse(linkRequest));
checks++;
console.log(
  JSON.stringify({
    selfchecks: checks,
    status: "PASS",
    realBusinessCalls: 0,
    modelPassNotInferred: true,
  }),
);
