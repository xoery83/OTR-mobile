import { z } from "zod";
const uuid = z.uuid().refine((v) => v === v.toLowerCase());
export const ordinaryRole = z.enum(["START", "END", "ENTRY", "ORIGIN", "DESTINATION"]);
export const ordinaryNodeSchema = z.strictObject({
  eventId: uuid,
  entry: ordinaryRole.nullable(),
  exit: ordinaryRole.nullable(),
});
export const ordinaryGapSchema = z.strictObject({
  from: uuid,
  to: uuid,
  coverage: z.enum(["NONE_PROVEN", "EXPLICIT_TRANSPORT", "UNKNOWN"]),
  transportId: uuid.nullable(),
  complete: z.boolean(),
});
export const ordinaryOrderPayload = z
  .strictObject({
    personId: uuid,
    branchId: uuid,
    nodes: z.array(ordinaryNodeSchema).min(2).max(30),
    gaps: z.array(ordinaryGapSchema).max(29),
  })
  .superRefine((p, c) => {
    const ids = p.nodes.map((n) => n.eventId);
    if (new Set(ids).size !== ids.length || p.gaps.length !== ids.length - 1)
      c.addIssue({ code: "custom", message: "INVALID_ORDINARY_ORDER" });
    const legs = p.gaps.flatMap((g) => (g.transportId ? [g.transportId] : []));
    if (new Set(legs).size !== legs.length)
      c.addIssue({ code: "custom", message: "DUPLICATE_TRANSPORT_COVERAGE" });
    p.gaps.forEach((g, i) => {
      if (
        g.from !== ids[i] ||
        g.to !== ids[i + 1] ||
        (g.coverage === "EXPLICIT_TRANSPORT") !== (g.transportId !== null) ||
        (g.coverage !== "UNKNOWN" && !g.complete)
      )
        c.addIssue({ code: "custom", message: "INVALID_ORDINARY_GAP" });
    });
  });
export type OrdinaryNode = z.infer<typeof ordinaryNodeSchema>;
export type OrdinaryGap = z.infer<typeof ordinaryGapSchema>;
export const coreVisitToken = (eventId: string) => "core-visit/1:" + uuid.parse(eventId);
