import { z } from "zod";

export const UNIVERSAL_ADVISORY_VERSION = "otr-universal-advisory/1" as const;
const span = z.strictObject({
  sourceIndex: z.number().int().min(0).max(63),
  raw: z.string().min(1).max(1000),
  start: z.number().int().min(0),
  end: z.number().int().positive(),
});
const classes = z.enum([
  "TICKET",
  "BOOKING_CONFIRMATION",
  "INVOICE",
  "ITINERARY",
  "AMENDMENT_NOTICE",
  "UNKNOWN",
]);
const advisorySchema = z.strictObject({
  classifications: z
    .array(z.strictObject({ evidence: span, labels: z.array(classes).min(1).max(6) }))
    .max(64)
    .default([]),
  supportingEvidence: z
    .array(
      z.strictObject({
        kind: z.enum(["ITEM", "BOOKING", "TICKET"]),
        token: z.string().min(1).max(40),
        path: z.string().min(1).max(80),
        evidence: span,
      }),
    )
    .max(128)
    .default([]),
  optionalFields: z
    .array(
      z.strictObject({
        kind: z.enum(["P2", "P3", "P4", "P5", "P6"]),
        token: z.string().min(1).max(40),
        path: z.string().min(1).max(80),
        label: span,
        evidence: span,
      }),
    )
    .max(128)
    .default([]),
});
export const envelopeSchema = z.strictObject({
  version: z.literal(UNIVERSAL_ADVISORY_VERSION),
  interpretation: z.unknown(),
  advisory: z.unknown().optional(),
});
const optionalPaths: Record<string, ReadonlySet<string>> = {
  P2: new Set(["origin.zone", "destination.zone", "passenger.name"]),
  P3: new Set([
    "stay.contact",
    "stay.check_in_instruction",
    "stay.check_out_instruction",
    "stay.notes",
  ]),
  P4: new Set([
    "rental.actual_make",
    "rental.actual_model",
    "rental.plate",
    "rental.contact",
    "rental.pickup_instruction",
    "rental.return_instruction",
    "rental.notes",
  ]),
  P5: new Set([
    "transport.type",
    "origin.zone",
    "destination.zone",
    "transport.pier",
    "transport.berth",
    "transport.carriage",
    "transport.boarding_date",
    "transport.boarding_time",
    "transport.boarding_place",
    "transport.meeting_date",
    "transport.meeting_time",
    "transport.meeting_place",
    "transport.check_in_time",
    "transport.check_in_place",
    "transport.boarding_instruction",
    "transport.meeting_instruction",
    "transport.notes",
  ]),
  P6: new Set([
    "activity.end_date",
    "activity.end_time",
    "activity.entry_date",
    "activity.entry_time",
    "activity.entry_place",
    "activity.meeting_date",
    "activity.meeting_time",
    "activity.meeting_place",
    "activity.instructions",
    "activity.contact",
    "activity.seat",
    "activity.section",
    "activity.gate",
    "activity.notes",
  ]),
};
const fieldRoles: Record<string, readonly string[]> = {
  "origin.zone": [
    "origin zone",
    "origin timezone",
    "departure zone",
    "departure timezone",
  ],
  "destination.zone": [
    "destination zone",
    "destination timezone",
    "arrival zone",
    "arrival timezone",
  ],
  "passenger.name": ["passenger name", "traveler name", "traveller name"],
  "stay.contact": ["contact", "stay contact", "hotel contact"],
  "stay.check_in_instruction": ["check in instruction", "check in instructions"],
  "stay.check_out_instruction": ["check out instruction", "check out instructions"],
  "stay.notes": ["stay notes", "hotel notes", "notes"],
  "rental.actual_make": ["actual make", "vehicle make", "car make"],
  "rental.actual_model": ["actual model", "vehicle model", "car model"],
  "rental.plate": ["plate", "license plate", "registration plate"],
  "rental.contact": ["rental contact", "car rental contact", "contact"],
  "rental.pickup_instruction": ["pickup instruction", "pickup instructions"],
  "rental.return_instruction": ["return instruction", "return instructions"],
  "rental.notes": ["rental notes", "notes"],
  "transport.type": ["transport type", "transport mode", "transfer type"],
  "transport.pier": ["pier", "departure pier", "arrival pier"],
  "transport.berth": ["berth", "departure berth", "arrival berth"],
  "transport.carriage": ["carriage", "coach carriage"],
  "transport.boarding_date": ["boarding date"],
  "transport.boarding_time": ["boarding time"],
  "transport.boarding_place": ["boarding place", "boarding location"],
  "transport.meeting_date": ["meeting date"],
  "transport.meeting_time": ["meeting time"],
  "transport.meeting_place": ["meeting place", "meeting location"],
  "transport.check_in_time": ["check in time"],
  "transport.check_in_place": ["check in place", "check in location"],
  "transport.boarding_instruction": ["boarding instruction", "boarding instructions"],
  "transport.meeting_instruction": ["meeting instruction", "meeting instructions"],
  "transport.notes": ["transport notes", "transfer notes", "notes"],
  "activity.end_date": ["end date", "activity end date"],
  "activity.end_time": ["end time", "activity end time"],
  "activity.entry_date": ["entry date"],
  "activity.entry_time": ["entry time"],
  "activity.entry_place": ["entry place", "entry location"],
  "activity.meeting_date": ["meeting date"],
  "activity.meeting_time": ["meeting time"],
  "activity.meeting_place": ["meeting place", "meeting location"],
  "activity.instructions": ["instructions", "activity instructions"],
  "activity.contact": ["contact", "activity contact"],
  "activity.seat": ["seat", "seat number"],
  "activity.section": ["section", "section number"],
  "activity.gate": ["gate", "entry gate"],
  "activity.notes": ["activity notes", "notes"],
};
const normalizeRole = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[:：]$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
export type AdvisorySource = {
  alias: string;
  inputId: string;
  sourceId: string;
  representationId: string;
  revision: number;
  originalSha256: string;
  submittedSha256: string | null;
  bytes: Buffer;
  modality: string;
};
type Qualified = {
  objects: {
    token: string;
    kind: string;
    fields: { sourceId: string; path: string; raw: string }[];
  }[];
  bookings: {
    token: string;
    supplier: { sourceId: string; path: string; raw: string };
    reference: { sourceId: string; path: string; raw: string };
    fields: { sourceId: string; path: string; raw: string }[];
  }[];
  tickets: { token: string; label: { sourceId: string; path: string; raw: string } }[];
};

// Separate evidence-bearing observations. These never modify frozen compact validation or grant relation/rights.
export function validateUniversalAdvisory(
  raw: unknown,
  sources: AdvisorySource[],
  qualified: Qualified | null,
) {
  if (raw === undefined)
    return {
      status: "ABSENT" as const,
      observations: [],
      issues: ["ADVISORY_NOT_PROVIDED"],
    };
  const parsed = advisorySchema.safeParse(raw);
  if (!parsed.success)
    return {
      status: "INVALID" as const,
      observations: [],
      issues: ["ADVISORY_SCHEMA_INVALID"],
    };
  const issues: string[] = [],
    observations: unknown[] = [];
  const locate = (e: z.infer<typeof span>) => {
    const source = sources[e.sourceIndex];
    if (
      !source ||
      source.modality !== "TEXT" ||
      !source.submittedSha256 ||
      e.end !== e.start + Buffer.byteLength(e.raw) ||
      e.end > source.bytes.length ||
      !source.bytes.subarray(e.start, e.end).equals(Buffer.from(e.raw, "utf8"))
    )
      return null;
    return {
      alias: source.alias,
      inputId: source.inputId,
      sourceId: source.sourceId,
      representationId: source.representationId,
      revision: source.revision,
      originalSha256: source.originalSha256,
      submittedSha256: source.submittedSha256,
      raw: e.raw,
      start: e.start,
      end: e.end,
    };
  };
  for (const entry of parsed.data.classifications) {
    const labels = [...new Set(entry.labels)];
    const evidence = locate(entry.evidence);
    if (
      !evidence ||
      labels.length !== entry.labels.length ||
      (labels.includes("UNKNOWN") && labels.length > 1)
    ) {
      issues.push("CLASSIFICATION_EVIDENCE_INVALID");
      continue;
    }
    observations.push({
      type: "DOCUMENT_CLASSIFICATION",
      labels,
      evidence,
      authority: "ADVISORY_ONLY",
    });
  }
  for (const entry of parsed.data.supportingEvidence) {
    const evidence = locate(entry.evidence);
    const match =
      entry.kind === "ITEM"
        ? qualified?.objects
            .find((o) => o.token === entry.token)
            ?.fields.find((f) => f.path === entry.path)
        : entry.kind === "BOOKING"
          ? (() => {
              const b = qualified?.bookings.find((b) => b.token === entry.token);
              return [b?.supplier, b?.reference, ...(b?.fields ?? [])].find(
                (f) => f?.path === entry.path,
              );
            })()
          : (() => {
              const label = qualified?.tickets.find(
                (t) => t.token === entry.token,
              )?.label;
              return label?.path === entry.path ? label : undefined;
            })();
    if (
      !evidence ||
      !match ||
      match.raw !== entry.evidence.raw ||
      match.sourceId === evidence.alias
    ) {
      issues.push("SUPPORT_EVIDENCE_UNQUALIFIED");
      continue;
    }
    observations.push({
      type: "SAME_FIELD_SUPPORT",
      kind: entry.kind,
      token: entry.token,
      path: entry.path,
      evidence,
      authority: "ADVISORY_ONLY",
    });
  }
  for (const entry of parsed.data.optionalFields) {
    const evidence = locate(entry.evidence);
    const label = locate(entry.label);
    const object = qualified?.objects.find(
      (o) => o.token === entry.token && o.kind === entry.kind,
    );
    const source = sources[entry.evidence.sourceIndex];
    const role = normalizeRole(entry.label.raw);
    const exactRole = fieldRoles[entry.path]?.includes(role) ?? false;
    const separator =
      source && label && evidence
        ? source.bytes.subarray(entry.label.end, entry.evidence.start).toString("utf8")
        : "";
    const beforeLabel = source?.bytes.subarray(0, entry.label.start);
    const boundary = beforeLabel
      ? Math.max(beforeLabel.lastIndexOf(10), beforeLabel.lastIndexOf(59))
      : -1;
    const fieldPrefix = beforeLabel?.subarray(boundary + 1).toString("utf8") ?? "";
    if (
      !evidence ||
      !label ||
      !object ||
      !optionalPaths[entry.kind].has(entry.path) ||
      entry.label.sourceIndex !== entry.evidence.sourceIndex ||
      entry.label.end > entry.evidence.start ||
      !/^[ \t\r]*$/.test(fieldPrefix) ||
      !/^[ \t]*[:：=]?[ \t]*$/.test(separator) ||
      !exactRole
    ) {
      issues.push("OPTIONAL_FIELD_UNQUALIFIED");
      continue;
    }
    observations.push({
      type: "OPTIONAL_SOURCE_FIELD",
      kind: entry.kind,
      token: entry.token,
      path: entry.path,
      label,
      evidence,
      authority: "SOURCE_OBSERVATION_ONLY",
    });
  }
  return {
    status: issues.length ? ("PARTIAL" as const) : ("VALID" as const),
    observations,
    issues,
  };
}

export function advisorySources(
  bindings: {
    alias: string;
    inputId: string;
    sourceId: string;
    representationId: string;
    revision: number;
    originalSha256: string;
    submittedSha256: string | null;
  }[],
  ready: { sourceId: string; submittedSha256: string; bytes: Buffer; modality: string }[],
): AdvisorySource[] {
  return ready.map((p) => {
    const b = bindings.find(
      (b) => b.alias === p.sourceId && b.submittedSha256 === p.submittedSha256,
    );
    if (!b) throw new Error("ADVISORY_SOURCE_BINDING_INVALID");
    return { ...b, bytes: p.bytes, modality: p.modality };
  });
}
