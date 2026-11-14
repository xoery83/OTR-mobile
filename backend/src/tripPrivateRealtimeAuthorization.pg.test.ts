import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  realtimePgFixture,
  realtimePgIds as ids,
} from "./__fixtures__/tripPrivateRealtimeAuthorizationPg";
import { createTripPrivateRealtimeAuthority } from "./tripPrivateRealtimeAuthority";
import { createTripPrivateRealtimePgAuthorityPort } from "./tripPrivateRealtimeAuthorityPg";

const fixture = process.env.OTR_PRIVATE_REALTIME_SQL_FIXTURE;
// Real local PG + Backend candidate. No actual private network channel or Provider login is certified.
it.skipIf(!fixture)(
  "fences committed canonical membership loss, restored generation and exact Session without leaking private Items",
  async () => {
    const q = await realtimePgFixture(fixture!);
    const receipts: string[] = [];
    const handles = new Map<
      string,
      {
        assertCurrent(): Promise<void>;
        close: ReturnType<typeof vi.fn>;
        sessionId: string;
      }
    >();
    let blockNextOpen: (() => Promise<void>) | undefined;
    const transport = {
      async open(
        scope: { accountId: string; tripId: string; sessionId: string },
        binding: { actorPersonId: string; membershipGeneration: number },
        _core: unknown,
        assertCurrent: () => Promise<void>,
      ) {
        await expect(assertCurrent()).rejects.toThrow("JOIN_NOT_COMMITTED");
        if (blockNextOpen) {
          const block = blockNextOpen;
          blockNextOpen = undefined;
          await block();
        }
        const id = randomUUID(),
          close = vi.fn();
        handles.set(id, { assertCurrent, close, sessionId: scope.sessionId });
        return {
          lease: {
            accountId: scope.accountId,
            tripId: scope.tripId,
            actorPersonId: binding.actorPersonId,
            leaseId: id,
            channel: "LOCAL_FIXTURE_NO_NETWORK_CHANNEL",
            authorizationRevision: binding.membershipGeneration,
            expiresAt: Date.now() + 30000,
          },
          close,
        };
      },
    };
    const port = createTripPrivateRealtimePgAuthorityPort({ core: q.core, transport });
    const authority = createTripPrivateRealtimeAuthority({ gateway: q.gateway, port });
    const request = (index = 0) =>
      new Request("https://local-fixture.invalid/realtime", {
        headers: { Authorization: `Bearer ${q.sessions[index].token}` },
      });
    const input = { tripId: ids.trip, localGeneration: 1 };
    const read = (itemId: string, index = 0) =>
      authority.readItem(request(index), { ...input, itemId });
    const opened: Awaited<ReturnType<typeof authority.subscribe>>[] = [];
    const subscribe = async (index = 0) => {
      const handle = await authority.subscribe(request(index), input);
      opened.push(handle);
      return handle;
    };
    try {
      const first = await subscribe(),
        secondSession = await subscribe(1);
      await handles.get(first.lease.leaseId)!.assertCurrent();
      await handles.get(secondSession.lease.leaseId)!.assertCurrent();
      expect(first.lease.authorizationRevision).toBe(1);
      expect(handles.get(first.lease.leaseId)!.sessionId).not.toBe(
        handles.get(secondSession.lease.leaseId)!.sessionId,
      );
      expect(await read(q.privateItem)).not.toBeNull();
      expect(await q.reader.item(ids.a, ids.trip, q.privateItem)).not.toBeNull();
      await expect(subscribe(2)).rejects.toThrow(); // Liveness row alone does not grant membership.
      await expect(read(q.groupItem, 2)).rejects.toThrow();
      receipts.push("A_CURRENT_CANONICAL_ACTOR_AND_PG_GENERATION_ADMITTED_B_DENIED");

      await q.setGate(ids.peer);
      expect(await q.reader.item(ids.peer, ids.trip, q.privateItem)).toBeNull();
      expect(await q.reader.item(ids.peer, ids.trip, q.groupItem)).not.toBeNull();
      expect(await read(q.privateItem, 3)).toBeNull();
      expect(await read(q.groupItem, 3)).not.toBeNull();
      await q.setGate(ids.a);
      receipts.push("REAL_CORE_PROJECTOR_PRIVATE_ITEM_WITHHELD_FROM_OTHER_LINKED_ACTOR");

      const before = await q.state();
      const failed = randomUUID();
      await expect(q.transition("REVOKED", failed, "BEFORE_RECEIPT")).rejects.toThrow();
      expect(await q.state()).toEqual(before);
      await expect(
        q.transition("REVOKED", randomUUID(), "CAUGHT_RECEIPT"),
      ).rejects.toThrow();
      expect(await q.state()).toEqual(before); // PostgreSQL aborted transaction cannot partially COMMIT.
      receipts.push("CANONICAL_DML_GENERATION_AND_RECEIPT_FAILURE_ROLL_BACK_TOGETHER");

      const revoke = await q.transition("REVOKED");
      const revoked = await q.state();
      expect(revoked).toMatchObject({ generation: 2, status: "unlinked", receipts: 1 });
      expect(revoked.generationXmin).toBe(revoked.memberXmin);
      expect(revoked.generationXmin).toBe(revoked.receiptXmin);
      expect(handles.get(first.lease.leaseId)!.close).not.toHaveBeenCalled(); // No automatic transport enforcement is connected.
      await expect(handles.get(first.lease.leaseId)!.assertCurrent()).rejects.toThrow();
      await expect(
        handles.get(secondSession.lease.leaseId)!.assertCurrent(),
      ).rejects.toThrow();
      await expect(subscribe()).rejects.toThrow();
      await expect(read(q.privateItem)).rejects.toThrow();
      await expect(q.reader.item(ids.a, ids.trip, q.privateItem)).rejects.toThrow(
        "NOT_VISIBLE",
      );
      await q.transition("REVOKED", revoke.operationId);
      expect(await q.state()).toEqual(revoked);
      await expect(
        q.administrative(
          "UPDATE public.trip_realtime_transitions SET kind='REGRANTED' WHERE operation_id=$1::uuid",
          [revoke.operationId],
        ),
      ).rejects.toThrow();
      await expect(
        authority.reconcileTransition(request(), {
          ...input,
          operationId: revoke.operationId,
        }),
      ).resolves.toMatchObject({
        receiptState: "COMMITTED",
        receipt: {
          operationId: revoke.operationId,
          accountId: ids.a,
          tripId: ids.trip,
          kind: "REVOKED",
          previousGeneration: 1,
          membershipGeneration: 2,
        },
        enforcement: "UNCONFIRMED",
      });
      receipts.push("REAL_PG_COMMIT_LOSS_REJECTS_OLD_GENERATION_REJOIN_AND_CORE_READ");

      const regrantId = randomUUID();
      await Promise.all([
        q.transition("REGRANTED", regrantId),
        q.transition("REGRANTED", regrantId),
      ]);
      expect(await q.state()).toMatchObject({
        generation: 3,
        status: "linked",
        receipts: 2,
      });
      await expect(handles.get(first.lease.leaseId)!.assertCurrent()).rejects.toThrow();
      const restored = await subscribe();
      expect(restored.lease.authorizationRevision).toBe(3);
      await handles.get(restored.lease.leaseId)!.assertCurrent();
      expect(await q.reader.item(ids.a, ids.trip, q.privateItem)).not.toBeNull();
      receipts.push(
        "SAME_OPERATION_DEDUP_AND_REGRANT_NEW_PERSISTED_GENERATION_OLD_LEASE_NEVER_REVIVES",
      );

      await q.administrative("DELETE FROM auth.sessions WHERE id=$1::uuid", [
        q.sessions[0].sessionId,
      ]);
      await expect(
        handles.get(restored.lease.leaseId)!.assertCurrent(),
      ).rejects.toThrow();
      await expect(subscribe()).rejects.toThrow("NORMAL_ACCOUNT");
      const stillValid = await subscribe(1);
      await handles.get(stillValid.lease.leaseId)!.assertCurrent();
      expect(await read(q.privateItem, 1)).not.toBeNull();
      expect(await q.state()).toMatchObject({
        generation: 3,
        status: "linked",
        receipts: 2,
      });
      receipts.push(
        "ONE_REAL_AUTH_SESSIONS_ROW_REVOKED_OTHER_SAME_ACCOUNT_SESSION_REMAINS_VALID",
      );

      let reached!: () => void, release!: () => void;
      const reachedOpen = new Promise<void>((done) => {
        reached = done;
      });
      const releasedOpen = new Promise<void>((done) => {
        release = done;
      });
      blockNextOpen = async () => {
        reached();
        await releasedOpen;
      };
      const joining = subscribe(1);
      await reachedOpen;
      let finished = false;
      const losing = q.transition("REVOKED").then((value) => {
        finished = true;
        return value;
      });
      try {
        let locked = false;
        for (let n = 0; n < 20 && !locked; n++) {
          locked =
            (
              await q.administrative(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%realtime_fixture_transition%FOR UPDATE%' AND query NOT LIKE '%pg_stat_activity%') AS locked",
              )
            ).rows[0].locked === true;
          if (!locked) await new Promise((done) => setTimeout(done, 10));
        }
        expect(locked).toBe(true);
        expect(finished).toBe(false);
      } finally {
        release();
      }
      const joined = await joining;
      await losing;
      expect(await q.state()).toMatchObject({
        generation: 4,
        status: "unlinked",
        receipts: 3,
      });
      await expect(handles.get(joined.lease.leaseId)!.assertCurrent()).rejects.toThrow();
      await expect(read(q.groupItem, 1)).rejects.toThrow();
      receipts.push(
        "REAL_PG_LOCK_SERIALIZES_ADMISSION_AND_CANONICAL_REVOKE_NO_POSTCOMMIT_OLD_ACCESS",
      );

      await q.transition("REGRANTED");
      const resumed = await subscribe(1);
      expect(resumed.lease.authorizationRevision).toBe(5);
      await expect(handles.get(joined.lease.leaseId)!.assertCurrent()).rejects.toThrow();
      await expect(
        authority.subscribe(request(1), { ...input, accountId: ids.b }),
      ).rejects.toThrow();
      await expect(
        authority.readItem(request(2), { ...input, itemId: q.privateItem }),
      ).rejects.toThrow();
      const stable = await q.state();
      const duplicateConnection = await subscribe(1);
      resumed.close();
      resumed.close();
      expect(handles.get(resumed.lease.leaseId)!.close).toHaveBeenCalledTimes(1);
      await handles.get(duplicateConnection.lease.leaseId)!.assertCurrent();
      expect(await q.state()).toEqual(stable);
      receipts.push(
        "ABA_FOREIGN_ACCOUNT_AND_REPEATED_DISCONNECT_REJOIN_KEEP_SERVER_GENERATION",
      );

      const report = {
        status: "LOCAL_PG_BACKEND_COMPONENT_PASS_READY_FOR_INTEGRATION_NOT_REALTIME_E2E",
        fixture: nameSafe(q.name),
        network: "none",
        checkedAt: new Date().toISOString(),
        checks: receipts,
        finalState: stable,
        hostedWrites: 0,
        providerCalls: 0,
        limits: [
          "Synthetic fixture bearer mapping, not real Provider/OTP login",
          "Canonical membership DML executed only by isolated fixture writer, no user-facing revoke API",
          "Fixture held-scope composition is not the delivered Core server adapter",
          "Auth liveness generations are not Core accessRevision",
          "No actual private channel, server forced-disconnect or Publisher proof; enforcement remains UNCONFIRMED",
        ],
      };
      mkdirSync("docs/ops/auth-realtime-private-20261102/pg-candidate", {
        recursive: true,
      });
      writeFileSync(
        "docs/ops/auth-realtime-private-20261102/pg-candidate/ISOLATED_PG_RECEIPT.json",
        JSON.stringify(report, null, 2) + "\n",
      );
      console.info("PRIVATE_REALTIME_ISOLATED_PG", JSON.stringify(report));
    } finally {
      for (const item of opened) item.close();
      await q.administrative(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}',scope_actor_account_id=NULL,scope_trip_id=NULL,scope_started_at=NULL,scope_expires_at=NULL",
      );
    }
  },
  120000,
);
function nameSafe(value: string) {
  if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(value)) throw Error("FIXTURE_ID");
  return value;
}
