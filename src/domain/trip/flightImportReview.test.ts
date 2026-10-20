import { describe, it, expect } from "vitest";
import {
  parseFlightConfirmation,
  validateReviewedFlightCommand,
} from "./flightImportReview";
import { flightCommandLeaves, flightEndpointSchema } from "./flightAdmission";
import intents from "@/data/repositories/__fixtures__/tripImportIntents.json";
import catalogs from "@/data/repositories/__fixtures__/tripImportCatalogs.json";
const fields = catalogs.trip_source_candidates[0].proposal.fields;
function reviewedUpdate() {
  const slot = parseFlightConfirmation(JSON.stringify(intents.confirmation)).slots[0];
  slot.disposition = "UPDATE";
  slot.base_revision = 7;
  slot.reviewed_payload!.selected_fields = ["destination", "origin"];
  const origin = flightEndpointSchema.parse(intents.command.payload.origin);
  const destination = structuredClone(origin);
  origin.time.source_instant = "2026-12-16T20:30:00.123456Z";
  destination.time.source_instant = "2026-12-17T08:00:00.123456Z";
  destination.location.authored_label = "Shanghai";
  slot.reviewed_payload!.edits = structuredClone({ origin, destination });
  for (const key of Object.keys(slot.support_payload)) {
    if (!["origin", "destination"].includes(key)) delete slot.support_payload[key];
    else
      slot.support_payload[key] = {
        ...slot.support_payload[key],
        origin: "USER_ENTERED",
        candidate_id: null,
        candidate_field_key: null,
        input_ids: [],
        edited_value: null,
      };
  }
  const changes = { origin, destination };
  const proofs = Object.fromEntries(
    Object.keys(flightCommandLeaves(changes)).map((k) => [
      k,
      { kind: "TRACK_C", ref: `track-c/field-evidence/${slot.slot_id}/${k}` },
    ]),
  ) as Record<string, { kind: string; ref: string }>;
  return { slot, payload: { changes, proofs } };
}
describe("R1 complete reviewed action coverage", () => {
  it("rejects a reviewed retime plus arrival reduced to arrival only", () => {
    const { slot, payload } = reviewedUpdate();
    delete (payload.changes as Partial<typeof payload.changes>).origin;
    payload.proofs = Object.fromEntries(
      Object.entries(payload.proofs).filter(([k]) => !k.startsWith("ORIGIN.")),
    );
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).toThrow("INVALID_PROVENANCE");
  });
  it("accepts both exact reviewed components with complete composite leaves", () => {
    const { slot, payload } = reviewedUpdate();
    expect(
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload)
        .values,
    ).toEqual(payload.changes);
  });
  it("rejects selected services with missing support at confirmation preparation", () => {
    const intent = structuredClone(intents.confirmation);
    delete (intent.slots[0].support_payload as Record<string, unknown>).services;
    expect(() => parseFlightConfirmation(JSON.stringify(intent))).toThrow();
  });
  it("accepts a selected unchanged retained value and rejects a mismatched selected value", () => {
    const { slot, payload } = reviewedUpdate();
    payload.proofs["ORIGIN.authored_label"] = {
      kind: "RETAINED",
      ref: "otr-event/receipt/exact-origin-label",
    };
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).not.toThrow();
    payload.changes.origin.location.authored_label = "Different";
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).toThrow();
  });
  it("accepts a reviewed nullable clear only with exact allowed value/support", () => {
    const { slot, payload } = reviewedUpdate();
    payload.changes.origin.location.authored_text = null;
    payload.proofs["ORIGIN.authored_text"] = {
      kind: "TRACK_C",
      ref: `track-c/field-evidence/${slot.slot_id}/ORIGIN.authored_text`,
    };
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).not.toThrow();
    payload.changes.origin.location.authored_text = "Unreviewed" as never;
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).toThrow();
  });
  it("rejects extra unselected support and unused proof", () => {
    const intent = structuredClone(intents.confirmation);
    intent.slots[0].reviewed_payload.selected_fields =
      intent.slots[0].reviewed_payload.selected_fields.filter((k) => k !== "services");
    expect(() => parseFlightConfirmation(JSON.stringify(intent))).toThrow();
    const { slot, payload } = reviewedUpdate();
    payload.proofs["ROOT.title"] = {
      kind: "RETAINED",
      ref: "otr-event/receipt/unselected",
    };
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).toThrow();
  });
  it("rejects composite endpoint missing any required executable leaf proof", () => {
    const { slot, payload } = reviewedUpdate();
    delete payload.proofs["ORIGIN.source_instant"];
    expect(() =>
      validateReviewedFlightCommand(slot, fields as never, "UPDATE_TRANSPORT", payload),
    ).toThrow();
  });
  it("preserves explicit non-executable DEFER without inventing executable support", () => {
    const intent = structuredClone(intents.confirmation),
      slot = intent.slots[0] as Record<string, unknown>;
    Object.assign(slot, {
      disposition: "DEFER",
      intended_target_kind: null,
      intended_target_id: null,
      base_revision: null,
      adapter_key: null,
      adapter_version: null,
      domain_operation_key: null,
      domain_intent_sha256: null,
      support_payload: {},
    });
    expect(() => parseFlightConfirmation(JSON.stringify(intent))).not.toThrow();
  });
});
