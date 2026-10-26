import { createHash } from "node:crypto";
import { readUniversalP1Catalog } from "../universalP1SourcePg";
import { readCorePgGraph } from "../tripCoreV2PgStorage";
// Explicit read-only operator preflight for the already authorized synthetic QA scope.
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { tripCreateRuntimePath, tripCreateRuntimeSchema } from "../tripCreateRuntime";
import { createCorePgConnection } from "../tripCoreV2PgConnection";
import { loadDevUniversalContinuousRuntime } from "../universalContinuousRuntime";
const actor = "f4b059c5-8241-4ffb-aa15-37fa25474543",
  trip = "825f79b2-4a9d-4535-a62e-43000ca50c4a",
  source = "0c71927f-3f3b-4612-a49e-333761e90441",
  batch = "bd0d6ea6-7870-48a9-b74b-779a46783609",
  task = "861a9d47-a35b-87a6-99f1-98422493d76b";
async function main() {
  if (
    process.env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
    process.env.OTR_P1_VERIFIED_QA_ACTOR !== actor ||
    process.env.OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW === "enabled"
  )
    throw Error("READ_ONLY_QA_PRECONDITION");
  const file = await open(
    tripCreateRuntimePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let config;
  try {
    const s = await file.stat();
    if (
      !s.isFile() ||
      s.uid !== 0 ||
      s.gid !== 999 ||
      (s.mode & 0o777) !== 0o440 ||
      s.nlink !== 1 ||
      s.size > 139264
    )
      throw Error("RUNTIME_BOUNDARY");
    config = tripCreateRuntimeSchema.parse(JSON.parse(await file.readFile("utf8")));
  } finally {
    await file.close();
  }
  if (config.version !== 3) throw Error("SUSTAINED_DEV_REQUIRED");
  const runtime = await loadDevUniversalContinuousRuntime(process.env);
  if (!runtime) throw Error("UNIVERSAL_CLOSED");
  const start = Date.now();
  try {
    await createCorePgConnection(config.corePg).withLease(async (physical) => {
      let queryCount = 0;
      const lease = {
        retire: () => physical.retire(),
        query: async (sql: string, args?: readonly unknown[]) => {
          queryCount++;
          return physical.query(sql, args);
        },
      };
      await lease.query("BEGIN");
      try {
        await lease.query(
          "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
          [actor, trip],
        );
        const lock = (
          await lease.query(
            "SELECT public.trip_core_lock_source_scope($1::uuid,$2::uuid,$3::uuid) AS allowed",
            [actor, trip, source],
          )
        ).rows[0];
        if (lock?.allowed !== true) throw Error("SOURCE_ACCESS_DENIED");
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
        const scope = {
          actorAccountId: actor,
          tripId: trip,
          sourceId: source,
          planId: "628753a7-26a1-8aa6-810c-ed812f18701f",
        };
        const hash = async (b: Uint8Array) =>
          createHash("sha256").update(b).digest("hex");
        const catalog = await readUniversalP1Catalog(
          lease,
          scope,
          ["44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67"],
          hash,
          runtime.readPublished,
        );
        if (
          catalog.candidates[0].candidateSha256 !==
          "8e00c75508b15f8efc72446d09579db6803f962b80973e560136f86e0a1a7494"
        )
          throw Error("CANDIDATE_CHANGED");
        for (let i = 0; i < 2; i++) {
          const p = await runtime.readPublished(
            { actorAccountId: actor, tripId: trip, batchId: batch, taskId: task },
            lease,
          );
          if (
            p?.resultSha256 !==
            "596f244c81110efb459524c4d5eff78fe5a1bee135fc97b1fa49e31605672198"
          )
            throw Error("PUBLISHED_RESULT_MISMATCH");
        }
        await readCorePgGraph(lease, trip);
        await readCorePgGraph(lease, trip);
        // Calibrate the measured Core transaction's 83 SQL round trips without any business mutation.
        while (queryCount < 83)
          await lease.query(
            "SELECT current_setting('otr.core.actor',true) AS actor,current_setting('otr.core.trip',true) AS trip",
          );
        console.log(
          JSON.stringify({
            status: "LOCKED_CORE_FULL_PUBLISHED_READ_RTT_PROBE_PASS",
            elapsedMs: Date.now() - start,
            queryCount,
            sourceCandidateReprojection: true,
            publishedReads: 3,
            coreGraphReads: 2,
            businessWrites: 0,
            providerCalls: 0,
            activation: false,
            scope: "READ_ONLY_CALIBRATION_NOT_CORE_MUTATION_PASS",
          }),
        );
      } finally {
        await lease.query("ROLLBACK");
      }
    });
  } finally {
    await runtime.close();
  }
}
main().catch(() => {
  console.log(
    JSON.stringify({
      status: "LOCKED_CORE_FULL_PUBLISHED_READ_UNCONFIRMED",
      businessWrites: 0,
      providerCalls: 0,
    }),
  );
  process.exitCode = 1;
});
