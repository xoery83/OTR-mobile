const caps = await reader.capabilities(actor, trip);
assert.deepEqual(caps.enabledFamilies, ["P1", "P3", "P4", "P5"]);
assert(caps.enabledCommands.includes("SET_TRANSPORT_DETAILS"));
const place = (label: string) =>
  corePlaceSchema.parse(
    Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((k) => [
        k,
        k === "authored_label" ? label : null,
      ]),
    ),
  );
const time = (date: string, clock: string) => ({
  ...coreDateBoundary(date),
  local_time: clock,
  clock_precision: -1,
  quality: "ESTIMATED",
});
const service = {
  service_key: "a".repeat(32),
  transport_subtype: "TRAIN",
  attribution: "UNSPECIFIED",
  operator_namespace: "NAME",
  operator_issuer: "",
  operator_value: "",
  operator_literal: "",
  service_number: "",
  service_literal: "",
  codeshare_operating_key: null,
};
const endpoints = {
  origin: { time: time("2026-11-02", "09:00"), place: place("QA Station A") },
  destination: { time: time("2026-11-03", "10:00"), place: place("QA Station B") },
};
const rejectedItem = randomUUID();
await assert.rejects(
  executeCoreCommandV2(
    storage,
    actor,
    trip,
    {
      ...base,
      operationId: randomUUID(),
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: rejectedItem },
      baseVector: [{ kind: "ITEM", id: rejectedItem, revision: null }],
      payload: {
        family: "P5",
        core: { title: "Unknown operator form case" },
        endpoints,
        service,
        ...coreDefaults("organizer"),
      },
    },
    hash,
  ),
  /operator_issuer_check/,
);
checks.push(
  "current formal SQL rejects unknown operator/service fields from existing manual form; owning gap retained",
);
Object.assign(service, {
  operator_issuer: "NAME",
  operator_value: "Synthetic QA Operator",
  operator_literal: "Synthetic QA Operator",
  service_number: "QA01",
  service_literal: "Synthetic QA Service",
});
for (const field of [
  "operator_issuer",
  "operator_value",
  "operator_literal",
  "service_number",
  "service_literal",
]) {
  const absentItem = randomUUID();
  await assert.rejects(
    executeCoreCommandV2(
      storage,
      actor,
      trip,
      {
        ...base,
        operationId: randomUUID(),
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: absentItem },
        baseVector: [{ kind: "ITEM", id: absentItem, revision: null }],
        payload: {
          family: "P5",
          core: { title: "Unknown service field negative" },
          endpoints,
          service: { ...service, [field]: "" },
          ...coreDefaults("organizer"),
        },
      },
      hash,
    ),
    new RegExp(field + "_check"),
  );
}
checks.push(
  "each of five unknown operator/service fields is independently rejected by inherited SQL constraints",
);
await execute(
  "CREATE_ITEM",
  {
    family: "P5",
    core: { title: "PG P5 original" },
    endpoints,
    service,
    ...coreDefaults("organizer"),
  },
  null,
);
await execute("SET_ITEM_TEXT", { title: "PG P5 edited", description: "Manual P5 QA" }, 1);
await execute(
  "SET_TRANSPORT_DETAILS",
  {
    endpoints: {
      ...endpoints,
      origin: { time: time("2026-11-02", "11:00"), place: place("QA Station C") },
    },
    service: { ...service, transport_subtype: "BUS" },
  },
  2,
);
await execute(
  "SET_ITEM_PARTICIPATION",
  { participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null } },
  3,
);
const collection = await reader.collection(actor, trip);
const verified = await validateCoreReadCollection(
  collection.manifest,
  collection.pages,
  actor,
  trip,
  hash,
);
const row = verified.graph.itinerary_events.find((r) => r.id === item)!;
assert.equal(row.title, "PG P5 edited");
assert.equal(row.semantic_revision, 4);
const origin = verified.graph.itinerary_transport_endpoints.find(
  (r) => r.event_id === item && r.role === "ORIGIN",
)!;
const destination = verified.graph.itinerary_transport_endpoints.find(
  (r) => r.event_id === item && r.role === "DESTINATION",
)!;
assert.equal(origin.authored_label, "QA Station C");
assert.equal(origin.local_time, "11:00:00");
assert.equal(destination.authored_label, "QA Station B");
assert.equal(destination.local_time, "10:00:00");
assert.equal(
  verified.graph.itinerary_transport_services.find((r) => r.event_id === item)
    ?.transport_subtype,
  "BUS",
);
checks.push(
  "validated P5 Reader preserves same ID, latest revision, independent endpoints and supported subtype edit",
);
const otherItem = randomUUID();
const other = await executeCoreCommandV2(
  storage,
  actor,
  trip,
  {
    ...base,
    operationId: randomUUID(),
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: otherItem },
    baseVector: [{ kind: "ITEM", id: otherItem, revision: null }],
    payload: {
      family: "P5",
      core: { title: "Other P5" },
      endpoints,
      service: { ...service, service_key: "b".repeat(32) },
      ...coreDefaults("organizer"),
    },
  },
  hash,
);
assert.equal(other.projection, "FULL");
for (const attack of [
  "endpointReparent",
  "endpointRole",
  "serviceReparent",
  "serviceKey",
  "rootSchedule",
  "missingFamily",
  "missingAdmission",
]) {
  await assert.rejects(
    connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query(
        "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true),set_config('otr.core.operation',$3,true),set_config('otr.core.target_item',$4,true),set_config('otr.core.command',$5,true)",
        [
          actor,
          trip,
          randomUUID(),
          attack.endsWith("Reparent") ? otherItem : item,
          attack === "rootSchedule" ? "SET_ITEM_SCHEDULE" : "SET_TRANSPORT_DETAILS",
        ],
      );
      if (attack !== "missingFamily")
        await lease.query("SELECT set_config('otr.core.family','P5',true)");
      if (attack !== "missingAdmission")
        await lease.query("SELECT set_config('otr.core.admission','MANUAL',true)");
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
      if (attack === "endpointReparent")
        await lease.query(
          "UPDATE public.itinerary_transport_endpoints SET event_id=$1::uuid WHERE event_id=$2::uuid AND role='ORIGIN'",
          [otherItem, item],
        );
      else if (attack === "endpointRole")
        await lease.query(
          "UPDATE public.itinerary_transport_endpoints SET role='DESTINATION' WHERE event_id=$1::uuid AND role='ORIGIN'",
          [item],
        );
      else if (attack === "serviceReparent")
        await lease.query(
          "UPDATE public.itinerary_transport_services SET event_id=$1::uuid WHERE event_id=$2::uuid",
          [otherItem, item],
        );
      else if (attack === "serviceKey")
        await lease.query(
          "UPDATE public.itinerary_transport_services SET service_key=$1 WHERE event_id=$2::uuid",
          ["c".repeat(32), item],
        );
      else
        await lease.query(
          "UPDATE public.itinerary_events SET title='raw forbidden' WHERE id=$1::uuid",
          [item],
        );
    }),
    /CORE_V2_CAPABILITY_CLOSED/,
  );
}
checks.push(
  "raw writer rejects endpoint/service reparenting and role/service-key mutation, P5 root schedule and missing family/admission",
);
const wrong = await reader.capabilities(randomUUID(), trip);
assert.equal(wrong.activationState, "CLOSED");
console.log(
  JSON.stringify({
    status: "ISOLATED_PG_P5_PASS_NOT_DEV_OR_NATIVE",
    itemId: item,
    checks,
  }),
);
