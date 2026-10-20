import { describe, expect, it } from "vitest";
import { importRelationshipVectors } from "./__fixtures__/importRelationships";

describe("synthetic L1–L3 relationship contract vectors (not extraction/admission)", () => {
  it.each(importRelationshipVectors)(
    "$name retains scoped evidence and proposal-local identity",
    (v) => {
      const tokens = new Set(v.nodes.map((n) => n.token));
      expect(tokens.size).toBe(v.nodes.length);
      for (const node of v.nodes) {
        expect(node).not.toHaveProperty("id");
        for (const input of node.evidence) expect(v.inputs).toContain(input);
      }
      for (const edge of v.edges) {
        expect(tokens.has(edge.from) && tokens.has(edge.to)).toBe(true);
        expect(edge.evidence.length).toBeGreaterThan(0);
        for (const input of edge.evidence) expect(v.inputs).toContain(input);
      }
      for (const match of v.unresolved) {
        expect(match.left).not.toBe(match.right);
        expect(tokens.has(match.left) && tokens.has(match.right)).toBe(true);
      }
      expect(structuredClone(v)).toEqual(v);
    },
  );
  it("links a supplemental DOC booking to the same Stay without creating another Stay", () => {
    const v = importRelationshipVectors[1];
    expect(v.nodes.filter((n) => n.kind === "STAY")).toHaveLength(3);
    const links = v.edges.filter((e) => e.to === "stay-two");
    expect(new Set(links.map((e) => e.from)).size).toBe(2);
    expect(v.nodes.find((n) => n.token === "stay-two")!.evidence).toEqual([
      "hut-order",
      "supplement",
    ]);
  });
  it("does not merge rentals or orders by equal pickup/reference, or infer payment", () => {
    const v = importRelationshipVectors[2];
    const rentals = v.nodes.filter((n) => n.kind === "RENTAL");
    expect(rentals[0].facts.pickup).toBe(rentals[1].facts.pickup);
    expect(rentals[0].facts.return).not.toBe(rentals[1].facts.return);
    expect(v.unresolved[0].reason).toBe("REFERENCE_ALONE_NOT_IDENTITY");
    expect(
      v.nodes.filter((n) => n.kind === "BOOKING").every((n) => n.facts.paid === null),
    ).toBe(true);
  });
  it("keeps one rail ticket across both segments without split totals or transfer-risk facts", () => {
    const v = importRelationshipVectors[3];
    expect(v.nodes.filter((n) => n.kind === "TICKET")).toHaveLength(1);
    expect(new Set(v.edges.map((e) => e.from)).size).toBe(1);
    expect(new Set(v.edges.map((e) => e.to)).size).toBe(2);
    for (const n of v.nodes.filter((n) => n.kind === "SEGMENT")) {
      expect(n.facts).not.toHaveProperty("totalMinor");
      expect(n.facts).not.toHaveProperty("transferRisk");
    }
  });
  it("keeps noncontiguous outbound/return segments with one shared order", () => {
    for (const v of [importRelationshipVectors[0], importRelationshipVectors[4]]) {
      const segments = v.nodes.filter((n) => n.kind === "SEGMENT");
      expect(segments).toHaveLength(2);
      expect(segments[0].facts.date).not.toBe(segments[1].facts.date);
      expect(new Set(v.edges.map((e) => e.from)).size).toBe(1);
    }
    expect(importRelationshipVectors[0].nodes[0].evidence).toHaveLength(2);
  });
  it("does not turn group capacity into individual credentials or a dated permit Item", () => {
    const v = importRelationshipVectors[5];
    expect(v.nodes.find((n) => n.token === "group-ticket")!.facts).toMatchObject({
      capacity: 5,
      credentialFaces: 1,
      holder: null,
    });
    expect(v.edges.some((e) => e.from === "permit")).toBe(false);
    expect(v.nodes.filter((n) => n.kind === "ITEM")).toHaveLength(0);
  });
  it("preserves attachment intent separately from ticket applicability and dynamic offline readiness", () => {
    const v = importRelationshipVectors[6];
    expect(v.edges.find((e) => e.relation === "DOCUMENT_ATTACHMENT")!.to).toBe("item-a");
    expect(v.edges.find((e) => e.relation === "TICKET_ITEM")!.to).toBe("item-b");
    expect(v.nodes.find((n) => n.token === "concert-ticket")!.facts.offline).toBeNull();
  });
});
