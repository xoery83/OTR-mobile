import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripMemberClaimPgPort } from "./tripMemberClaimPg";
import { executeMemberClaim, type MemberClaimCommand } from "./tripMemberClaimAuthority";
import { recoverMemberClaimReceipt } from "./tripMemberClaimRecovery";

const fixture = process.env.OTR_MEMBER_CLAIM_PG_FIXTURE;
const ids = {
  trip: "10000000-0000-4000-8000-000000000001",
  a: "00000000-0000-4000-8000-000000000002",
  b: "00000000-0000-4000-8000-000000000004",
  c: "00000000-0000-4000-8000-000000000003",
};
it.skipIf(!fixture)(
  "commits exact directed Claim and original receipts on real isolated PG",
  async () => {
    if (!/^otr-core-v2-test-[a-f0-9]{12}$/.test(fixture!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    if (
      process.env.DOCKER_HOST ||
      process.env.DOCKER_CONFIG ||
      process.env.DOCKER_TLS_VERIFY ||
      process.env.DOCKER_CERT_PATH ||
      process.env.DOCKER_CONTEXT !== "colima"
    )
      throw Error("LOCAL_COLIMA_CONTEXT_REQUIRED");
    expect(
      execFileSync(
        "/opt/homebrew/bin/docker",
        [
          "--context",
          "colima",
          "context",
          "inspect",
          "colima",
          "--format",
          "{{.Endpoints.docker.Host}}",
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("unix:///Users/xoery/.colima/default/docker.sock");
    expect(
      execFileSync(
        "/opt/homebrew/bin/docker",
        [
          "inspect",
          "--format",
          '{{.HostConfig.NetworkMode}}/{{index .Config.Labels "otr.auth.fixture"}}',
          fixture!,
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("none/member-claim");
    const admin = session(fixture!);
    await admin.lease.query("SET ROLE postgres");
    const query = admin.lease.query;
    const connection: CorePgConnection = {
      async withLease(work) {
        const sql = session(fixture!);
        try {
          await sql.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
          return await work(sql.lease);
        } finally {
          sql.close();
        }
      },
    };
    const sqlPath = "docs/ops/auth-c04-20261103/pg-candidate/MEMBER_CLAIM_CANDIDATE.sql";
    const port = createTripMemberClaimPgPort(connection, {
      inviteExpiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    const person = randomUUID();
    const issue = (personId = person): MemberClaimCommand => ({
      kind: "ISSUE_TARGETED_INVITE",
      operationId: randomUUID(),
      tripId: ids.trip,
      personId,
      target: { kind: "REGISTERED_ACCOUNT", accountId: ids.b },
    });
    const personInsert = (id: string) =>
      query(
        "INSERT INTO public.journey_members(id,trip_id,display_name,role,status) VALUES($1::uuid,$2::uuid,'Synthetic Claim Person','group_member','unlinked')",
        [id, ids.trip],
      );
    const claimFor = (inviteId: string, personId = person): MemberClaimCommand => ({
      kind: "CLAIM_PERSON",
      operationId: randomUUID(),
      tripId: ids.trip,
      personId,
      inviteId,
      explicitConsent: true,
    });
    const counts = async () =>
      (
        await query(
          "SELECT (SELECT count(*)::int FROM public.trip_member_claim_receipts) AS receipts,(SELECT count(*)::int FROM public.trip_directed_invite_targets) AS invites",
        )
      ).rows[0];
    const evidence: string[] = [];
    try {
      for (const [i, suffix] of [
        "foundation",
        "version_dispatch",
        "owning_session",
        "read_scope",
      ].entries())
        await query(
          readFileSync(
            `supabase/migrations/20261011000${i + 1}00_trip_core_v2_${suffix}.sql`,
            "utf8",
          ),
        );
      const owner = (
        await query("SELECT created_by FROM public.trips WHERE id=$1::uuid", [ids.trip])
      ).rows[0]?.created_by;
      expect(typeof owner).toBe("string");
      ids.a = owner as string;
      expect(ids.a).not.toBe(ids.b);
      const rejectedInstall = session(fixture!);
      try {
        await rejectedInstall.lease.query("SET ROLE postgres");
        await expect(
          rejectedInstall.lease.query(readFileSync(sqlPath, "utf8")),
        ).rejects.toThrow("MEMBER_CLAIM_EXACT_DEV_GATE_REQUIRED");
      } finally {
        rejectedInstall.close();
      }
      await query(
        "SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.member_claim_gate='OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_V1'",
      );
      await query(readFileSync(sqlPath, "utf8"));
      await query(
        "INSERT INTO public.trip_core_read_state(trip_id) VALUES($1::uuid) ON CONFLICT DO NOTHING",
        [ids.trip],
      );
      evidence.push(
        "Install without exact DEV marker rejects; explicit local fixture install validates absent objects, owner/RLS/ACL postconditions",
      );
      await personInsert(person);
      for (const target of [{ accountId: ids.b }, { kind: null, accountId: ids.b }]) {
        await expect(
          connection.withLease(async (lease) => {
            await lease.query("BEGIN");
            try {
              await lease.query(
                "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
                [ids.a, ids.trip],
              );
              return await lease.query(
                "SELECT public.trip_member_claim_transaction('issue',$1::jsonb) AS result",
                [
                  JSON.stringify({
                    personId: person,
                    target,
                    expiresAt: new Date(Date.now() + 600000).toISOString(),
                  }),
                ],
              );
            } finally {
              await lease.query("ROLLBACK");
            }
          }),
        ).rejects.toThrow();
      }
      expect(await counts()).toEqual({ receipts: 0, invites: 0 });
      evidence.push(
        "Raw SQL missing/null target kind rejects; no invitation/receipt mutation",
      );
      const command = issue();
      const issued = await executeMemberClaim(command, ids.a, port);
      expect(issued.status).toBe("ISSUED");
      if (!("inviteId" in issued)) throw Error("EXPECTED_ISSUED");
      const legacyToken = (
        await query("SELECT token FROM public.journey_invites WHERE id=$1::uuid", [
          issued.inviteId,
        ])
      ).rows[0].token;
      const legacy = session(fixture!);
      try {
        await legacy.lease.query("BEGIN;SET LOCAL ROLE authenticated");
        await legacy.lease.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
          ids.b,
        ]);
        expect(
          (
            await legacy.lease.query(
              "SELECT * FROM public.accept_journey_invite($1::text)",
              [legacyToken],
            )
          ).rows[0],
        ).toEqual({ accepted_trip_id: null, invite_status: "invalid" });
        await legacy.lease.query("ROLLBACK");
      } finally {
        legacy.close();
      }
      const reactivate = session(fixture!);
      try {
        await reactivate.lease.query("SET ROLE postgres");
        await expect(
          reactivate.lease.query(
            "UPDATE public.journey_invites SET is_active=true WHERE id=$1::uuid",
            [issued.inviteId],
          ),
        ).rejects.toThrow("DIRECTED_INVITE_LEGACY_MUTATION_DENIED");
      } finally {
        reactivate.close();
      }
      evidence.push(
        "Existing legacy accept cannot consume directed record; non-gateway reactivation denied",
      );
      expect(await executeMemberClaim(command, ids.a, port)).toEqual(issued);
      expect(await counts()).toEqual({ receipts: 1, invites: 1 });
      const claim = claimFor(issued.inviteId);
      expect(await executeMemberClaim(claim, ids.c, port)).toEqual({ status: "DENIED" });
      const beforeAccessRevision = (
        await query(
          "SELECT access_revision::int AS revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
          [ids.trip],
        )
      ).rows[0].revision as number;
      let lostCommit = false;
      const uncertainPort = createTripMemberClaimPgPort(
        {
          withLease: (work) =>
            connection.withLease((lease) =>
              work({
                retire: () => lease.retire(),
                async query(sql, args) {
                  const result = await lease.query(sql, args);
                  if (sql === "COMMIT" && !lostCommit) {
                    lostCommit = true;
                    throw Error("SYNTHETIC_COMMIT_ACK_LOST");
                  }
                  return result;
                },
              }),
            ),
        },
        { inviteExpiresAt: new Date(Date.now() + 600000).toISOString() },
      );
      expect(await executeMemberClaim(claim, ids.b, uncertainPort)).toEqual({
        status: "UNAVAILABLE",
      });
      const linked = await recoverMemberClaimReceipt(claim, ids.b, port);
      expect(linked).toMatchObject({ status: "LINKED", currentAccess: "READ" });
      expect(
        (
          await query(
            "SELECT access_revision::int AS revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [ids.trip],
          )
        ).rows[0].revision,
      ).toBeGreaterThan(beforeAccessRevision);
      expect(
        (
          await query(
            "SELECT user_id,status FROM public.journey_members WHERE id=$1::uuid",
            [person],
          )
        ).rows[0],
      ).toEqual({ user_id: ids.b, status: "linked" });
      expect(await recoverMemberClaimReceipt(claim, ids.b, port)).toEqual(linked);
      expect(await executeMemberClaim(claim, ids.b, port)).toEqual(linked);
      expect(
        await Promise.all([
          executeMemberClaim(claim, ids.b, port),
          executeMemberClaim(claim, ids.b, port),
        ]),
      ).toEqual([linked, linked]);
      expect(await counts()).toEqual({ receipts: 2, invites: 1 });
      evidence.push(
        "Owner issue; exact B Claim; C denied; canonical Person readback; actual COMMIT ack loss recovered from original receipt; concurrent duplicate no mutation",
      );

      const scope = { actorAccountId: ids.b, tripId: ids.trip };
      expect(await port.atomic(scope, (tx) => tx.currentEffectiveAccess(ids.b))).toBe(
        "READ",
      );
      expect(
        await port.atomic({ ...scope, actorAccountId: ids.c }, (tx) =>
          tx.currentEffectiveAccess(ids.c),
        ),
      ).toBe("READ");
      const revoke = {
        kind: "REVOKE_UNCLAIMED_INVITE" as const,
        operationId: randomUUID(),
        tripId: ids.trip,
        personId: person,
        inviteId: issued.inviteId,
      };
      expect(await executeMemberClaim(revoke, ids.a, port)).toEqual({ status: "DENIED" });
      evidence.push(
        "Claimed invite revoke cannot remove linked Member or existing rights",
      );

      // New unlinked Person isolates failure/revoke checks from the successful connection.
      const next = randomUUID();
      await personInsert(next);
      const nextIssue = issue(next);
      // Existing B connection prevents another Person from being assigned to the same Account.
      expect(await executeMemberClaim(nextIssue, ids.a, port)).toEqual({
        status: "UNAVAILABLE",
      });
      await query(
        "UPDATE public.journey_members SET user_id=NULL,status='unlinked' WHERE id=$1::uuid",
        [person],
      );
      expect(await recoverMemberClaimReceipt(claim, ids.b, port)).toMatchObject({
        status: "LINKED",
        currentAccess: "NONE",
      });
      expect(
        (
          await query(
            "SELECT public.trip_core_actor_has_trip($1::uuid,$2::uuid) AS allowed",
            [ids.b, ids.trip],
          )
        ).rows[0].allowed,
      ).toBe(false);
      evidence.push(
        "Fixture-only administrative unlink denies canonical Core membership; historical LINKED receipt remains NONE, not regrant",
      );
      const nextIssued = await executeMemberClaim(nextIssue, ids.a, port);
      expect(nextIssued.status).toBe("ISSUED");
      if (!("inviteId" in nextIssued)) throw Error("EXPECTED_ISSUED");
      const nextClaim = claimFor(nextIssued.inviteId, next);
      // Inject a real server-side receipt failure; identity and invitation must roll back.
      await query(
        "CREATE FUNCTION public.claim_test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_RECEIPT_FAILURE';END$$;CREATE TRIGGER claim_test_failure BEFORE INSERT ON public.trip_member_claim_receipts FOR EACH ROW WHEN (new.outcome='LINKED') EXECUTE FUNCTION public.claim_test_receipt_failure()",
      );
      expect(await executeMemberClaim(nextClaim, ids.b, port)).toEqual({
        status: "UNAVAILABLE",
      });
      expect(
        (
          await query(
            "SELECT user_id,status FROM public.journey_members WHERE id=$1::uuid",
            [next],
          )
        ).rows[0],
      ).toEqual({ user_id: null, status: "unlinked" });
      expect(
        (
          await query(
            "SELECT status FROM public.trip_directed_invite_targets WHERE invite_id=$1::uuid",
            [nextIssued.inviteId],
          )
        ).rows[0].status,
      ).toBe("PENDING");
      expect(await recoverMemberClaimReceipt(nextClaim, ids.b, port)).toEqual({
        status: "ABSENT_UNCONFIRMED",
      });
      await query(
        "DROP TRIGGER claim_test_failure ON public.trip_member_claim_receipts;DROP FUNCTION public.claim_test_receipt_failure()",
      );
      evidence.push(
        "Real SQL receipt failure rolls back link+invite; UNKNOWN lookup absence does not replay",
      );

      const revokeNext = {
        ...revoke,
        operationId: randomUUID(),
        personId: next,
        inviteId: nextIssued.inviteId,
      };
      expect((await executeMemberClaim(revokeNext, ids.a, port)).status).toBe(
        "INVITE_REVOKED",
      );
      expect(await executeMemberClaim(nextClaim, ids.b, port)).toEqual({
        status: "DENIED",
      });
      evidence.push("Unclaimed invite revoke blocks exact B Claim");
      for (const order of ["claim-first", "revoke-first", "claim-race"] as const) {
        const racePerson = randomUUID();
        await personInsert(racePerson);
        const raceIssue = await executeMemberClaim(issue(racePerson), ids.a, port);
        if (!("inviteId" in raceIssue)) throw Error("RACE_INVITE_REQUIRED");
        const raceClaim = claimFor(raceIssue.inviteId, racePerson);
        const raceRevoke = {
          ...revoke,
          operationId: randomUUID(),
          personId: racePerson,
          inviteId: raceIssue.inviteId,
        };
        let secondClaim = raceClaim;
        if (order === "claim-race") {
          const competingPerson = randomUUID();
          await personInsert(competingPerson);
          const competingIssue = await executeMemberClaim(
            issue(competingPerson),
            ids.a,
            port,
          );
          if (!("inviteId" in competingIssue)) throw Error("COMPETING_INVITE_REQUIRED");
          secondClaim = claimFor(competingIssue.inviteId, competingPerson);
        }
        let ready!: () => void, release!: () => void, secondStarted!: () => void;
        const firstReady = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const releaseFirst = new Promise<void>((resolve) => {
          release = resolve;
        });
        const secondAttempt = new Promise<void>((resolve) => {
          secondStarted = resolve;
        });
        const heldPort = {
          atomic: <T>(
            scope: { actorAccountId: string; tripId: string },
            work: Parameters<typeof port.atomic<T>>[1],
          ) =>
            port.atomic(scope, async (tx) => {
              const result = await work(tx);
              ready();
              await releaseFirst;
              return result;
            }),
        };
        const queuedPort = createTripMemberClaimPgPort(
          {
            withLease: (work) =>
              connection.withLease((lease) =>
                work({
                  retire: () => lease.retire(),
                  query(sql, args) {
                    if (args?.[0] === "lock") secondStarted();
                    return lease.query(sql, args);
                  },
                }),
              ),
          },
          { inviteExpiresAt: new Date(Date.now() + 600000).toISOString() },
        );
        const first = executeMemberClaim(
          order === "revoke-first" ? raceRevoke : raceClaim,
          order === "revoke-first" ? ids.a : ids.b,
          heldPort,
        );
        await firstReady;
        const second = executeMemberClaim(
          order === "claim-first" ? raceRevoke : secondClaim,
          order === "claim-first" ? ids.a : ids.b,
          queuedPort,
        );
        await secondAttempt;
        release();
        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult.status).toBe(
          order === "revoke-first" ? "INVITE_REVOKED" : "LINKED",
        );
        expect(secondResult.status).toBe(order === "claim-race" ? "CONFLICT" : "DENIED");
        expect(
          (
            await query(
              "SELECT count(*)::int AS n FROM public.journey_members WHERE trip_id=$1::uuid AND user_id=$2::uuid AND status='linked'",
              [ids.trip, ids.b],
            )
          ).rows[0].n,
        ).toBe(order === "revoke-first" ? 0 : 1);
        await query(
          "UPDATE public.journey_members SET user_id=NULL,status='unlinked' WHERE trip_id=$1::uuid AND user_id=$2::uuid",
          [ids.trip, ids.b],
        );
      }
      evidence.push(
        "Real two-connection held transaction races: Claim then Revoke; Revoke then Claim; different-Person Claim vs Claim; exactly one connection at most",
      );
      const expiredPerson = randomUUID();
      await personInsert(expiredPerson);
      const expiringPort = createTripMemberClaimPgPort(connection, {
        inviteExpiresAt: new Date(Date.now() + 1000).toISOString(),
      });
      const expiredIssue = await executeMemberClaim(
        issue(expiredPerson),
        ids.a,
        expiringPort,
      );
      if (!("inviteId" in expiredIssue)) throw Error("EXPIRY_INVITE_REQUIRED");
      await query("SELECT pg_sleep(1.1)");
      expect(
        await executeMemberClaim(
          claimFor(expiredIssue.inviteId, expiredPerson),
          ids.b,
          port,
        ),
      ).toEqual({ status: "DENIED" });
      evidence.push("Server expiry rejects Claim without linking");
      expect(
        (
          await query(
            "SELECT has_function_privilege('anon','public.trip_member_claim_transaction(text,jsonb)','EXECUTE') AS anon,has_function_privilege('authenticated','public.trip_member_claim_transaction(text,jsonb)','EXECUTE') AS auth,has_function_privilege('service_role','public.trip_member_claim_transaction(text,jsonb)','EXECUTE') AS service,has_table_privilege('otr_trip_core_v2_gateway','public.trip_directed_invite_targets','SELECT') AS direct",
          )
        ).rows[0],
      ).toEqual({ anon: false, auth: false, service: false, direct: false });
      await expect(
        query("UPDATE public.trip_member_claim_receipts SET outcome='ISSUED'"),
      ).rejects.toThrow();
      evidence.push(
        "Public/Auth/service EXECUTE denied; gateway direct private table read denied; immutable receipt rejects update",
      );
      writeFileSync(
        "docs/ops/auth-c04-20261103/pg-candidate/ISOLATED_PG_RESULT.json",
        JSON.stringify(
          {
            status: "REAL_ISOLATED_PG_PASS_NOT_HOSTED",
            checks: evidence,
            hostedWrites: 0,
            providerCalls: 0,
            normalProviderLoginCertified: false,
            memberRemovalCertified: false,
            fixtureAdministrativeUnlinkIsNotProductionAuthority: true,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      admin.close();
    }
  },
  90000,
);
