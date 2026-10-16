import type {
  InterpretationItem,
  InterpretationFragment,
} from "../intelligence/interpretation";
import { canonicalEventJson, type Json } from "./eventIntentJson";
import { assessFlightReadiness } from "./flightReadiness";

type Fragment = Pick<InterpretationFragment, "id" | "locator">;
export type FlightAssemblyDocument = {
  inputId: string;
  text: string;
  originalSha256?: string;
  originalByteCount?: number;
  parsed: { items: InterpretationItem[]; fragments: Fragment[] };
};
const same = (value: unknown) => canonicalEventJson(value as Json);
const unique = (item: InterpretationItem, path: string) => {
  const values = item.fields
    .filter((f) => f.path === path && f.normalized !== null && !f.uncertainty.length)
    .map((f) => f.normalized);
  return values.length && new Set(values.map(same)).size === 1 ? values[0] : null;
};
const has = (item: InterpretationItem, path: string) => unique(item, path) !== null;

// Document structure proposes relationships; Source/closure still owns canonical identity and admission.
export function assembleFlightDocuments(documents: FlightAssemblyDocument[]) {
  if (
    documents.length > 64 ||
    new Set(documents.map((d) => d.inputId)).size !== documents.length
  )
    throw new Error("ASSEMBLY_INPUT_INVALID");
  if (
    documents.reduce((n, d) => n + new TextEncoder().encode(d.text).length, 0) > 4194304
  )
    throw new Error("ASSEMBLY_LIMIT");
  const blocks: {
    id: string;
    inputId: string;
    type: "FLIGHT";
    observation: InterpretationItem;
    start: number;
    end: number;
  }[] = [];
  const references: {
    inputId: string;
    literal: string;
    issuer: string | null;
    start: number;
    end: number;
  }[] = [];
  const texts = new Map(
    documents.map((d) => [d.inputId, new TextEncoder().encode(d.text)]),
  );
  for (const doc of documents) {
    const fragments = new Map(doc.parsed.fragments.map((f) => [f.id, f.locator]));
    const bytes = texts.get(doc.inputId)!;
    if (bytes.length > 262144 || doc.parsed.items.length > 64)
      throw new Error("ASSEMBLY_LIMIT");
    for (const item of doc.parsed.items) {
      if (blocks.length >= 64 || item.fields.length > 64 || item.deferred.length > 64)
        throw new Error("ASSEMBLY_LIMIT");
      const locators = [
        ...item.fields.flatMap((f) => f.fragment_ids),
        ...item.deferred.map((d) => d.fragment_id),
      ].map((id) => {
        const locator = fragments.get(id);
        if (
          !locator ||
          locator.input_id !== doc.inputId ||
          locator.start === null ||
          locator.end === null ||
          locator.start < 0 ||
          locator.end <= locator.start ||
          locator.end > bytes.length
        )
          throw new Error("ASSEMBLY_EVIDENCE_INVALID");
        return locator;
      });
      for (const field of item.fields)
        for (const id of field.fragment_ids) {
          const span = fragments.get(id)!;
          if (
            new TextDecoder("utf-8", { fatal: true }).decode(
              bytes.slice(span.start!, span.end!),
            ) !== field.raw
          )
            throw new Error("ASSEMBLY_EVIDENCE_INVALID");
        }
      if (!locators.length) continue;
      const structuralIds = [
        ...item.fields
          .filter((f) => f.path !== "transport_subtype")
          .flatMap((f) => f.fragment_ids),
        ...item.deferred.map((d) => d.fragment_id),
      ];
      const structuralLocators = structuralIds.length
        ? structuralIds.map((id) => fragments.get(id)!)
        : locators;
      blocks.push({
        id: item.token,
        inputId: doc.inputId,
        type: "FLIGHT",
        observation: structuredClone(item),
        start: Math.min(...structuralLocators.map((l) => l.start!)),
        end: Math.max(...locators.map((l) => l.end!)),
      });
    }
    // References are document evidence, never occurrence keys or a persisted Booking ID.
    for (const match of doc.text.matchAll(
      /\b(?:Booking reference\s*[:=]?\s*|pnr\s*[:=]\s*|reference[ \t]+)([A-Z0-9]{5,8})\b/gi,
    )) {
      const start = new TextEncoder().encode(doc.text.slice(0, match.index!)).length;
      references.push({
        inputId: doc.inputId,
        literal: match[1],
        issuer: /\bAir New Zealand\b/.test(doc.text) ? "Air New Zealand" : null,
        start,
        end: start + new TextEncoder().encode(match[0]).length,
      });
    }
  }
  const segments = blocks.map((block) => ({
    id: `segment:${block.id}`,
    inputIds: [block.inputId],
    observationTokens: [block.id],
    fields: block.observation.fields,
    deferred: block.observation.deferred,
    associationPending: false,
    absorbed: false,
    reasons: [] as string[],
  }));
  const links: { from: string; to: string; reason: string; requiresReview: boolean }[] =
    [];
  for (const [index, block] of blocks.entries()) {
    const item = block.observation;
    if (
      !has(item, "service") ||
      !has(item, "origin.local_date") ||
      has(item, "origin.airport") ||
      has(item, "origin.place_label")
    )
      continue;
    const text = texts.get(block.inputId)!;
    const before = new TextDecoder().decode(
      text.slice(Math.max(0, block.start - 50), block.start),
    );
    if (!/booked to fly\s*$/.test(before)) continue;
    const candidates = blocks
      .map((other, at) => ({ other, at }))
      .filter(
        ({ other, at }) =>
          at !== index &&
          other.inputId === block.inputId &&
          other.start > block.end &&
          has(other.observation, "origin.place_label") &&
          same(unique(other.observation, "origin.local_date")) ===
            same(unique(item, "origin.local_date")),
      );
    // A unique printed date within the explicit Flight section supports a proposed join, not an admitted identity.
    if (candidates.length !== 1) continue;
    const target = candidates[0];
    const between = new TextDecoder().decode(text.slice(block.end, target.other.start));
    if (
      !/\b(?:Your flights|Flight details)\b/.test(between) ||
      /\b(?:Booking reference|Your trains|Your hotels)\b/.test(between)
    )
      continue;
    const foreignRef = references.some(
      (r) =>
        r.inputId === block.inputId &&
        r.start > block.end &&
        r.start < target.other.start &&
        !references.some(
          (own) =>
            own.inputId === block.inputId &&
            own.start >= block.start &&
            own.end <= block.end &&
            own.literal === r.literal,
        ),
    );
    if (foreignRef) continue;
    if (
      has(target.other.observation, "service") &&
      same(unique(target.other.observation, "service")) !== same(unique(item, "service"))
    )
      continue;
    const segment = segments[target.at];
    segment.fields = [...segment.fields, ...item.fields];
    segment.deferred = [...segment.deferred, ...item.deferred];
    segment.observationTokens.push(block.id);
    segment.associationPending = true;
    segment.reasons.push("BOOKED_DATE_UNIQUE_IN_FLIGHT_SECTION");
    segments[index].absorbed = true;
    links.push({
      from: block.id,
      to: target.other.id,
      reason: "BOOKED_DATE_UNIQUE_IN_FLIGHT_SECTION",
      requiresReview: true,
    });
  }
  const live = segments.filter((s) => !s.absorbed);
  // Collapse only exact repeated document observations, not same-date route similarity.
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      if (live[j].absorbed) continue;
      const a = live[i],
        b = live[j];
      const key = (s: typeof a) =>
        same(
          [
            ...new Map(
              s.fields.map((f) => [same([f.path, f.normalized]), [f.path, f.normalized]]),
            ).values(),
          ].sort((x, y) => same(x).localeCompare(same(y))),
        );
      const docA = documents.find((d) => d.inputId === a.inputIds[0])!,
        docB = documents.find((d) => d.inputId === b.inputIds[0])!;
      if (
        docA.inputId === docB.inputId ||
        !docA.originalSha256 ||
        !/^[0-9a-f]{64}$/.test(docA.originalSha256) ||
        docA.originalSha256 !== docB.originalSha256 ||
        !docA.originalByteCount ||
        docA.originalByteCount !== docB.originalByteCount ||
        docA.text !== docB.text ||
        key(a) !== key(b)
      )
        continue;
      a.fields.push(...b.fields);
      a.deferred.push(...b.deferred);
      a.observationTokens.push(...b.observationTokens);
      a.inputIds = [...new Set([...a.inputIds, ...b.inputIds])];
      b.absorbed = true;
      links.push({
        from: b.id,
        to: a.id,
        reason: "EXACT_REPEATED_PINNED_INPUT_OBSERVATIONS",
        requiresReview: true,
      });
      a.associationPending = true;
    }
  const output = live
    .filter((s) => !s.absorbed)
    .map(({ absorbed, ...s }) => ({
      ...s,
      readiness: assessFlightReadiness({
        fields: s.fields,
        associationPending: s.associationPending,
      }),
    }));
  const bookings: {
    id: string;
    reference: string;
    issuer: string | null;
    evidence: typeof references;
    segmentIds: string[];
    relationship: "PROPOSED_DOCUMENT_RELATIONSHIP";
    canonicalId: null;
  }[] = [];
  for (const ref of references) {
    // Without an issuer, a matching literal across Inputs does not establish a shared booking namespace.
    let group = bookings.find(
      (g) =>
        g.reference === ref.literal &&
        g.issuer === ref.issuer &&
        (ref.issuer !== null || g.evidence.some((e) => e.inputId === ref.inputId)),
    );
    if (!group) {
      group = {
        id: `booking-group:${bookings.length}`,
        reference: ref.literal,
        issuer: ref.issuer,
        evidence: [],
        segmentIds: [],
        relationship: "PROPOSED_DOCUMENT_RELATIONSHIP",
        canonicalId: null,
      };
      bookings.push(group);
    }
    group.evidence.push(ref);
    const docRefs = references
      .filter((r) => r.inputId === ref.inputId)
      .sort((a, b) => a.start - b.start);
    const first = docRefs.find((r) => r.literal === ref.literal)!;
    const next =
      docRefs.find((r) => r.start > first.start && r.literal !== ref.literal)?.start ??
      Infinity;
    for (const segment of output) {
      const own = blocks.filter(
        (b) => b.inputId === ref.inputId && segment.observationTokens.includes(b.id),
      );
      const inside = docRefs.filter((r) =>
        own.some((b) => b.start <= r.start && b.end >= r.end),
      );
      if (
        inside.length
          ? inside.every((r) => r.literal === ref.literal)
          : own.some((b) => b.start >= first.start && b.start < next)
      )
        group.segmentIds.push(segment.id);
    }
    group.segmentIds = [...new Set(group.segmentIds)];
  }
  if (output.length > 64 || bookings.length > 64) throw new Error("ASSEMBLY_LIMIT");
  return {
    version: 1 as const,
    authority: "ASSEMBLY_ADVISORY_ONLY" as const,
    grantsAdmission: false as const,
    contentBlocks: blocks,
    segments: output,
    bookingGroups: bookings,
    links,
    emptyDecision: output.length ? null : assessFlightReadiness({ fields: [] }),
    candidateStatus: "NOT_PUBLISHED" as const,
    admissionStatus: "NOT_RUN" as const,
  };
}
