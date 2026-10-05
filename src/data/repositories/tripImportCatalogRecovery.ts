import type { TripImportCatalogName } from "@/data/api/tripImportCatalogContracts";
import { importDigest, type ImportHash } from "@/domain/trip/flightImportReview";
import type { Json } from "@/domain/trip/eventIntentJson";
type Row = Record<string, unknown>;
export const importCatalogKeys: Record<TripImportCatalogName, string[]> = {
  trip_sources: ["id"],
  trip_source_revisions: ["source_id", "material_revision"],
  trip_source_representations: ["id"],
  trip_source_runs: ["id"],
  trip_source_confirmations: ["id"],
  trip_source_inputs: ["id"],
  trip_source_candidates: ["id"],
  trip_source_output_slots: ["slot_id"],
  trip_source_associations: ["id"],
  trip_source_run_predecessors: ["child_run_id", "parent_run_id"],
  trip_source_candidate_lineage: ["child_candidate_id", "parent_candidate_id"],
  trip_source_slot_lineage_dispositions: [
    "slot_id",
    "ancestor_candidate_id",
    "ancestor_slot_key",
  ],
  trip_source_slot_dependencies: ["slot_id", "predecessor_slot_id"],
};
export const importCatalogMutableColumns: Record<TripImportCatalogName, string[]> = {
  trip_sources: [
    "row_revision",
    "lifecycle",
    "current_material_revision",
    "retention_state",
    "deleted_at",
    "deleted_by",
  ],
  trip_source_revisions: ["retention_state"],
  trip_source_representations: [
    "row_revision",
    "remote_state",
    "verified_at",
    "retention_state",
    "text_content",
    "locator_uri",
    "storage_provider",
    "storage_bucket",
    "object_key",
    "payload_sha256",
    "byte_count",
    "original_filename",
  ],
  trip_source_runs: ["row_revision", "superseded_by", "retention_state"],
  trip_source_confirmations: ["row_revision", "state", "retention_state"],
  trip_source_inputs: [],
  trip_source_candidates: ["proposal", "retention_state"],
  trip_source_output_slots: [
    "state",
    "dispatched_at",
    "receipt_ref",
    "result_target_kind",
    "result_target_id",
    "result_revision",
    "receipt_sha256",
    "finalization_state",
    "failure_code",
    "retention_state",
    "create_claim_active",
    "no_commit_basis",
    "no_commit_receipt_ref",
    "no_commit_receipt_sha256",
    "no_commit_at",
  ],
  trip_source_associations: [
    "row_revision",
    "state",
    "inactive_reason",
    "inactive_at",
    "inactive_by",
  ],
  trip_source_run_predecessors: [],
  trip_source_candidate_lineage: [],
  trip_source_slot_lineage_dispositions: [],
  trip_source_slot_dependencies: [],
};
const fail = (): never => {
  throw new Error("IMPORT_CATALOG_INTEGRITY");
};
export async function validateImportSnapshot(
  actor: string,
  trip: string,
  c: Record<TripImportCatalogName, Row[]>,
  hash: ImportHash,
) {
  const maps = {} as Record<TripImportCatalogName, Map<string, Row>>;
  const key = (table: TripImportCatalogName, row: Row) =>
    JSON.stringify(importCatalogKeys[table].map((k) => row[k]));
  for (const table of Object.keys(importCatalogKeys) as TripImportCatalogName[]) {
    if (c[table].length > 64) fail();
    const m = new Map<string, Row>();
    for (const row of c[table]) {
      const k = key(table, row);
      if (m.has(k)) fail();
      m.set(k, row);
    }
    maps[table] = m;
  }
  const get = (table: TripImportCatalogName, ...ids: unknown[]) =>
    maps[table].get(JSON.stringify(ids)) ?? fail();
  const source = (id: unknown) => get("trip_sources", id);
  const owner = (table: "trip_source_runs" | "trip_source_confirmations", id: unknown) =>
    get(table, id);
  const parents = (rows: Row[], child: string, parent: string) => {
    const edges = new Map<unknown, unknown[]>();
    for (const r of rows)
      edges.set(r[child], [...(edges.get(r[child]) ?? []), r[parent]]);
    const done = new Set<unknown>();
    function walk(id: unknown, path: Set<unknown>) {
      if (path.has(id)) fail();
      if (done.has(id)) return;
      if (path.size >= 64) fail();
      for (const p of edges.get(id) ?? []) walk(p, new Set([...path, id]));
      done.add(id);
    }
    for (const id of edges.keys()) walk(id, new Set());
  };
  for (const s of c.trip_sources) {
    if (s.trip_id !== trip || s.acquired_by !== actor) fail();
    get("trip_source_revisions", s.id, s.current_material_revision);
  }
  for (const r of c.trip_source_revisions) {
    source(r.source_id);
    if (r.created_by !== actor) fail();
    if (r.previous_revision !== null) {
      get("trip_source_revisions", r.source_id, r.previous_revision);
      if (Number(r.previous_revision) >= Number(r.material_revision)) fail();
    }
    for (const id of r.original_representation_ids as string[]) {
      const rep = get("trip_source_representations", id);
      if (rep.source_id !== r.source_id || rep.role !== "ORIGINAL") fail();
    }
    if (r.origin_source_id !== null)
      get("trip_source_revisions", r.origin_source_id, r.origin_material_revision);
  }
  for (const r of c.trip_source_representations) {
    source(r.source_id);
    get("trip_source_revisions", r.source_id, r.introduced_revision);
    for (const id of r.parent_ids as string[]) {
      if (get("trip_source_representations", id).source_id !== r.source_id) fail();
    }
    if (r.material_kind === "TEXT" && r.retention_state === "RETAINED") {
      if (typeof r.text_content !== "string") fail();
      const bytes = new TextEncoder().encode(r.text_content as string);
      if (bytes.length !== r.byte_count || (await hash(bytes)) !== r.payload_sha256)
        fail();
    }
  }
  parents(
    c.trip_source_representations.flatMap((r) =>
      (r.parent_ids as string[]).map((parent) => ({ child: r.id, parent })),
    ),
    "child",
    "parent",
  );
  for (const table of ["trip_source_runs", "trip_source_confirmations"] as const)
    for (const r of c[table])
      if (r.trip_id !== trip || r.actor_account_id !== actor) fail();
  for (const r of c.trip_source_runs) {
    for (const id of r.scope_source_ids as string[]) source(id);
    if (r.superseded_by !== null) owner("trip_source_runs", r.superseded_by);
    if (
      r.scope_sha256 !==
      (await importDigest(
        "otr-source-run-scope-v1",
        [1, trip, actor, r.scope_source_ids] as Json,
        hash,
      ))
    )
      fail();
  }
  for (const i of c.trip_source_inputs) {
    if ((i.run_id === null) === (i.confirmation_id === null)) fail();
    owner(
      i.run_id === null ? "trip_source_confirmations" : "trip_source_runs",
      i.run_id ?? i.confirmation_id,
    );
    source(i.source_id);
    get("trip_source_revisions", i.source_id, i.material_revision);
    const r = get("trip_source_representations", i.representation_id);
    if (r.source_id !== i.source_id) fail();
  }
  for (const p of c.trip_source_candidates) {
    owner("trip_source_runs", p.run_id);
    if (
      p.retention_state === "RETAINED" &&
      (p.proposal === null ||
        p.proposal_sha256 !==
          (await importDigest("otr-source-candidate-v1", p.proposal as Json, hash)))
    )
      fail();
  }
  const operations = new Set<unknown>();
  for (const s of c.trip_source_output_slots) {
    owner("trip_source_confirmations", s.confirmation_id);
    if (s.reviewed_run_id !== null) owner("trip_source_runs", s.reviewed_run_id);
    if (
      s.candidate_id !== null &&
      get("trip_source_candidates", s.candidate_id).run_id !== s.reviewed_run_id
    )
      fail();
    if (s.domain_operation_key !== null) {
      if (operations.has(s.domain_operation_key)) fail();
      operations.add(s.domain_operation_key);
    }
    if (
      s.disposition === "CREATE" &&
      s.create_claim_active === false &&
      s.no_commit_basis === null
    )
      fail();
    if (
      s.no_commit_basis === "VERIFIED_TERMINAL_RECEIPT" &&
      (s.no_commit_receipt_sha256 === null || s.no_commit_receipt_ref === null)
    )
      fail();
  }
  for (const r of c.trip_source_associations) {
    source(r.source_id);
    if (r.created_by !== actor) fail();
    if (r.confirmation_id !== null) owner("trip_source_confirmations", r.confirmation_id);
    if (r.preview_input_id !== null) {
      const i = get("trip_source_inputs", r.preview_input_id);
      if (
        i.source_id !== r.source_id ||
        i.material_revision !== r.preview_source_revision ||
        i.representation_id !== r.preview_representation_id
      )
        fail();
    }
  }
  for (const r of c.trip_source_run_predecessors) {
    owner("trip_source_runs", r.child_run_id);
    owner("trip_source_runs", r.parent_run_id);
  }
  parents(c.trip_source_run_predecessors, "child_run_id", "parent_run_id");
  const runAncestors = (id: unknown) => {
    const seen = new Set<unknown>();
    const pending = [id];
    while (pending.length) {
      const next = pending.pop();
      for (const edge of c.trip_source_run_predecessors) {
        if (edge.child_run_id !== next || seen.has(edge.parent_run_id)) continue;
        seen.add(edge.parent_run_id);
        if (seen.size > 64) fail();
        pending.push(edge.parent_run_id);
      }
    }
    return seen;
  };
  for (const r of c.trip_source_candidate_lineage) {
    const child = get("trip_source_candidates", r.child_candidate_id),
      parent = get("trip_source_candidates", r.parent_candidate_id);
    if (!runAncestors(child.run_id).has(parent.run_id)) fail();
  }
  parents(c.trip_source_candidate_lineage, "child_candidate_id", "parent_candidate_id");
  for (const r of c.trip_source_slot_lineage_dispositions) {
    get("trip_source_output_slots", r.slot_id);
    get("trip_source_candidates", r.ancestor_candidate_id);
    if (r.reviewed_by !== actor) fail();
  }
  for (const r of c.trip_source_slot_dependencies) {
    const s = get("trip_source_output_slots", r.slot_id),
      p = get("trip_source_output_slots", r.predecessor_slot_id);
    if (
      p.receipt_sha256 !== r.expected_receipt_sha256 ||
      p.result_target_id !== r.expected_target_id ||
      p.result_revision !== r.expected_result_revision ||
      s.intended_target_id !== r.expected_target_id ||
      s.base_revision !== r.expected_result_revision
    )
      fail();
  }
  parents(c.trip_source_slot_dependencies, "slot_id", "predecessor_slot_id");
}
