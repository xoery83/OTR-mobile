const caps = await reader.capabilities(actor, trip);
assert.deepEqual(caps.enabledFamilies, ["P1", "P3", "P4", "P6"]);
assert(!caps.enabledFamilies.includes("P5"));
assert(caps.enabledCommands.includes("SET_ACTIVITY_DETAILS"));
assert(!caps.enabledCommands.includes("SET_TRANSPORT_DETAILS"));
const place = (label: string) =>
  corePlaceSchema.parse(
    Object.fromEntries(
      Object.keys(corePlaceSchema.shape).map((k) => [
        k,
        k === "authored_label" ? label : null,
      ]),
    ),
  );
await execute(
  "CREATE_ITEM",
  {
    family: "P6",
    core: { title: "PG P6 original" },
    schedule: { start: coreDateBoundary("2026-11-02") },
    details: { session_label: null, admission_note: null },
    ...coreDefaults("organizer"),
  },
  null,
);
await execute(
  "SET_ITEM_TEXT",
  { title: "PG P6 edited", description: "Synthetic activity note" },
  1,
);
await execute(
  "SET_ITEM_SCHEDULE",
  {
    schedule: {
      start: {
        ...coreDateBoundary("2026-11-03"),
        local_time: "09:10",
        clock_precision: -1,
        quality: "ESTIMATED",
      },
      end: coreDateBoundary("2026-11-04"),
    },
  },
  2,
);
await execute("SET_ITEM_PLACE", { place: place("Synthetic Park") }, 3);
await execute(
  "SET_ACTIVITY_DETAILS",
  {
    details: {
      session_label: "Morning session",
      admission_note: "Synthetic entry instructions",
    },
    entryPlace: place("Gate A"),
  },
  4,
);
await execute(
  "SET_ITEM_PARTICIPATION",
  { participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null } },
  5,
);
let collection = await reader.collection(actor, trip);
let verified = await validateCoreReadCollection(
  collection.manifest,
  collection.pages,
  actor,
  trip,
  hash,
);
let row = verified.graph.itinerary_events.find((r) => r.id === item)!;
assert.equal(row.title, "PG P6 edited");
assert.equal(row.semantic_revision, 6);
assert.equal(row.start_local_time, "09:10:00");
assert.equal(row.authored_label, "Synthetic Park");
assert.equal(
  verified.graph.trip_activity_details.find((r) => r.event_id === item)?.session_label,
  "Morning session",
);
assert.equal(
  verified.graph.trip_activity_entry_places.find((r) => r.event_id === item)
    ?.authored_label,
  "Gate A",
);
await execute(
  "SET_ACTIVITY_DETAILS",
  {
    details: { session_label: "Morning session", admission_note: "Latest entry note" },
    entryPlace: null,
  },
  6,
);
collection = await reader.collection(actor, trip);
verified = await validateCoreReadCollection(
  collection.manifest,
  collection.pages,
  actor,
  trip,
  hash,
);
assert.equal(
  verified.graph.itinerary_events.find((r) => r.id === item)?.semantic_revision,
  7,
);
assert.equal(
  verified.graph.trip_activity_details.find((r) => r.event_id === item)?.admission_note,
  "Latest entry note",
);
assert.equal(
  verified.graph.trip_activity_entry_places.find((r) => r.event_id === item)
    ?.authored_label,
  null,
);
checks.push(
  "same P6 ID latest clocks/place/details/participation and explicit cleared ENTRY survive full validated Reader",
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
      family: "P6",
      core: { title: "Other P6" },
      schedule: { start: coreDateBoundary("2026-11-02") },
      details: { session_label: null, admission_note: null },
      entryPlace: place("Gate B"),
      ...coreDefaults("organizer"),
    },
  },
  hash,
);
assert.equal(other.projection, "FULL");
for (const attack of [
  "detailsReparent",
  "entryReparent",
  "entryRole",
  "wrongChildCommand",
  "entryDelete",
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
          attack === "wrongChildCommand" ? "SET_ITEM_TEXT" : "SET_ACTIVITY_DETAILS",
        ],
      );
      if (attack !== "missingFamily")
        await lease.query("SELECT set_config('otr.core.family','P6',true)");
      if (attack !== "missingAdmission")
        await lease.query("SELECT set_config('otr.core.admission','MANUAL',true)");
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
      if (attack === "detailsReparent")
        await lease.query(
          "UPDATE public.trip_activity_details SET event_id=$1::uuid WHERE event_id=$2::uuid",
          [otherItem, item],
        );
      else if (attack === "entryReparent")
        await lease.query(
          "UPDATE public.trip_activity_entry_places SET event_id=$1::uuid WHERE event_id=$2::uuid",
          [otherItem, item],
        );
      else if (attack === "entryRole")
        await lease.query(
          "UPDATE public.trip_activity_entry_places SET role='EXIT' WHERE event_id=$1::uuid",
          [item],
        );
      else if (attack === "entryDelete")
        await lease.query(
          "DELETE FROM public.trip_activity_entry_places WHERE event_id=$1::uuid",
          [item],
        );
      else if (attack === "wrongChildCommand")
        await lease.query(
          "UPDATE public.trip_activity_details SET session_label='raw forbidden' WHERE event_id=$1::uuid",
          [item],
        );
      else
        await lease.query(
          "UPDATE public.trip_core_read_state SET revision=revision+1 WHERE trip_id=$1::uuid",
          [trip],
        );
    }),
    /CORE_V2_CAPABILITY_CLOSED/,
  );
}
checks.push(
  "raw P6 writer rejects child reparent/ENTRY identity/DELETE/wrong command and missing context; P5 remains closed",
);
assert.equal((await reader.capabilities(randomUUID(), trip)).activationState, "CLOSED");
console.log(
  JSON.stringify({
    status: "ISOLATED_PG_P6_PASS_NOT_DEV_OR_NATIVE",
    itemId: item,
    checks,
  }),
);
