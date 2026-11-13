import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  realtimePgFixture,
  realtimePgIds as ids,
} from "./__fixtures__/tripPrivateRealtimeAuthorizationPg";
import { preparePrivateRealtimeSession } from "./tripPrivateRealtimeCurrentSession";

const fixture = process.env.OTR_PRIVATE_REALTIME_SESSION_FIXTURE;
it.skipIf(!fixture)(
  "reads and locks real exact Auth Sessions without borrowing another Session or Account",
  async () => {
    const q = await realtimePgFixture(fixture!);
    await q.administrative(
      readFileSync(
        "docs/ops/auth-realtime-private-20261102/pg-candidate/CURRENT_SESSION_READER_CANDIDATE.sql",
        "utf8",
      ),
    );
    await q.administrative(
      "UPDATE auth.users SET is_anonymous=false,deleted_at=NULL,banned_until=NULL WHERE id=$1::uuid",
      [ids.a],
    );
    // Only the injected gateway authenticates these fixture bearers; no Provider proof.
    const tokens = q.sessions.map((s) =>
      [
        "unit",
        Buffer.from(
          JSON.stringify({
            sub: s.accountId,
            session_id: s.sessionId,
            exp: Math.floor(Date.now() / 1000) + 300,
            role: "authenticated",
            aud: "authenticated",
            is_anonymous: false,
          }),
        ).toString("base64url"),
        "fixture_signature",
      ].join("."),
    );
    const gateway = {
      validateAccessToken: async (token: string) => {
        const index = tokens.indexOf(token);
        return index < 0
          ? null
          : { id: q.sessions[index].accountId, accountClass: "NORMAL_ACCOUNT" as const };
      },
    };
    const readers = await Promise.all(
      q.sessions.map((s, i) =>
        preparePrivateRealtimeSession(gateway, {
          accountId: s.accountId,
          tripId: ids.trip,
          accessToken: tokens[i],
        }),
      ),
    );
    const read = (index: number, actor = ids.a, trip = ids.trip) =>
      q.connection.withLease(async (held) => {
        await held.query("BEGIN");
        try {
          await held.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [actor, trip],
          );
          const identity = await readers[index].currentSession(held);
          await held.query("COMMIT");
          return identity;
        } catch (error) {
          await held.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
    const checks: string[] = [];
    try {
      expect(await read(0)).toEqual({
        accountId: ids.a,
        sessionId: q.sessions[0].sessionId,
      });
      expect(await read(1)).toEqual({
        accountId: ids.a,
        sessionId: q.sessions[1].sessionId,
      });
      await expect(read(0, ids.b)).rejects.toThrow();
      await expect(
        read(0, ids.a, "10000000-0000-4000-8000-000000000099"),
      ).rejects.toThrow();
      checks.push("EXACT_SESSION_ACCOUNT_AND_HELD_TRIP_BINDING");

      for (const role of ["anon", "authenticated", "service_role"]) {
        await expect(
          q.admin(async (held) => {
            await held.query(`SET SESSION AUTHORIZATION ${role}`);
            await held.query(
              "SELECT public.otr_private_realtime_current_session($1::uuid,$2::uuid)",
              [q.sessions[0].sessionId, ids.trip],
            );
          }),
        ).rejects.toThrow();
      }
      await expect(
        q.connection.withLease((held) =>
          held.query("SELECT id FROM auth.sessions LIMIT 1"),
        ),
      ).rejects.toThrow();
      checks.push(
        "PUBLIC_ANON_AUTHENTICATED_SERVICE_ROLE_DENIED_NO_DIRECT_AUTH_TABLE_GRANT",
      );

      let deletion!: Promise<unknown>;
      await q.connection.withLease(async (held) => {
        await held.query("BEGIN");
        try {
          await held.query(
            "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
            [ids.a, ids.trip],
          );
          await readers[0].currentSession(held);
          let release!: (pid: number) => void;
          const started = new Promise<number>((resolve) => {
            release = resolve;
          });
          deletion = q.admin(async (writer) => {
            const pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0]
              .pid as number;
            release(pid);
            await writer.query("DELETE FROM auth.sessions WHERE id=$1::uuid", [
              q.sessions[0].sessionId,
            ]);
          });
          const pid = await started;
          let blocked = false;
          for (let i = 0; i < 50 && !blocked; i++) {
            blocked =
              (
                await q.administrative(
                  "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::int AND wait_event_type='Lock') AS blocked",
                  [pid],
                )
              ).rows[0].blocked === true;
            if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          await held.query("COMMIT");
        } catch (error) {
          await held.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
      await deletion;
      await expect(read(0)).rejects.toThrow("SESSION_NOT_CURRENT");
      expect(await read(1)).toEqual({
        accountId: ids.a,
        sessionId: q.sessions[1].sessionId,
      });
      checks.push(
        "REAL_SESSION_REVOKE_WAITS_HELD_SHARE_LOCK_AND_OTHER_SESSION_REMAINS_CURRENT",
      );

      await q.administrative(
        "UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1::uuid",
        [q.sessions[1].sessionId],
      );
      await q.admin(async (blocker) => {
        await blocker.query("BEGIN");
        try {
          await blocker.query(
            "SELECT id FROM auth.sessions WHERE id=$1::uuid FOR UPDATE",
            [q.sessions[1].sessionId],
          );
          let started!: (pid: number) => void;
          const ready = new Promise<number>((resolve) => {
            started = resolve;
          });
          const pending = q.connection.withLease(async (held) => {
            await held.query("BEGIN");
            try {
              await held.query(
                "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
                [ids.a, ids.trip],
              );
              started(
                (await held.query("SELECT pg_backend_pid() AS pid")).rows[0]
                  .pid as number,
              );
              const result = await readers[1].currentSession(held);
              await held.query("COMMIT");
              return result;
            } catch (error) {
              await held.query("ROLLBACK").catch(() => undefined);
              throw error;
            }
          });
          const denied = expect(pending).rejects.toThrow("SESSION_NOT_CURRENT");
          const pid = await ready;
          let blocked = false;
          for (let i = 0; i < 50 && !blocked; i++) {
            blocked =
              (
                await q.administrative(
                  "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::int AND wait_event_type='Lock') AS blocked",
                  [pid],
                )
              ).rows[0].blocked === true;
            if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          // The lock owner changes nothing; only the database Session deadline passes.
          await blocker.query(
            "SELECT pg_sleep(greatest(0,extract(epoch FROM (not_after-clock_timestamp())))::float8+0.05) FROM auth.sessions WHERE id=$1::uuid",
            [q.sessions[1].sessionId],
          );
          await blocker.query("COMMIT");
          await denied;
        } catch (error) {
          await blocker.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
      checks.push("SESSION_EXPIRY_RECHECKED_AFTER_LOCK_WAIT_WITHOUT_ROW_UPDATE");

      await q.administrative(
        "UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",
        [q.sessions[1].sessionId],
      );
      await expect(read(1)).rejects.toThrow("SESSION_NOT_CURRENT");
      await q.administrative(
        "UPDATE auth.sessions SET not_after=clock_timestamp()+interval '5 minutes' WHERE id=$1::uuid",
        [q.sessions[1].sessionId],
      );
      for (const patch of [
        "banned_until=clock_timestamp()+interval '1 hour'",
        "is_anonymous=true",
        "deleted_at=clock_timestamp()",
      ]) {
        await q.administrative(`UPDATE auth.users SET ${patch} WHERE id=$1::uuid`, [
          ids.a,
        ]);
        await expect(read(1)).rejects.toThrow("SESSION_NOT_CURRENT");
        await q.administrative(
          "UPDATE auth.users SET banned_until=NULL,is_anonymous=false,deleted_at=NULL WHERE id=$1::uuid",
          [ids.a],
        );
      }
      checks.push("DATABASE_NOT_AFTER_BANNED_ANONYMOUS_AND_SOFT_DELETED_DENIED");
    } finally {
      await q.administrative(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}',scope_actor_account_id=NULL,scope_trip_id=NULL,scope_started_at=NULL,scope_expires_at=NULL",
      );
    }
    writeFileSync(
      "docs/ops/auth-realtime-private-20261102/pg-candidate/CURRENT_SESSION_ISOLATED_PG_RECEIPT.json",
      JSON.stringify(
        {
          status:
            "EXACT_CURRENT_SESSION_READER_ISOLATED_PG_PASS_NOT_HOSTED_OR_TRANSPORT_E2E",
          checkedAt: new Date().toISOString(),
          network: "none",
          checks,
          hostedWrites: 0,
          providerCalls: 0,
          limits: [
            "Synthetic gateway authentication; no new real Provider login proof",
            "No member transition producer or private network forced disconnect",
            "Candidate protected EXECUTE installed only in this isolated fixture",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  },
  120000,
);
