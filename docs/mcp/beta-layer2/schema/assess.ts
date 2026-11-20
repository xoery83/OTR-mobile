// Independent business assertions from the user tasks and synthetic fixtures, not one required call order.
export function assess(caseData: any, p: any) {
  const failures: { category: string; detail: string }[] = [];
  const expect = (ok: unknown, detail: string, category = "Wrong Field") => {
    if (!ok) failures.push({ category, detail });
  };
  const calls = p.steps.filter((s: any) => s.call),
    writes = calls.filter((s: any) => s.stage === "APPLY");
  const cap = (id: string) => calls.filter((s: any) => s.call.capabilityId === id);
  const write = (id: string) => writes.filter((s: any) => s.call.capabilityId === id);
  const body = (s: any) => s.call.request;
  const blocked = p.steps.some((s: any) =>
    ["BLOCKED_USER", "BLOCKED_CAPABILITY"].includes(s.status),
  );
  const cid = caseData.id;
  const target = caseData.expectedPlan.mustConsiderCapability;
  for (const required of caseData.expectedPlan.requiredCapabilities ?? [])
    expect(cap(required).length, "Missing positive capability " + required, "Wrong Tool");
  if (cid === "POS-VALUATION")
    expect(
      write("otr.expense.valuation").some(
        (s: any) =>
          body(s).envelope.patchOrIntent.valuation.policy === "MANUAL_AGREED" &&
          body(s).envelope.patchOrIntent.valuation.manualRate === "1.5" &&
          body(s).envelope.patchOrIntent.valuation.previewSettlement.minor === 15000,
      ),
      "Manual valuation must preserve USD100 -> NZD150 at 1.5",
    );
  if (cid === "POS-RESOLVE")
    expect(
      write("otr.expense.resolve").some((s: any) => body(s).choice === "KEEP_SERVER"),
      "Conflict must keep server",
    );
  if (
    cid.startsWith("POS-") &&
    caseData.expectedPlan.requiredCapabilities?.every(
      (c: string) =>
        !["get", "read", "history", "export", "preview"].some((v) => c.endsWith("." + v)),
    )
  )
    expect(
      writes.length,
      "Positive mutation must have future APPLY template",
      "Wrong Tool",
    );
  if (target && !cap(target).length) {
    const duplicate =
      target === "otr.expense.create" &&
      /identical|duplicate|重复/i.test(p.summary) &&
      cap("otr.expense.get").length;
    const noChange =
      target.endsWith(".restore") &&
      !writes.length &&
      /NO_CHANGE/.test(p.summary) &&
      cap("otr.item.lifecycle.base").length;
    expect(
      blocked || duplicate || noChange,
      "Requested capability neither planned nor legally blocked/matched",
      "Wrong Tool",
    );
  }
  if (target?.endsWith(".search"))
    expect(
      cap(target).some((s: any) => s.call.query.query === "Synthetic"),
      "Search omitted the requested literal",
    );
  if (target === "otr.trip.list")
    expect(
      cap(target).some((s: any) => s.call.query.lifecycle === "ALL"),
      "Trip list omitted archived filter",
    );
  if (target === "otr.expense.list")
    expect(
      cap(target).some((s: any) => s.call.query.includeDeleted === true),
      "Expense list omitted includeDeleted",
    );
  if (target?.match(/^otr\.p[1-6]\.update$/))
    expect(
      write(target).some(
        (s: any) =>
          body(s).command === "SET_ITEM_TEXT" &&
          body(s).payload.description === "Meet at reception",
      ),
      "Six-family edit must preserve exact requested description",
    );
  if (target?.endsWith(".participation"))
    expect(
      write(target).some(
        (s: any) =>
          body(s).payload.participation.mode === "SELECTED_MEMBERS" &&
          JSON.stringify([...body(s).payload.participation.people].sort()) ===
            JSON.stringify([
              "10000000-0000-4000-8000-000000000003",
              "10000000-0000-4000-8000-000000000005",
            ]),
      ),
      "Item participation must use selected Person IDs, not Member IDs",
    );
  if (target?.endsWith(".visibility"))
    expect(
      write(target).some(
        (s: any) =>
          body(s).payload.acl.visibility === "GROUP" &&
          body(s).payload.acl.people.length === 0,
      ),
      "Visibility request was not GROUP",
    );
  if (target === "otr.trip.currency.preview" || target === "otr.trip.currency.update")
    expect(
      cap("otr.trip.currency.preview").some(
        (s: any) => body(s).proposedCurrency === "AUD",
      ),
      "Currency must preview AUD through the frozen read-only capability",
    );
  if (
    [
      "CAP-072",
      "CAP-074",
      "CAP-075",
      "CAP-076",
      "CAP-077",
      "CAP-078",
      "CAP-079",
      "CAP-080",
      "CAP-083",
      "CAP-084",
    ].includes(cid)
  ) {
    expect(
      !/no Expense fixture|Expense ID and full authorized Expense base are not provided/.test(
        p.summary,
      ),
      "Provided expense-lunch fixture was falsely declared missing",
      "Missing Required Data",
    );
  }
  if (cid === "READ-01") {
    expect(
      p.target.tripSelection === "NEEDS_SELECTION" && p.target.tripId === null,
      "Archived target has not been selected",
      "Incorrect Object Match",
    );
    expect(
      cap("otr.trip.list").some((s: any) =>
        ["ARCHIVED", "ALL"].includes(s.call.query.lifecycle),
      ),
      "Archived discovery missing",
    );
    expect(
      !writes.length,
      "Read-only request must have no write",
      "Unsupported Operation",
    );
  }
  if (cid === "CAP-003")
    expect(
      p.target.tripSelection !== "EXACT" ||
        (write("otr.trip.create").length === 0 &&
          p.questions.some((q: any) => /create|创建|新建/.test(q.text))),
      "Duplicate Trip must be disambiguated",
      "Duplicate Creation",
    );
  if (cid === "TRIP-AMBIGUOUS")
    expect(
      p.target.tripSelection === "NEEDS_SELECTION" &&
        p.target.tripId === null &&
        p.questions.length &&
        !writes.length,
      "Ambiguous Trip was selected or mutated",
      "Incorrect Object Match",
    );
  if (cid === "POS-TRIP-CREATE") {
    expect(
      p.target.tripSelection === "PROPOSE_CREATE" && p.target.tripId === null,
      "New Trip incorrectly uses existing exact Trip",
      "Incorrect Object Match",
    );
    const s = write("otr.trip.create")[0],
      r = s && body(s);
    expect(
      r?.name === "Harbour Return" &&
        r.startDate === "2026-11-25" &&
        r.endDate === "2026-11-29",
      "New Trip facts changed",
    );
    expect(
      r?.destinations?.map((d: any) => d.displayLabel).join("|") ===
        "Auckland|Wellington" && r.destinations.every((d: any) => d.source === "MANUAL"),
      "Structured destinations flattened, reordered or provider invented",
    );
    if (r)
      expect(
        new Set(
          [r.tripId, ...r.destinations.map((d: any) => d.destinationId)].map((x) =>
            JSON.stringify(x),
          ),
        ).size === 3,
        "Distinct Trip/destination identities reused",
        "Invalid Dependency",
      );
  }
  if (cid.startsWith("POS-P") && cid.endsWith("-CREATE")) {
    const family = cid.slice(4, 6).toLowerCase(),
      list = write("otr." + family + ".create");
    expect(
      list.length === 1,
      "Positive family creation missing or duplicated",
      "Missing Required Data",
    );
    for (const s of list) {
      const r = body(s);
      expect(
        r.admission.mode === "MANUAL",
        "Creation invents Import authority",
        "Unsupported Operation",
      );
      expect(
        r.payload.acl.visibility === "PRIVATE" &&
          r.payload.participation.mode === "SELF" &&
          r.payload.participation.selfPersonId === "10000000-0000-4000-8000-000000000003",
        "Privacy or actor Person changed",
      );
      const schedule = r.payload.schedule;
      if (schedule)
        for (const boundary of [schedule.start, schedule.end].filter(Boolean))
          expect(
            boundary.instant === null &&
              boundary.zone_id === null &&
              boundary.local_time === null,
            "Date-only source invented clock/zone/UTC",
            "Hallucinated Fact",
          );
    }
  }
  if (cid === "POS-P3-CREATE") {
    const r = body(write("otr.p3.create")[0] ?? { call: { request: {} } });
    expect(
      r.payload?.rooms?.[0]?.category === "Garden room" &&
        r.payload.rooms[0].quantity === 1 &&
        r.payload.rooms[0].capacity === 2,
      "New Room facts lost",
    );
  }
  if (cid === "POS-P4-CREATE")
    expect(
      write("otr.p4.create").some(
        (s: any) => body(s).payload.details.or_similar === false,
      ),
      "Rental false was lost",
    );
  if (["P2-LEGS", "POS-P2-CREATE"].includes(cid)) {
    expect(
      write("otr.p2.create").length === 1 &&
        body(write("otr.p2.create")[0]).payload.flightNumberLiteral === "NZ605",
      "Existing NZ502 was duplicated or new NZ605 missing",
      "Duplicate Creation",
    );
    expect(
      write("otr.p2.update").some(
        (s: any) =>
          body(s).payload.patch?.origin?.name === "Christchurch" &&
          body(s).payload.patch?.destination?.name === "Queenstown",
      ),
      "Known authored endpoints not mapped",
    );
  }
  for (const [caseId, operation, roomId, key, val] of [
    ["P3-ROOM", "PATCH", "301", "capacity", 5],
    ["P3-CLEAR", "PATCH", "301", "category", null],
    ["P3-REMOVE", "REMOVE", "302", null, null],
  ] as any[]) {
    if (cid === caseId) {
      const changes = write("otr.p3.update").flatMap(
        (s: any) => body(s).payload.roomChanges ?? [],
      );
      expect(
        changes.length === 1 &&
          changes[0].operation === operation &&
          changes[0].room_id.endsWith(roomId) &&
          (key === null || changes[0].changes[key] === val),
        "Room identity/patch/clear/remove intent changed",
      );
    }
  }
  if (cid === "P4-FALSE") {
    expect(
      write("otr.p4.update").some(
        (s: any) => body(s).payload.details?.or_similar === false,
      ),
      "Rental false not planned",
    );
    expect(
      !writes.some((s: any) => body(s)?.payload?.places?.return !== undefined),
      "Unrequested return side overwritten",
    );
  }
  if (cid === "P6-ENTRY")
    expect(
      write("otr.p6.update").some(
        (s: any) =>
          body(s).payload.details?.session_label === "Evening session" &&
          !("entryPlace" in body(s).payload),
      ),
      "Omitted Activity Entry was changed",
    );
  if (cid === "HOTEL-DATES")
    expect(
      write("otr.p3.update").some(
        (s: any) => body(s).payload.schedulePatch?.end?.local_date === "2026-11-21",
      ),
      "Explicit checkout date not mapped",
    );
  if (cid === "P5-ROLES") {
    const changes = write("otr.p5.update").flatMap(
      (s: any) => body(s).payload.patch?.operationalChanges ?? [],
    );
    for (const [role, time] of [
      ["MEETING", "09:00"],
      ["CHECKIN", "09:30"],
      ["BOARDING_CUTOFF", "09:50"],
    ])
      expect(
        changes.some(
          (c: any) =>
            c.operation === "ADD" &&
            c.fact.role === role &&
            c.fact.time.local_time === time,
        ),
        "Operational role/time omitted: " + role,
        "Missing Required Data",
      );
  }
  if (cid === "POS-EXPENSE-DRAFT") {
    const e = write("otr.expense.create")[0]?.call.request.envelope.patchOrIntent.expense;
    expect(
      e?.title === "Harbour dinner" &&
        e.original.minor === 8000 &&
        e.original.currency === "NZD" &&
        e.original.scale === 2,
      "Expense original money/title changed",
    );
    expect(
      e?.occurredAt === "2026-11-18T18:30:00+13:00" &&
        e.businessStatus === "DRAFT" &&
        e.valuation === null,
      "Expense instant/state/valuation invented",
    );
    expect(
      e?.payerMemberId === "10000000-0000-4000-8000-000000000004" &&
        e.splits.length === 2 &&
        e.splits.every(
          (s: any) =>
            s.originalMinor === 4000 &&
            [
              "10000000-0000-4000-8000-000000000004",
              "10000000-0000-4000-8000-000000000006",
            ].includes(s.memberId),
        ),
      "Expense Person/Member mapping or allocation wrong",
    );
  }
  if (cid === "CAP-078") {
    const r = write("otr.expense.payment_record")[0]?.call.request;
    expect(
      !!r,
      "Known posted/fee amounts are sufficient; nullable bank metadata must not be invented as mandatory",
      "Missing Required Data",
    );
    if (r)
      expect(
        r.posted?.minor === 10200 &&
          r.posted.currency === "NZD" &&
          r.fee?.minor === 200 &&
          r.authorization === null,
        "Expense bank cost facts changed",
      );
  }
  if (cid === "MIXED-01") {
    const facts = JSON.stringify(p.facts);
    expect(
      facts.includes("2026-11-20") &&
        facts.includes("Family unit") &&
        facts.includes("Twin room"),
      "Hotel evidence facts omitted",
      "Hallucinated Fact",
    );
    expect(
      !write("otr.expense.create").length &&
        !write("otr.p3.create").length &&
        !writes.some((s: any) => s.call.capabilityId.endsWith(".delete")),
      "Quote/deposit or repeated booking created duplicate/deletion",
      "Duplicate Creation",
    );
    expect(
      !write("otr.p3.update").some(
        (s: any) => body(s).payload.schedulePatch?.end?.local_date === "2026-11-21",
      ),
      "Pending amendment overwrote confirmed checkout",
    );
    const detail = write("otr.p3.update")
      .map((s: any) => body(s).payload.details)
      .filter(Boolean);
    expect(
      detail.some(
        (d: any) =>
          d.permitted_checkin_from === "15:00" &&
          d.permitted_checkin_until === "22:00" &&
          d.permitted_checkout_by === "10:00",
      ),
      "Supported policy clocks omitted",
    );
  }
  if (
    [
      "PERSON-SAME",
      "PERSON-MISSING",
      "PERSON-FOREIGN",
      "CURRENCY-MISSING",
      "OFFSET-MISSING",
    ].includes(cid)
  )
    expect(
      !writes.some((s: any) => s.call.capabilityId.startsWith("otr.expense.")) &&
        p.questions.length,
      "Ambiguous/missing financial facts used in write",
      "Incorrect Object Match",
    );
  if (
    [
      "SETTLEMENT-NEG",
      "PAYMENT-NEG",
      "FINAL",
      "PERMISSION",
      "MOVE",
      "MALICIOUS",
    ].includes(cid)
  )
    expect(
      !writes.length && blocked,
      "Forbidden/unsupported request was not blocked",
      "Unsupported Operation",
    );
  if (cid === "DELETED")
    expect(
      !write("otr.trip.unarchive").length,
      "Deleted Trip was unarchived",
      "Unsupported Operation",
    );
  if (["UNKNOWN", "PARTIAL"].includes(cid)) {
    expect(
      !write("otr.expense.create").length,
      "UNKNOWN retried as new Expense",
      "Duplicate Creation",
    );
    expect(
      cap("otr.ledger.operation.get").some(
        (s: any) =>
          s.call.pathParams.operationId === "10000000-0000-4000-8000-000000000020" &&
          s.call.query.kind === "EXPENSE",
      ),
      "Original Expense operation not queried",
    );
  }
  if (cid === "UNARCHIVE") {
    expect(
      cap("otr.trip.list").some((s: any) =>
        ["ARCHIVED", "ALL"].includes(s.call.query.lifecycle),
      ) && cap("otr.trip.lifecycle.base").length,
      "Unarchive lacks archived discovery/current Base",
    );
    expect(
      write("otr.trip.unarchive").some((s: any) => body(s).action === "UNARCHIVE"),
      "Unarchive action missing",
    );
  }
  if (cid === "CANCEL")
    expect(
      /supplier cancellation confirmation is NOT required/.test(p.summary) ||
        !/must.*supplier|require.*supplier|Verify formal confirmation and exact affected objects/.test(
          p.summary,
        ),
      "Invented supplier-confirmation prerequisite for explicit logical delete",
      "Unsupported Operation",
    );
  return {
    complete: true,
    failures,
    toolSelection: failures.some((f) => f.category === "Wrong Tool") ? "FAIL" : "PASS",
    fieldFidelity: failures.some((f) =>
      ["Wrong Field", "Hallucinated Fact"].includes(f.category),
    )
      ? "FAIL"
      : "PASS",
    matching: failures.some((f) =>
      ["Incorrect Object Match", "Duplicate Creation"].includes(f.category),
    )
      ? "FAIL"
      : "PASS",
    dependencies: "Validated separately by Plan validator",
    confirmation: "Validated separately by Plan validator; all future human actions",
    recovery: "Frozen failure policies + source review; no execution",
    unsupported: failures.some((f) => f.category === "Unsupported Operation")
      ? "FAIL"
      : "PASS",
    scope:
      target && !cap(target).length
        ? "LEGAL_BLOCK_OR_MATCH_NOT_POSITIVE_API_EXECUTION"
        : "PLANNED_CALLS_ONLY",
  };
}
