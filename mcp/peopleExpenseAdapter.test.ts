import { expect, it } from "vitest";
import {
  matchPeople,
  prepareAliasPlan,
  prepareTravelerPlan,
  reviewMoney,
  prepareExpensePlan,
  prepareExpenseLinkPlan,
  planPersonChoice,
} from "./peopleExpenseAdapter";
import { contentDigest } from "./mutation";
import { recoveryReview, reviewPlanChange } from "./recoveryReview";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { account_id: id(1), trip_id: id(2) };
const roster = {
  ...context,
  revision: 1,
  complete: true,
  people: [
    "Lin Chen",
    "Alex Smith",
    "Alex Smith",
    "Mira Patel",
    "Sam Lee",
    "Jo Brown",
    "Kai Wilson",
  ].map((display_name, i) => ({
    person_id: id(10 + i),
    display_name,
    confirmed_visible_aka: [],
  })),
};
it("seven-person matching suggests spelling variants, preserves same-name ambiguity and never auto-connects", () => {
  const observations = ["LIN/CHEN", "Alex Smith", "New QA Traveler"].map((name) => ({
    name,
    source_refs: ["people/page1"],
  }));
  const result = matchPeople(context, observations, roster);
  expect(result[0]).toMatchObject({
    decision: "NEEDS_INPUT",
    candidates: [{ person_id: id(10) }],
  });
  expect(result[1].candidates).toHaveLength(2);
  expect(result[1].reason).toBe("SAME_NAME_DIFFERENT_PEOPLE");
  expect(result[2].reason).toBe("CHOOSE_NEW_TRAVELER_OR_UNRESOLVED");
  expect(matchPeople(context, observations, null)[0].decision).toBe("BLOCKED");
  expect(() =>
    matchPeople({ ...context, account_id: id(99) }, observations, roster),
  ).toThrow("SCOPE_MISMATCH");
  const traveler = prepareTravelerPlan({
    version: 1,
    operationId: id(30),
    tripId: id(2),
    personId: id(31),
    tripCreateOperationId: id(32),
    dataOwnership: "CLOUD_SHARED_AUTHORED",
    displayName: "New QA Traveler",
  });
  expect(traveler).toMatchObject({
    dispatch: "NOT_CONNECTED",
    requires_trusted_confirmation: true,
  });
  expect(
    prepareAliasPlan({
      person_id: id(10),
      alias: "LIN/CHEN",
      scope: "TRIP",
      source_refs: ["p1"],
      expected_revision: 1,
      action: "ADD",
    }).decision,
  ).toBe("BLOCKED");
  expect(() =>
    prepareAliasPlan({
      person_id: id(10),
      alias: "x",
      scope: "GLOBAL_SELF",
      source_refs: ["p1"],
      expected_revision: 1,
      action: "CORRECT",
    }),
  ).toThrow("EXACT_ALIAS_ID");
});
it("suggests reversed names, visible Chinese/AKA and nickname without merging identities; user corrections require a new choice revision", () => {
  const enriched = {
    ...roster,
    people: roster.people.map((p, i) =>
      i === 0
        ? {
            ...p,
            nickname: "小林",
            visible_document_name: "陈林",
            confirmed_visible_aka: ["CHEN LIN"],
          }
        : p,
    ),
  };
  const observations = ["Chen Lin", "陈林", "小林"].map((name) => ({
    name,
    source_refs: ["document/page1"],
  }));
  expect(
    matchPeople(context, observations, enriched).every(
      (r) => r.candidates.length === 1 && r.decision === "NEEDS_INPUT",
    ),
  ).toBe(true);
  expect(
    matchPeople(
      context,
      [
        {
          name: "Unproven transliteration",
          spelling_variants: ["Lin Chen"],
          source_refs: ["document/page2"],
        },
      ],
      enriched,
    )[0].decision,
  ).toBe("NEEDS_INPUT");
  const first = {
    observation_name: "Alex Smith",
    source_refs: ["document/page3"],
    choice: "MATCH_EXISTING",
    person_id: id(11),
    choice_revision: 1,
    expected_roster_revision: 1,
  };
  expect(planPersonChoice(context, first, enriched).decision).toBe("MATCH_EXISTING");
  const corrected = {
    ...first,
    person_id: id(12),
    choice_revision: 2,
    previous_choice_revision: 1,
  };
  expect(planPersonChoice(context, corrected, enriched, first)).toMatchObject({
    decision: "MATCH_EXISTING",
    automatic_aka_writes: false,
    account_connections: 0,
  });
  expect(() => planPersonChoice(context, corrected, enriched)).toThrow(
    "REVISION_CONFLICT",
  );
  expect(
    planPersonChoice(
      context,
      { ...first, person_id: undefined, choice: "CREATE_UNLINKED" },
      enriched,
    ).decision,
  ).toBe("CREATE_UNLINKED");
  expect(
    planPersonChoice(
      context,
      { ...first, person_id: undefined, choice: "UNRESOLVED" },
      enriched,
    ).decision,
  ).toBe("UNRESOLVED");
});
const money = (minor: number) => ({ minor, currency: "NZD", scale: 2 });
const expenseSnapshot = {
  ...context,
  complete: true,
  expenses: [
    {
      expense_id: id(40),
      revision: 3,
      arrangement_key: "stay",
      original: money(140000),
      payer_person_id: id(10),
      split_person_ids: roster.people.map((p) => p.person_id),
    },
  ],
  links: [],
};
const observations = [
  {
    key: "total",
    arrangement_key: "stay",
    item_id: id(50),
    nature: "TOTAL",
    money: money(140000),
    paid: "UNKNOWN",
    source_refs: ["confirmation/p1"],
  },
  {
    key: "supplement",
    arrangement_key: "stay",
    nature: "TOTAL",
    money: money(140000),
    paid: "UNKNOWN",
    source_refs: ["supplement/p1"],
  },
  {
    key: "deposit",
    arrangement_key: "stay",
    nature: "DEPOSIT",
    money: money(40000),
    paid: "YES",
    source_refs: ["receipt/p1"],
  },
  {
    key: "balance",
    arrangement_key: "stay",
    nature: "BALANCE",
    money: money(100000),
    paid: "NO",
    source_refs: ["confirmation/p1"],
  },
  {
    key: "quote",
    arrangement_key: "activity",
    nature: "QUOTE",
    money: money(20000),
    paid: "NO",
    source_refs: ["quote/p1"],
  },
];
it("does not count total, deposit, balance, people/nights or supplementary files as new full-price expenses", () => {
  const result = reviewMoney(context, observations, expenseSnapshot);
  expect(result[0]).toMatchObject({
    decision: "NO_CHANGE",
    expense_id: id(40),
    payment_claimed_by_source: false,
    link: {
      decision: "BLOCKED",
      proposed_action: "LINK",
      expense_id: id(40),
      item_id: id(50),
    },
  });
  expect(result[1].reason).toBe("DUPLICATE_TOTAL_EVIDENCE_NOT_ANOTHER_EXPENSE");
  expect(result[2]).toMatchObject({
    decision: "NEEDS_INPUT",
    payment_claimed_by_source: true,
    payment_evidence_qualified: false,
    reason: "PAYMENT_OR_BALANCE_NOT_ADDITIONAL_CONSUMPTION",
  });
  expect(result[3].payment_claimed_by_source).toBe(false);
  expect(result[4].decision).toBe("NO_CHANGE");
  expect(result.filter((r) => r.decision === "CREATE")).toHaveLength(0);
  expect(
    reviewMoney(context, observations, null).every((r) => r.decision === "BLOCKED"),
  ).toBe(true);
  expect(
    reviewMoney(
      context,
      [{ ...observations[0], money: money(150000) }, observations[1]],
      expenseSnapshot,
    )[0].reason,
  ).toBe("CONFLICTING_TOTALS_OR_CURRENCIES");
  expect(
    prepareExpenseLinkPlan({
      trip_id: id(2),
      expense_id: id(40),
      item_id: id(50),
      operation_id: id(60),
      action: "LINK",
      expected_expense_revision: 3,
      expected_item_revision: 2,
    }).decision,
  ).toBe("BLOCKED");
});
it("validates an exact owning Expense payload; missing payer or unbalanced allocation cannot become a writable plan", () => {
  const payload = {
    localId: id(70),
    title: "Synthetic stay",
    description: null,
    category: "Accommodation",
    occurredAt: "2026-12-10T00:00:00Z",
    payerMemberId: id(10),
    original: money(140000),
    businessStatus: "DRAFT",
    participants: [
      { memberId: id(10), displayNameSnapshot: "Lin", householdIdSnapshot: null },
    ],
    splits: [
      {
        memberId: id(10),
        method: "EXACT",
        originalMinor: 140000,
        settlementMinor: null,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: null,
  };
  expect(prepareExpensePlan("CREATE", payload).dispatch).toBe("NOT_CONNECTED");
  expect(() =>
    prepareExpensePlan("CREATE", { ...payload, payerMemberId: undefined }),
  ).toThrow();
  expect(() =>
    prepareExpensePlan("CREATE", { ...payload, original: money(140001) }),
  ).toThrow("EXACT_ALLOCATION_REQUIRED");
});
it("one prior Expense can link to several Items without another total charge", () => {
  const review = reviewMoney(
    context,
    [{ ...observations[0], item_ids: [id(50), id(51)] }],
    expenseSnapshot,
  );
  expect(review[0].decision).toBe("NO_CHANGE");
  expect(
    (review[0] as unknown as { links: { item_id: string }[] }).links.map(
      (l) => l.item_id,
    ),
  ).toEqual([id(50), id(51)]);
});
it("reports partial outcomes then resumes the same operation set without recreating accepted objects or inventing link success", () => {
  const operations = ["ITEM", "EXPENSE", "LINK"].map((domain, i) => ({
    operation_id: id(80 + i),
    target_id: id(90 + i),
    domain,
    request_digest: contentDigest({ i }),
    capability: "AVAILABLE",
  }));
  const plan = { ...context, operations };
  const digest = contentDigest(plan);
  const appliedItem = {
    ...context,
    ...operations[0],
    capability: undefined,
    outcome: "APPLIED",
    current_revision: 2,
  };
  delete (appliedItem as { capability?: unknown }).capability;
  const unknownExpense = {
    ...context,
    ...operations[1],
    capability: undefined,
    outcome: "UNKNOWN",
    current_revision: null,
  };
  delete (unknownExpense as { capability?: unknown }).capability;
  const first = recoveryReview(plan, digest, [appliedItem, unknownExpense]);
  expect(first.rows.map((r) => r.status)).toEqual(["APPLIED", "UNKNOWN", "UNKNOWN"]);
  expect(first.rows[1].next_action).toBe("QUERY_SAME_OWNING_OPERATION_NO_NEW_ID");
  const appliedExpense = { ...unknownExpense, outcome: "APPLIED", current_revision: 1 };
  const last = recoveryReview(plan, digest, [appliedItem, appliedExpense]);
  expect(last.complete).toBe(false);
  expect(last.rows[0].next_action).toBe("READBACK_NO_RECREATE");
  expect(last.rows[2].status).toBe("UNKNOWN");
  const { capability: _capability, ...linkOperation } = operations[2];
  const stoppedLink = {
    ...context,
    ...linkOperation,
    outcome: "NOT_SUBMITTED",
    current_revision: null,
    no_dispatch_evidence: "NOT_SUBMITTED_AFTER_STOP",
  };
  expect(
    recoveryReview(plan, digest, [appliedItem, unknownExpense, stoppedLink]).rows[2]
      .next_action,
  ).toBe("WAIT_FOR_PRIOR_UNRESOLVED_OPERATION");
  expect(
    recoveryReview(plan, digest, [appliedItem, appliedExpense, stoppedLink]).rows[2]
      .next_action,
  ).toBe("SUBMIT_ONLY_ORIGINAL_CONFIRMED_OPERATION");
  expect(() =>
    recoveryReview(plan, digest, [{ ...stoppedLink, no_dispatch_evidence: undefined }]),
  ).toThrow("EXPLICIT_NO_DISPATCH");
  const blockedPlan = {
    ...plan,
    operations: operations.map((o, i) => ({
      ...o,
      capability: i === 2 ? "BLOCKED" : "AVAILABLE",
    })),
  };
  expect(
    recoveryReview(blockedPlan, contentDigest(blockedPlan), [appliedItem, appliedExpense])
      .rows[2].status,
  ).toBe("BLOCKED");
  expect(() => recoveryReview(plan, "0".repeat(64), [])).toThrow(
    "CONFIRMED_PLAN_MISMATCH",
  );
  expect(() =>
    recoveryReview(plan, digest, [{ ...appliedItem, account_id: id(99) }]),
  ).toThrow("SCOPE_OR_INTENT_MISMATCH");
  expect(() =>
    recoveryReview(plan, digest, [{ ...appliedItem, operation_id: id(999) }]),
  ).toThrow("SCOPE_OR_INTENT_MISMATCH");
});
it("orders Traveler/Item/Expense/Link dependencies, learns a server Expense ID and protects UNKNOWN when the user changes a plan", () => {
  const ops = ["PERSON", "ITEM", "EXPENSE", "LINK"].map((domain, i) => ({
    operation_id: id(200 + i),
    target_id: domain === "EXPENSE" ? null : id(210 + i),
    domain,
    request_digest: contentDigest({ i }),
    capability: "AVAILABLE",
    requires_operation_ids: i ? [id(199 + i)] : [],
  }));
  const plan = { ...context, operations: ops },
    digest = contentDigest(plan);
  const outcomes = ops.map(
    ({ capability: _c, requires_operation_ids: _r, ...op }, i) => ({
      ...context,
      ...op,
      target_id: op.target_id ?? id(999),
      outcome: i === 0 ? "APPLIED" : "NOT_SUBMITTED",
      current_revision: i === 0 ? 1 : null,
      ...(i ? { no_dispatch_evidence: "NOT_SUBMITTED_AFTER_STOP" } : {}),
    }),
  );
  const first = recoveryReview(plan, digest, outcomes);
  expect(first.rows[2].next_action).toBe("WAIT_FOR_DEPENDENCY_RECEIPT");
  const appliedExpense = { ...outcomes[2], outcome: "APPLIED", current_revision: 1 };
  expect(
    recoveryReview(plan, digest, [outcomes[0], appliedExpense]).rows[2].target_id,
  ).toBe(id(999));
  const altered = {
    ...plan,
    operations: ops.map((op, i) =>
      i === 1 ? { ...op, request_digest: contentDigest({ changed: true }) } : op,
    ),
  };
  expect(() =>
    reviewPlanChange(plan, digest, outcomes, altered, contentDigest(altered)),
  ).toThrow("OPERATION_ID_IMMUTABLE");
  const replacement = {
    ...plan,
    operations: [
      ops[0],
      {
        ...ops[1],
        operation_id: id(400),
        request_digest: contentDigest({ changed: true }),
        requires_operation_ids: [],
      },
    ],
  };
  const changed = reviewPlanChange(
    plan,
    digest,
    [outcomes[0]],
    replacement,
    contentDigest(replacement),
  );
  expect(changed[0].decision).toBe("REUSE_ACCEPTED_RECEIPT_NO_RECREATE");
  expect(changed[1]).toMatchObject({
    decision: "BLOCKED_RESOLVE_ORIGINAL_OPERATION_FIRST",
    original_operation_id: ops[1].operation_id,
  });
});
