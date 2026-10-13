import { expect, it } from "vitest";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { ttrIdentityKey } from "@/domain/trip/ttr";
import { ttrLabCases, ttrLabFixture } from "@/features/ttr/labFixtures";
import {
  flexibleReactiveContribution,
  flexibleFixtureUpdate,
} from "@/features/day-feed-lab/flexibleReactiveContribution";
import { composeDayStream } from "./composition";
import {
  composedTtrActionability,
  createG2TtrSessionBridge,
  type G2TtrScope,
} from "./ttrSessionBridge";

function fixture(caseId = "NOW_COLLISION" as (typeof ttrLabCases)[number]) {
  const f = ttrLabFixture(caseId);
  const p = f.supplemental!.projection;
  const scope: G2TtrScope = {
    accountId: f.projection.accountId,
    tripId: f.id,
    generation: 0,
    localDate: f.selectedDate,
    visitKey: "visit/1",
  };
  const stream = composeDayStream(
    itemsForLocalDate(f.projection, f.selectedDate, f.zone),
    f.instant,
    f.ports,
  );
  const raw = composedTtrActionability(scope, stream, [p], true);
  const bridge = createG2TtrSessionBridge();
  const snapshot = bridge.prepare(raw);
  bridge.commit(snapshot, false);
  const intent = p.actions.openTtr!;
  const presentation = {
    key: p.identity ? ttrIdentityKey(p.identity) : "missing",
    inputFingerprint: p.inputFingerprint,
  };
  return { f, p, scope, stream, raw, snapshot, bridge, intent, presentation };
}
it("takes eligibility from the actual composed output for every accepted TTR case", () => {
  for (const id of ttrLabCases) {
    const x = fixture(id);
    expect(x.snapshot.transitions.some((t) => t.actionable)).toBe(
      x.f.supplemental!.expected.composed,
    );
    expect(Object.isFrozen(x.snapshot)).toBe(true);
    expect(Object.isFrozen(x.snapshot.scope)).toBe(true);
  }
});
it("accepts the current exact relation, occurrence, fingerprint and publication", () => {
  const x = fixture();
  expect(x.bridge.accepts(x.snapshot, x.intent, x.presentation)).toBe(true);
  expect(
    x.bridge.accepts(
      x.snapshot,
      { ...x.intent, publicationVersion: x.intent.publicationVersion + 1 },
      x.presentation,
    ),
  ).toBe(false);
  expect(
    x.bridge.accepts(
      x.snapshot,
      {
        ...x.intent,
        identity: { ...x.intent.identity, occurrenceDiscriminator: "different" },
      },
      x.presentation,
    ),
  ).toBe(false);
  expect(
    x.bridge.accepts(x.snapshot, x.intent, {
      ...x.presentation,
      inputFingerprint: "different",
    }),
  ).toBe(false);
});
it("rejects queued old taps after replacement and A to B to A even when values repeat", () => {
  const x = fixture();
  const b = x.bridge.prepare({ ...x.raw, scope: { ...x.scope, visitKey: "visit/2" } });
  x.bridge.commit(b, false);
  const a = x.bridge.prepare(x.raw);
  x.bridge.commit(a, false);
  expect(a.revision).toBe(3);
  expect(x.bridge.accepts(x.snapshot, x.intent, x.presentation)).toBe(false);
  expect(x.bridge.accepts(a, x.intent, x.presentation)).toBe(true);
  const replacement = x.bridge.prepare({
    ...x.raw,
    transitions: x.raw.transitions.map((t) => ({
      ...t,
      publicationVersion: t.publicationVersion + 1,
    })),
  });
  x.bridge.commit(replacement, false);
  expect(x.bridge.accepts(a, x.intent, x.presentation)).toBe(false);
});
it("reports actual Flexible nesting loss without qualifying relations again", () => {
  const f = flexibleReactiveContribution();
  const p = f.supplemental!.projection;
  const before = composeDayStream(
    itemsForLocalDate(f.projection, f.selectedDate, f.zone),
    f.instant,
    { ...f.ports, flexible: f.flexiblePublication!.snapshot!.blocks },
  );
  const nested = flexibleFixtureUpdate(f.flexiblePublication!.snapshot!, "NEST_ANCHOR");
  const after = composeDayStream(
    itemsForLocalDate(f.projection, f.selectedDate, f.zone),
    f.instant,
    { ...f.ports, flexible: nested.blocks },
  );
  const scope = {
    accountId: f.projection.accountId,
    tripId: f.id,
    generation: 0,
    localDate: f.selectedDate,
    visitKey: "visit",
  };
  expect(
    composedTtrActionability(scope, before, [p], true).transitions[0].actionable,
  ).toBe(true);
  expect(composedTtrActionability(scope, after, [p], true).transitions[0]).toMatchObject({
    actionable: false,
    reason: "NOT_COMPOSED",
  });
});
it("invalidates permission/Immersive loss and blocks a second tap during its own Sheet without changing the lease", () => {
  const x = fixture();
  expect(x.bridge.commit(x.bridge.prepare(x.raw), true)).toBe(false);
  expect(x.bridge.accepts(x.snapshot, x.intent, x.presentation)).toBe(false);
  x.bridge.commit(x.snapshot, false);
  const denied = composedTtrActionability(x.scope, x.stream, [x.p], false);
  expect(denied.transitions[0]).toMatchObject({
    actionable: false,
    reason: "PERMISSION",
  });
  const overlay = composedTtrActionability(
    x.scope,
    { ...x.stream, immersive: x.f.projection.events[0].id },
    [x.p],
    true,
  );
  expect(overlay.transitions[0]).toMatchObject({ actionable: false, reason: "OVERLAY" });
  x.bridge.dispose();
  expect(x.bridge.accepts(x.snapshot, x.intent, x.presentation)).toBe(false);
});
it("keeps Focus/NOW-only updates from replacing a valid controller lease", () => {
  const x = fixture();
  const changed = composedTtrActionability(
    x.scope,
    { ...x.stream, focus: x.f.projection.events[0].id },
    [x.p],
    true,
  );
  expect(x.bridge.prepare(changed)).toBe(x.snapshot);
  expect(x.stream.rows.some((r) => r.transition?.suppressConnector)).toBe(true);
});
