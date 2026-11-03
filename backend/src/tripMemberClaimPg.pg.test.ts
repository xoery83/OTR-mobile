import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripMemberClaimPgPort } from "./tripMemberClaimPg";
import {
  executeMemberClaim,
  memberClaimIntentDigest,
  type MemberClaimCommand,
} from "./tripMemberClaimAuthority";
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

it.skipIf(!fixture)(
  "repairs current Hosted read-state denial with scoped Claim admission and recovery",
  async () => {
    if (
      !/^otr-core-v2-test-[a-f0-9]{12}$/.test(fixture!) ||
      process.env.DOCKER_CONTEXT !== "colima" ||
      ["DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"].some(
        (key) => process.env[key],
      )
    )
      throw Error("OWNED_FIXTURE_REQUIRED");
    expect(
      execFileSync(
        "/opt/homebrew/bin/docker",
        [
          "--context",
          "colima",
          "inspect",
          "--format",
          '{{.HostConfig.NetworkMode}}/{{index .Config.Labels "otr.auth.fixture"}}',
          fixture!,
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("none/member-claim");
    const guard = readFileSync(
      "docs/ops/auth-c04-20261103/link-read-state-context/CORE_GUARD_PREIMAGE.sql",
      "utf8",
    );
    expect(createHash("sha256").update(guard).digest("hex")).toBe(
      "41e240f6bd952c95066184fdc916d3fe19bf836eec77f78dcf7a52e69314b1b6",
    );
    const admin = session(fixture!);
    await admin.lease.query("SET ROLE postgres");
    const query = admin.lease.query;
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
      await query(
        "SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.member_claim_gate='OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_V1'",
      );
      await query(
        readFileSync(
          "docs/ops/auth-c04-20261103/pg-candidate/MEMBER_CLAIM_CANDIDATE.sql",
          "utf8",
        ),
      );
      const owner = (
        await query("SELECT created_by FROM public.trips WHERE id=$1::uuid", [ids.trip])
      ).rows[0].created_by as string;
      const person = randomUUID();
      await query(
        "INSERT INTO public.trip_core_read_state(trip_id) VALUES($1::uuid) ON CONFLICT DO NOTHING",
        [ids.trip],
      );
      await query(
        "INSERT INTO public.journey_members(id,trip_id,display_name,role,status) VALUES($1::uuid,$2::uuid,'Synthetic guard regression','group_member','unlinked')",
        [person, ids.trip],
      );
      // These unrelated capabilities deny everything; this is a normal Claim, not Guest/Core/Source admission.
      await query(`CREATE SCHEMA IF NOT EXISTS otr_auth_guest_composite;
        CREATE OR REPLACE FUNCTION otr_auth_guest_composite.read_state_allowed(uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
        DO $fixture$ BEGIN
        IF to_regprocedure('public.trip_core_finite_scope_allowed(uuid,uuid)') IS NULL THEN
          EXECUTE 'CREATE FUNCTION public.trip_core_finite_scope_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql AS ''SELECT false''';END IF;
        IF to_regprocedure('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)') IS NULL THEN
          EXECUTE 'CREATE FUNCTION public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql AS ''SELECT false''';END IF;
        IF to_regprocedure('public.trip_sustained_import_p1_capabilities(uuid,uuid)') IS NULL THEN
          EXECUTE 'CREATE FUNCTION public.trip_sustained_import_p1_capabilities(uuid,uuid) RETURNS TABLE(runtime_enabled boolean,enabled_commands text[],enabled_families text[]) LANGUAGE sql AS ''SELECT false,ARRAY[]::text[],ARRAY[]::text[]''';END IF;
        IF to_regprocedure('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)') IS NULL THEN
          EXECUTE 'CREATE FUNCTION public.trip_create_finite_scope_allowed(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql AS ''SELECT false''';END IF;
        END $fixture$;
        CREATE TABLE IF NOT EXISTS public.trip_source_core_v2_slots(operation_id uuid,intent_sha256 text,account_id uuid,trip_id uuid,output_slot_id uuid,target_id uuid,command text);
        CREATE TABLE IF NOT EXISTS public.trip_create_receipts(actor_account_id uuid,operation_id uuid,trip_id uuid);`);
      await query(guard);
      await query(`REVOKE ALL ON FUNCTION public.trip_core_finite_read_state_guard()
        FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway;
        GRANT EXECUTE ON FUNCTION public.trip_core_finite_read_state_guard() TO otr_trip_core_v2_writer`);
      await query(`CREATE TRIGGER finite_core_read_state_scope BEFORE INSERT OR UPDATE OR DELETE
        ON public.trip_core_read_state FOR EACH ROW EXECUTE FUNCTION public.trip_core_finite_read_state_guard()`);
      let pgFailureMessage = "";
      const connection: CorePgConnection = {
        async withLease(work) {
          const sql = session(fixture!);
          try {
            await sql.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
            return await work({
              ...sql.lease,
              query: async (text, values) => {
                try {
                  return await sql.lease.query(text, values);
                } catch (error) {
                  pgFailureMessage = (error as Error).message;
                  throw error;
                }
              },
            });
          } finally {
            sql.close();
          }
        },
      };
      const port = createTripMemberClaimPgPort(connection, {
        inviteExpiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      const issued = await executeMemberClaim(
        {
          kind: "ISSUE_TARGETED_INVITE",
          operationId: randomUUID(),
          tripId: ids.trip,
          personId: person,
          target: { kind: "REGISTERED_ACCOUNT", accountId: ids.b },
        },
        owner,
        port,
      );
      expect(issued.status).toBe("ISSUED");
      if (issued.status !== "ISSUED") throw Error("FIXTURE_INVITE_UNCONFIRMED");
      const claim: MemberClaimCommand = {
        kind: "CLAIM_PERSON",
        operationId: randomUUID(),
        tripId: ids.trip,
        personId: person,
        inviteId: issued.inviteId,
        explicitConsent: true,
      };
      const before = (
        await query(
          "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
          [ids.trip],
        )
      ).rows;
      const events: unknown[] = [];
      const log = vi.spyOn(console, "info").mockImplementation((value) => {
        events.push(JSON.parse(value));
      });
      try {
        expect(await executeMemberClaim(claim, ids.b, port)).toEqual({
          status: "UNAVAILABLE",
        });
      } finally {
        log.mockRestore();
      }
      expect(pgFailureMessage).toContain("CORE_V2_CAPABILITY_CLOSED");
      // The psql fixture exposes the fixed error label, not a structured SQLSTATE.
      expect(events).toContainEqual({
        event: "member_claim_pg_failed",
        stage: "RPC",
        lastRpcMethod: "link",
        sqlState: null,
      });
      expect(
        (
          await query(
            "SELECT user_id,status FROM public.journey_members WHERE id=$1::uuid",
            [person],
          )
        ).rows,
      ).toEqual([{ user_id: null, status: "unlinked" }]);
      expect(
        (
          await query(
            "SELECT status,claimed_by FROM public.trip_directed_invite_targets WHERE invite_id=$1::uuid",
            [issued.inviteId],
          )
        ).rows,
      ).toEqual([{ status: "PENDING", claimed_by: null }]);
      expect(
        (
          await query(
            "SELECT operation_id FROM public.trip_member_claim_receipts WHERE operation_id=$1::uuid",
            [claim.operationId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await query(
            "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [ids.trip],
          )
        ).rows,
      ).toEqual(before);

      await query(
        "SET otr.auth.member_claim_read_state_gate='OTR_C04_LINK_READ_STATE_V1'",
      );
      const candidateSql = readFileSync(
        "docs/ops/auth-c04-20261103/link-read-state-context/INSTALL_CANDIDATE.sql",
        "utf8",
      );
      // An unexpected default grantee must roll back the whole installation, not be silently retained.
      await query(`CREATE ROLE claim_test_default_grantee NOLOGIN;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO claim_test_default_grantee`);
      const rejectedAclInstall = session(fixture!);
      try {
        await rejectedAclInstall.lease.query(
          "SET ROLE postgres;SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.member_claim_read_state_gate='OTR_C04_LINK_READ_STATE_V1'",
        );
        await expect(rejectedAclInstall.lease.query(candidateSql)).rejects.toThrow(
          "MEMBER_LINK_READ_STATE_HELPER_ACL_DRIFT",
        );
      } finally {
        rejectedAclInstall.close();
      }
      expect(
        (
          await query(
            "SELECT to_regprocedure('public.trip_member_claim_read_state_allowed(uuid)') AS helper",
          )
        ).rows,
      ).toEqual([{ helper: null }]);
      expect(
        (
          await query(
            "SELECT attname FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass AND attname IN ('claim_transaction_id','claim_backend_pid','claim_operation_id') AND NOT attisdropped",
          )
        ).rows,
      ).toEqual([]);
      await query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM claim_test_default_grantee;
        DROP ROLE claim_test_default_grantee`);
      await query(candidateSql);
      const originalClaim: MemberClaimCommand = {
        kind: "CLAIM_PERSON",
        operationId: "4028b673-9032-41c8-807e-c7d3592eae93",
        tripId: "fb2f0820-e429-404a-b4dd-7adcad814e45",
        personId: "bcd1d48e-a9f7-445a-911b-0452ff8dc55a",
        inviteId: "eb671ca9-8610-4b93-aa1d-3e92a7bdbe65",
        explicitConsent: true,
      };
      const sqlDigest = candidateSql.match(/expected_digest:=(.*?);/s)?.[1];
      expect(sqlDigest).toBeTruthy();
      await query("SELECT set_config('otr.core.trip',$1,false)", [originalClaim.tripId]);
      const digest = (
        await query(
          `SELECT ${sqlDigest} AS digest FROM (SELECT $1::jsonb AS payload) p`,
          [
            JSON.stringify({
              operationId: originalClaim.operationId,
              personId: originalClaim.personId,
              inviteId: originalClaim.inviteId,
            }),
          ],
        )
      ).rows[0].digest;
      expect(digest).toBe(memberClaimIntentDigest(originalClaim));
      expect(digest).toBe(
        "b0adb3aed8c226817878acae890cbfb01be8047f9d57ec1da7eac57e466b2a01",
      );
      const noProof = async () =>
        expect(
          (
            await query(
              "SELECT claim_transaction_id,claim_backend_pid,claim_operation_id FROM public.trip_directed_invite_targets WHERE invite_id=$1::uuid",
              [issued.inviteId],
            )
          ).rows,
        ).toEqual([
          {
            claim_transaction_id: null,
            claim_backend_pid: null,
            claim_operation_id: null,
          },
        ]);
      const admission = {
        operationId: claim.operationId,
        intentDigest: memberClaimIntentDigest(claim),
      };
      // A valid digest for another original operation must not produce admission.
      await expect(
        port.atomic({ tripId: ids.trip, actorAccountId: ids.b }, (tx) =>
          tx.link(person, ids.b, issued.inviteId, {
            ...admission,
            operationId: randomUUID(),
          }),
        ),
      ).rejects.toThrow("MEMBER_LINK_ADMISSION_REQUIRED");
      await expect(
        port.atomic({ tripId: ids.trip, actorAccountId: ids.c }, (tx) =>
          tx.link(person, ids.c, issued.inviteId, admission),
        ),
      ).rejects.toThrow();
      await expect(
        port.atomic({ tripId: randomUUID(), actorAccountId: ids.b }, (tx) =>
          tx.link(person, ids.b, issued.inviteId, admission),
        ),
      ).rejects.toThrow();
      await noProof();
      await expect(
        connection.withLease((lease) =>
          lease.query("SELECT public.trip_member_claim_read_state_allowed($1::uuid)", [
            ids.trip,
          ]),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        connection.withLease((lease) =>
          lease.query(
            "UPDATE public.trip_directed_invite_targets SET claim_transaction_id=pg_current_xact_id(),claim_backend_pid=pg_backend_pid(),claim_operation_id=$1::uuid WHERE invite_id=$2::uuid",
            [claim.operationId, issued.inviteId],
          ),
        ),
      ).rejects.toThrow("permission denied");
      await query(`CREATE FUNCTION public.claim_read_state_probe() RETURNS trigger LANGUAGE plpgsql
        SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
          RAISE EXCEPTION 'SYNTHETIC_AFTER_PROOF_FAILURE';END$$;
        CREATE TRIGGER a_claim_read_state_probe AFTER UPDATE OF user_id ON public.journey_members
        FOR EACH ROW WHEN (new.user_id IS NOT NULL) EXECUTE FUNCTION public.claim_read_state_probe()`);
      expect(await executeMemberClaim(claim, ids.b, port)).toEqual({
        status: "UNAVAILABLE",
      });
      await noProof();
      expect(
        (
          await query(
            "SELECT user_id,status FROM public.journey_members WHERE id=$1::uuid",
            [person],
          )
        ).rows,
      ).toEqual([{ user_id: null, status: "unlinked" }]);
      expect(
        (
          await query(
            "SELECT status,claimed_by FROM public.trip_directed_invite_targets WHERE invite_id=$1::uuid",
            [issued.inviteId],
          )
        ).rows,
      ).toEqual([{ status: "PENDING", claimed_by: null }]);
      expect(
        (
          await query(
            "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [ids.trip],
          )
        ).rows,
      ).toEqual(before);
      await query(`CREATE OR REPLACE FUNCTION public.claim_read_state_probe() RETURNS trigger LANGUAGE plpgsql
        SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE saved public.trip_directed_invite_targets%ROWTYPE;BEGIN
        SELECT * INTO STRICT saved FROM public.trip_directed_invite_targets WHERE person_id=new.id AND trip_id=new.trip_id;
        IF NOT public.trip_member_claim_read_state_allowed(new.trip_id) THEN RAISE EXCEPTION 'VALID_PROOF_EXPECTED';END IF;
        UPDATE public.trip_directed_invite_targets SET claim_transaction_id='0'::xid8 WHERE invite_id=saved.invite_id;
        IF public.trip_member_claim_read_state_allowed(new.trip_id) THEN RAISE EXCEPTION 'STALE_TX_ACCEPTED';END IF;
        UPDATE public.trip_directed_invite_targets SET claim_transaction_id=saved.claim_transaction_id,claim_backend_pid=pg_backend_pid()+1 WHERE invite_id=saved.invite_id;
        IF public.trip_member_claim_read_state_allowed(new.trip_id) THEN RAISE EXCEPTION 'FOREIGN_PID_ACCEPTED';END IF;
        UPDATE public.trip_directed_invite_targets SET claim_backend_pid=saved.claim_backend_pid WHERE invite_id=saved.invite_id;
        PERFORM set_config('otr.core.actor','${owner}',true);
        IF public.trip_member_claim_read_state_allowed(new.trip_id) THEN RAISE EXCEPTION 'FOREIGN_ACTOR_ACCEPTED';END IF;
        PERFORM set_config('otr.core.actor',new.user_id::text,true);
        IF public.trip_member_claim_read_state_allowed('99999999-9999-4999-8999-999999999999'::uuid) THEN RAISE EXCEPTION 'FOREIGN_TRIP_ACCEPTED';END IF;
        UPDATE public.trip_directed_invite_targets SET claim_transaction_id=NULL,claim_backend_pid=NULL,claim_operation_id=NULL WHERE invite_id=saved.invite_id;
        IF public.trip_member_claim_read_state_allowed(new.trip_id) THEN RAISE EXCEPTION 'CLEARED_PROOF_ACCEPTED';END IF;
        UPDATE public.trip_directed_invite_targets SET claim_transaction_id=saved.claim_transaction_id,claim_backend_pid=saved.claim_backend_pid,claim_operation_id=saved.claim_operation_id WHERE invite_id=saved.invite_id;
        RETURN NULL;END$$`);
      let commitAckLost = false;
      const lostCommitPort = createTripMemberClaimPgPort(
        {
          withLease: (work) =>
            connection.withLease((lease) =>
              work({
                ...lease,
                query: async (text, values) => {
                  const result = await lease.query(text, values);
                  if (text === "COMMIT" && !commitAckLost) {
                    commitAckLost = true;
                    throw Error("SYNTHETIC_COMMIT_ACK_LOST");
                  }
                  return result;
                },
              }),
            ),
        },
        { inviteExpiresAt: new Date(Date.now() + 600000).toISOString() },
      );
      expect(await executeMemberClaim(claim, ids.b, lostCommitPort)).toEqual({
        status: "UNAVAILABLE",
      });
      expect(commitAckLost).toBe(true);
      expect(await recoverMemberClaimReceipt(claim, ids.b, port)).toMatchObject({
        status: "LINKED",
        currentAccess: "READ",
      });
      await noProof();
      const after = (
        await query(
          "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
          [ids.trip],
        )
      ).rows;
      expect(after).toEqual([
        {
          epoch: before[0].epoch,
          revision: Number(before[0].revision) + 1,
          access_revision: Number(before[0].access_revision) + 1,
        },
      ]);
      expect(await executeMemberClaim(claim, ids.b, port)).toMatchObject({
        status: "LINKED",
        currentAccess: "READ",
      });
      expect(await recoverMemberClaimReceipt(claim, ids.b, port)).toMatchObject({
        status: "LINKED",
        currentAccess: "READ",
      });
      expect(
        (
          await query(
            "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [ids.trip],
          )
        ).rows,
      ).toEqual(after);
      await noProof();
      await query(
        readFileSync(
          "docs/ops/auth-c04-20261103/link-read-state-context/ROLLBACK_CANDIDATE.sql",
          "utf8",
        ),
      );
      expect(
        (
          await query(
            "SELECT to_regprocedure('public.trip_member_claim_read_state_allowed(uuid)') AS helper",
          )
        ).rows,
      ).toEqual([{ helper: null }]);
      expect(
        (
          await query(
            "SELECT attname FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass AND attname IN ('claim_transaction_id','claim_backend_pid','claim_operation_id') AND NOT attisdropped",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await query(
            "SELECT user_id,status FROM public.journey_members WHERE id=$1::uuid",
            [person],
          )
        ).rows,
      ).toEqual([{ user_id: ids.b, status: "linked" }]);
      expect(
        (
          await query(
            "SELECT outcome FROM public.trip_member_claim_receipts WHERE operation_id=$1::uuid",
            [claim.operationId],
          )
        ).rows,
      ).toEqual([{ outcome: "LINKED" }]);
      expect(
        (
          await query(
            "SELECT epoch,revision,access_revision FROM public.trip_core_read_state WHERE trip_id=$1::uuid",
            [ids.trip],
          )
        ).rows,
      ).toEqual(after);
    } finally {
      admin.close();
    }
  },
  90000,
);
