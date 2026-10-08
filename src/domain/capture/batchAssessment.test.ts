import { describe, it, expect, vi } from "vitest";
import {
  assessCaptureBatch,
  captureBatchAssessmentSchema,
  type CaptureProcessingSnapshot,
} from "./batchAssessment";
import { fixture, seal, id, hash, locator, sha256 } from "./__fixtures__/batchAssessment";

const assess = (request: Awaited<ReturnType<typeof fixture>>) =>
  assessCaptureBatch(JSON.stringify(request), sha256);
function independentFinding(snapshot: CaptureProcessingSnapshot) {
  for (const f of snapshot.findings) {
    f.evidence = [locator(id(110))];
    f.dependencies[1] = {
      inputId: id(11),
      relation: "INDEPENDENT",
      evidence: [locator(id(110))],
    };
  }
}
describe("C4a pure batch assessment", () => {
  it("accepts complete N-to-M exact mappings, without preparation/admission/attention authority", async () => {
    const result = await assess(await fixture());
    expect(result.barrier).toBe("ASSESSED_READ_ONLY");
    expect(result.coverage).toHaveLength(2);
    expect(result.findings).toHaveLength(2);
    expect(
      result.findings.every(
        (f) =>
          f.dependencyState === "SUPPORTED_READ_ONLY" &&
          f.provisionalReview === "AVAILABLE_READ_ONLY" &&
          !f.matureActionableAttention,
      ),
    ).toBe(true);
    expect(result.preparation).toBe("NOT_AUTHORIZED");
    expect(result.domainAdmission).toBe("NOT_AUTHORIZED");
    expect(captureBatchAssessmentSchema.safeParse(result).success).toBe(true);
  });
  it("supports one declaration mapped into multiple bounded Runs", async () => {
    const r = await fixture();
    const b = structuredClone(r.snapshot.inputs[0].bindings[0]);
    b.runId = id(51);
    b.runGeneration = 2;
    b.pin.id = id(112);
    b.runInputSha256 = hash(51);
    r.snapshot.inputs[0].bindings.push(b);
    expect((await assess(await seal(r))).coverage[0].bindings).toHaveLength(2);
  });
  it.each(["FAILED", "PENDING", "UNKNOWN"] as const)(
    "retains partial acquisition %s, distinct from processing",
    async (state) => {
      const r = await fixture();
      const input = r.snapshot.inputs[1];
      input.acquisition = { state };
      input.processing = "NOT_APPLICABLE";
      input.bindings = [];
      independentFinding(r.snapshot);
      const result = await assess(await seal(r));
      expect(result.coverage[1].acquisition.state).toBe(state);
      expect(result.reasons).toContainEqual({
        inputId: id(11),
        reason: `ACQUISITION_${state}`,
      });
      expect(result.barrier).toBe(state === "FAILED" ? "ASSESSED_READ_ONLY" : "PENDING");
      // Retain observed facts without certifying caller-asserted independence.
      expect(result.findings[0].evidence).toEqual([locator(id(110))]);
      expect(result.findings[0].dependencyState).toBe("BLOCKED");
      expect(result.findings[0].reasons).toContain("DEPENDENCY_UNKNOWN");
      expect(result.findings[0].provisionalReview).toBe("UNAVAILABLE");
      expect(result.domainAdmission).toBe("NOT_AUTHORIZED");
    },
  );
  it.each(["FAILED", "UNSUPPORTED", "DEFERRED", "PENDING", "UNKNOWN"] as const)(
    "distinguishes accepted processing %s",
    async (state) => {
      const r = await fixture();
      r.snapshot.inputs[1].processing = state;
      independentFinding(r.snapshot);
      r.snapshot.findings[0].dependencies[1] = {
        inputId: id(11),
        relation: "DEPENDS_ON",
      };
      const result = await assess(await seal(r));
      expect(result.findings[0].dependencyState).toBe("BLOCKED");
      expect(result.findings[0].provisionalReview).toBe("UNAVAILABLE");
      expect(result.findings[1].dependencyState).toBe("BLOCKED");
      expect(result.findings[1].reasons).toEqual(["DEPENDENCY_UNKNOWN"]);
      expect(result.findings[1].provisionalReview).toBe("UNAVAILABLE");
      expect(result.findings[1].evidence).toEqual([locator(id(110))]);
      expect(result.findings.every((f) => !f.matureActionableAttention)).toBe(true);
      expect(result.barrier).toBe(
        ["PENDING", "UNKNOWN"].includes(state) ? "PENDING" : "ASSESSED_READ_ONLY",
      );
    },
  );
  it("unknown dependency never implies independence", async () => {
    const r = await fixture();
    r.snapshot.findings[0].evidence = [locator(id(110))];
    r.snapshot.findings[0].dependencies[1] = { inputId: id(11), relation: "UNKNOWN" };
    const result = await assess(await seal(r));
    expect(result.findings[0].reasons).toEqual(["DEPENDENCY_UNKNOWN"]);
    expect(result.findings[0].provisionalReview).toBe("UNAVAILABLE");
  });
  it("R1: replacing UNKNOWN with INDEPENDENT cannot promote an unexamined Input", async () => {
    const r = await fixture();
    r.snapshot.inputs[1].acquisition = { state: "UNKNOWN" };
    r.snapshot.inputs[1].processing = "NOT_APPLICABLE";
    r.snapshot.inputs[1].bindings = [];
    independentFinding(r.snapshot);
    r.snapshot.findings[0].dependencies[1] = { inputId: id(11), relation: "UNKNOWN" };
    const unknown = await assess(await seal(r));
    r.snapshot.findings[0].dependencies[1] = {
      inputId: id(11),
      relation: "INDEPENDENT",
      evidence: [locator(id(110))],
    };
    const asserted = await assess(await seal(r));
    expect(asserted.findings).toEqual(unknown.findings);
    expect(asserted.findings[0].dependencyState).toBe("BLOCKED");
    expect(asserted.findings[0].provisionalReview).toBe("UNAVAILABLE");
    expect(asserted.findings[0].reasons).toEqual(["DEPENDENCY_UNKNOWN"]);
    expect(asserted.findings[0].evidence).toEqual([locator(id(110))]);
    expect(asserted.barrier).toBe("PENDING");
    expect(asserted.preparation).toBe("NOT_AUTHORIZED");
    expect(asserted.domainAdmission).toBe("NOT_AUTHORIZED");
    expect(asserted.findings[0].matureActionableAttention).toBe(false);
  });
  it("R1: even fully understood material cannot establish independence from a declaration", async () => {
    const r = await fixture();
    independentFinding(r.snapshot);
    const result = await assess(await seal(r));
    expect(result.barrier).toBe("ASSESSED_READ_ONLY");
    expect(
      result.findings.every(
        (f) => f.dependencyState === "BLOCKED" && f.provisionalReview === "UNAVAILABLE",
      ),
    ).toBe(true);
    expect(result.findings.every((f) => f.reasons.includes("DEPENDENCY_UNKNOWN"))).toBe(
      true,
    );
  });
  it("preserves explicit decisions and historical evidence; later contradictions cannot replace them", async () => {
    const r = await fixture();
    r.snapshot.decisions.push({
      id: id(80),
      accountId: id(1),
      candidateId: id(160),
      proposalSha256: hash(999),
      decisionSha256: hash(80),
      revision: 3,
    });
    r.snapshot.historicalEvidence.push({
      accountId: id(1),
      batchId: id(99),
      runId: id(98),
      runGeneration: 2,
      pins: [r.snapshot.inputs[0].bindings[0].pin],
    });
    const result = await assess(await seal(r));
    expect(result.decisions).toEqual(r.snapshot.decisions);
    expect(result.historicalEvidence).toEqual(r.snapshot.historicalEvidence);
    expect(result.findings[0].reasons).toContain("HUMAN_DECISION_CONFLICT");
    expect(result.findings[0].decisionIds).toEqual([id(80)]);
    expect(result.findings[0].provisionalReview).toBe("UNAVAILABLE");
  });
  it("unchanged answered evidence does not ask the same provisional question again", async () => {
    const r = await fixture();
    r.snapshot.decisions.push({
      id: id(80),
      accountId: id(1),
      candidateId: id(160),
      proposalSha256: hash(60),
      decisionSha256: hash(80),
      revision: 1,
    });
    const result = await assess(await seal(r));
    expect(result.findings[0].reasons).toEqual([]);
    expect(result.findings[0].provisionalReview).toBe("UNAVAILABLE");
  });
  it("freezes all returned facts while leaving caller-owned input editable", async () => {
    const r = await fixture();
    const result = await assess(r);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.coverage[0].bindings[0].pin)).toBe(true);
    expect(() => result.coverage.push(result.coverage[0])).toThrow();
    r.snapshot.inputs[0].bindings[0].pin.byte_count = 19;
    expect(result.coverage[0].bindings[0].pin.byte_count).toBe(20);
  });
  it("snapshots before async hashing so caller mutation cannot transplant the result", async () => {
    const r = await fixture();
    let changed = false;
    const result = await assessCaptureBatch(JSON.stringify(r), async (bytes) => {
      if (!changed) {
        changed = true;
        r.current.accountId = id(999);
        r.snapshot.inputs.length = 0;
      }
      return sha256(bytes);
    });
    expect(result.accountId).toBe(id(1));
    expect(result.coverage).toHaveLength(2);
  });
  it("is deterministic, normalizes coverage/findings ordering, and preserves declaration order", async () => {
    const a = await fixture();
    const b = await fixture();
    b.snapshot.inputs.reverse();
    b.snapshot.findings.reverse();
    b.current.inputRevisions.reverse();
    const x = await assess(a),
      y = await assess(await seal(b));
    expect(await assess(a)).toEqual(x);
    expect(y.coverage).toEqual(x.coverage);
    expect(y.findings).toEqual(x.findings);
    expect(y.reasons).toEqual(x.reasons);
    expect(y.snapshotSha256).not.toBe(x.snapshotSha256); // exact wire snapshot digest
  });
  it("retains a fully accounted failure without inventing absence, questions or admission", async () => {
    const r = await fixture();
    for (const i of r.snapshot.inputs) {
      i.acquisition = { state: "FAILED" };
      i.processing = "NOT_APPLICABLE";
      i.bindings = [];
    }
    r.snapshot.findings = [];
    const result = await assess(await seal(r));
    expect(result.coverage).toHaveLength(2);
    expect(result.reasons).toHaveLength(2);
    expect(result.findings).toEqual([]);
    expect(result.domainAdmission).toBe("NOT_AUTHORIZED");
  });
  it("isolates Account A to B to A invocations without cached authorization", async () => {
    const r = await fixture();
    expect((await assess(r)).accountId).toBe(id(1));
    r.current.accountId = id(999);
    await expect(assess(r)).rejects.toThrow("C4A_ACCOUNT_MISMATCH");
    r.current.accountId = id(1);
    expect((await assess(r)).accountId).toBe(id(1));
  });
  it("rejects contradictory pins for one Candidate identity", async () => {
    const r = await fixture();
    r.snapshot.findings[1].candidate.id = r.snapshot.findings[0].candidate.id;
    await expect(assess(await seal(r))).rejects.toThrow("C4A_CANDIDATE_PIN_MISMATCH");
  });
  it("rejects finite but oversized nested evidence before hashing", async () => {
    const r = await fixture();
    for (const f of r.snapshot.findings) {
      f.evidence = Array.from({ length: 64 }, () => ({
        ...locator(id(110)),
        excerpt: "x".repeat(2000),
      }));
      f.dependencies[1] = {
        inputId: id(11),
        relation: "INDEPENDENT",
        evidence: f.evidence,
      };
    }
    r.snapshot.findings = Array.from({ length: 8 }, (_, n) => ({
      ...r.snapshot.findings[0],
      id: id(1000 + n),
    }));
    await expect(
      assessCaptureBatch(JSON.stringify(r), async () => {
        throw new Error("hash should not run");
      }),
    ).rejects.toThrow("C4A_RESOURCE_LIMIT");
  });
  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite content counts %s",
    async (count) => {
      const r = await fixture();
      r.snapshot.inputs[0].bindings[0].pin.byte_count = count;
      await expect(assess(r)).rejects.toThrow();
    },
  );
  it("R2: plain fixture wire data remains accepted through strict JSON grammar", async () => {
    const r = await fixture();
    expect((await assessCaptureBatch(JSON.stringify(r), sha256)).coverage).toHaveLength(
      2,
    );
  });
  it.each(["root", "nested", "array"] as const)(
    "R2: rejects hidden and symbol fields at %s without hashing",
    async (where) => {
      for (const kind of ["hidden", "symbol"] as const) {
        const r = await fixture();
        const target =
          where === "root"
            ? r
            : where === "nested"
              ? r.snapshot.inputs[0]
              : r.snapshot.inputs;
        if (kind === "hidden")
          Object.defineProperty(target, "authorize", { value: true });
        else Object.assign(target, { [Symbol("authorize")]: true });
        const digest = vi.fn(sha256);
        await expect(assessCaptureBatch(r, digest)).rejects.toThrow(
          "C4A_RAW_INPUT_INVALID",
        );
        expect(digest).not.toHaveBeenCalled();
      }
    },
  );
  it.each(["accessor", "custom prototype", "class", "proxy", "revoked proxy"] as const)(
    "R2: rejects root and nested %s before inspection or hashing",
    async (kind) => {
      for (const nested of [false, true]) {
        const r = await fixture();
        const read = vi.fn(() => {
          throw new Error("must not inspect");
        });
        let target: object = nested ? r.snapshot : r;
        if (kind === "accessor")
          Object.defineProperty(target, "authorize", { get: read, enumerable: true });
        if (kind === "custom prototype")
          Object.setPrototypeOf(target, { authorize: true });
        if (kind === "class") {
          class Contract {}
          target = Object.assign(new Contract(), target);
        }
        if (kind === "proxy")
          target = new Proxy(target, { get: read, getPrototypeOf: read, ownKeys: read });
        if (kind === "revoked proxy") {
          const p = Proxy.revocable(target, {});
          p.revoke();
          target = p.proxy;
        }
        const digest = vi.fn(sha256);
        const raw = nested ? { ...r, snapshot: target } : target;
        await expect(assessCaptureBatch(raw, digest)).rejects.toThrow(
          "C4A_RAW_INPUT_INVALID",
        );
        expect(read).not.toHaveBeenCalled();
        expect(digest).not.toHaveBeenCalled();
      }
    },
  );
  it("R2: rejects transparent proxies including nested arrays without traversing them", async () => {
    const r = await fixture();
    await expect(assessCaptureBatch(new Proxy(r, {}), sha256)).rejects.toThrow(
      "C4A_RAW_INPUT_INVALID",
    );
    r.snapshot.inputs = new Proxy(r.snapshot.inputs, {});
    await expect(assessCaptureBatch(r, sha256)).rejects.toThrow("C4A_RAW_INPUT_INVALID");
  });
  it.each([
    '{"manifest":{},"manifest":{}}',
    '{"snapshot":{"authorize":true,"authorize":false}}',
    '{"n":NaN}',
    '{"n":1e2}',
    '{"n":-0}',
    '{"n":1.5}',
    '{"x":"\\u0000"}',
    '{"x":"\\ud800"}',
    "[1,]",
    "{} trailing",
  ])("R2: rejects invalid raw JSON grammar %s before hashing", async (raw) => {
    const digest = vi.fn(sha256);
    await expect(assessCaptureBatch(raw, digest)).rejects.toThrow(
      "C4A_RAW_INPUT_INVALID",
    );
    expect(digest).not.toHaveBeenCalled();
  });
  it("R2: rejects excessive wire bytes and depth before schema/hashing", async () => {
    const digest = vi.fn(sha256);
    await expect(assessCaptureBatch(" ".repeat(1_048_577), digest)).rejects.toThrow(
      "C4A_RESOURCE_LIMIT",
    );
    await expect(
      assessCaptureBatch("[".repeat(34) + "0" + "]".repeat(34), digest),
    ).rejects.toThrow("C4A_RAW_INPUT_INVALID");
    expect(digest).not.toHaveBeenCalled();
  });
  const invalid: [string, (r: Awaited<ReturnType<typeof fixture>>) => void, string?][] = [
    [
      "missing declared coverage",
      (r) => {
        r.snapshot.inputs.pop();
      },
      "C4A_COVERAGE_INVALID",
    ],
    [
      "duplicate coverage",
      (r) => {
        r.snapshot.inputs.push(r.snapshot.inputs[0]);
      },
      "C4A_DUPLICATE_MAPPING",
    ],
    [
      "foreign cross-batch Input",
      (r) => {
        r.snapshot.inputs[0].inputId = id(999);
      },
      "C4A_COVERAGE_INVALID",
    ],
    [
      "duplicate roster Input",
      (r) => {
        r.manifest.inputs[1].inputId = r.manifest.inputs[0].inputId;
      },
      "C4A_DUPLICATE_MAPPING",
    ],
    [
      "duplicate replay key",
      (r) => {
        r.manifest.inputs[1].replayKey = r.manifest.inputs[0].replayKey;
      },
      "C4A_DUPLICATE_MAPPING",
    ],
    [
      "changed roster order",
      (r) => {
        r.manifest.inputs.reverse();
      },
      "C4A_ROSTER_INVALID",
    ],
    [
      "self continuation",
      (r) => {
        r.manifest.inputs[0].continuesFromInputId = id(10);
      },
      "C4A_ROSTER_INVALID",
    ],
    [
      "Batch Job alias",
      (r) => {
        r.manifest.jobId = id(2);
      },
      "C4A_IDENTITY_ALIAS",
    ],
    [
      "snapshot wrong Account",
      (r) => {
        r.snapshot.accountId = id(99);
      },
      "C4A_ACCOUNT_MISMATCH",
    ],
    [
      "current wrong Account",
      (r) => {
        r.current.accountId = id(99);
      },
      "C4A_ACCOUNT_MISMATCH",
    ],
    [
      "foreign Run Account",
      (r) => {
        r.snapshot.inputs[0].bindings[0].accountId = id(99);
      },
      "C4A_ACCOUNT_MISMATCH",
    ],
    [
      "foreign Run Batch",
      (r) => {
        r.snapshot.inputs[0].bindings[0].batchId = id(99);
      },
      "C4A_BATCH_MISMATCH",
    ],
    [
      "cross-batch snapshot",
      (r) => {
        r.snapshot.batchId = id(99);
      },
      "C4A_BATCH_MISMATCH",
    ],
    [
      "stale manifest",
      (r) => {
        r.snapshot.manifestVersion++;
      },
      "C4A_STALE_REVISION",
    ],
    [
      "stale assessment",
      (r) => {
        r.snapshot.assessmentRevision++;
      },
      "C4A_STALE_REVISION",
    ],
    [
      "stale per-Input",
      (r) => {
        r.current.inputRevisions[0].revision++;
      },
      "C4A_STALE_REVISION",
    ],
    [
      "incomplete current fence",
      (r) => {
        r.current.inputRevisions.pop();
      },
      "C4A_COVERAGE_INVALID",
    ],
    [
      "duplicate binding",
      (r) => {
        r.snapshot.inputs[0].bindings.push(r.snapshot.inputs[0].bindings[0]);
      },
      "C4A_DUPLICATE_MAPPING",
    ],
    [
      "inconsistent Run generation",
      (r) => {
        r.snapshot.inputs[1].bindings[0].runGeneration++;
      },
      "C4A_RUN_PIN_MISMATCH",
    ],
    [
      "inconsistent Run hash",
      (r) => {
        r.snapshot.inputs[1].bindings[0].runInputSha256 = hash(99);
      },
      "C4A_RUN_PIN_MISMATCH",
    ],
    [
      "original content mismatch",
      (r) => {
        r.snapshot.inputs[0].bindings[0].originalSha256 = hash(99);
      },
      "C4A_CONTENT_PIN_MISMATCH",
    ],
    [
      "accepted not-applicable",
      (r) => {
        r.snapshot.inputs[0].processing = "NOT_APPLICABLE";
      },
      "C4A_INCONSISTENT_DISPOSITION",
    ],
    [
      "unaccepted claimed processing",
      (r) => {
        r.snapshot.inputs[0].acquisition = { state: "FAILED" };
      },
      "C4A_INCONSISTENT_DISPOSITION",
    ],
    [
      "understood without mapping",
      (r) => {
        r.snapshot.inputs[0].bindings = [];
      },
      "C4A_INCONSISTENT_DISPOSITION",
    ],
    [
      "omitted dependency",
      (r) => {
        r.snapshot.findings[0].dependencies.pop();
      },
      "C4A_COVERAGE_INVALID",
    ],
    [
      "duplicate dependency",
      (r) => {
        r.snapshot.findings[0].dependencies[1] = r.snapshot.findings[0].dependencies[0];
      },
      "C4A_DUPLICATE_MAPPING",
    ],
    [
      "false independent support",
      (r) => {
        r.snapshot.findings[0].dependencies[0] = {
          inputId: id(10),
          relation: "INDEPENDENT",
          evidence: [locator(id(111))],
        };
      },
      "C4A_DEPENDENCY_INCONSISTENT",
    ],
    [
      "unmapped evidence",
      (r) => {
        r.snapshot.findings[0].evidence[0].input_id = id(999);
      },
      "C4A_EVIDENCE_INVALID",
    ],
    [
      "span outside pinned bytes",
      (r) => {
        r.snapshot.findings[0].evidence[0].end = 21;
      },
      "C4A_EVIDENCE_INVALID",
    ],
    [
      "empty span",
      (r) => {
        r.snapshot.findings[0].evidence[0].end = 0;
      },
      "C4A_EVIDENCE_INVALID",
    ],
    [
      "candidate wrong Run",
      (r) => {
        r.snapshot.findings[0].candidate.run_id = id(999);
      },
      "C4A_RUN_PIN_MISMATCH",
    ],
    [
      "candidate stale Run hash",
      (r) => {
        r.snapshot.findings[0].candidate.input_sha256 = hash(99);
      },
      "C4A_RUN_PIN_MISMATCH",
    ],
    [
      "malformed Input UUID",
      (r) => {
        r.snapshot.inputs[0].inputId = "bad";
      },
    ],
    [
      "malformed digest",
      (r) => {
        r.snapshot.manifestSha256 = "bad";
      },
    ],
    [
      "unsafe revision",
      (r) => {
        r.snapshot.assessmentRevision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "zero Run generation",
      (r) => {
        r.snapshot.inputs[0].bindings[0].runGeneration = 0;
      },
    ],
    [
      "forged manifest digest",
      (r) => {
        r.snapshot.manifestSha256 = hash(999);
      },
      "C4A_MANIFEST_DIGEST_MISMATCH",
    ],
    [
      "modified snapshot content",
      (r) => {
        r.snapshot.findings[0].question = "NONE";
      },
      "C4A_SNAPSHOT_DIGEST_MISMATCH",
    ],
  ];
  it.each(invalid)("rejects %s", async (_name, mutate, code) => {
    const r = await fixture();
    mutate(r);
    await expect(assess(r)).rejects.toThrow(code);
  });
  it("rejects foreign decision/history Accounts and preserves no alias permission", async () => {
    const r = await fixture();
    r.snapshot.decisions.push({
      id: id(80),
      accountId: id(2),
      candidateId: id(160),
      proposalSha256: hash(60),
      decisionSha256: hash(80),
      revision: 1,
    });
    await expect(assess(await seal(r))).rejects.toThrow("C4A_ACCOUNT_MISMATCH");
    r.snapshot.decisions = [];
    r.snapshot.historicalEvidence.push({
      accountId: id(2),
      batchId: id(90),
      runId: id(80),
      runGeneration: 1,
      pins: [r.snapshot.inputs[0].bindings[0].pin],
    });
    await expect(assess(await seal(r))).rejects.toThrow("C4A_ACCOUNT_MISMATCH");
  });
  it("rejects unknown schema keys and more than 64 declarations", async () => {
    const r = await fixture();
    await expect(
      assessCaptureBatch(JSON.stringify({ ...r, authorize: true }), sha256),
    ).rejects.toThrow();
    for (let n = 12; n < 75; n++)
      r.manifest.inputs.push({
        inputId: id(n + 500),
        replayKey: id(n + 600),
        ordinal: n - 10,
        continuesFromInputId: null,
      });
    await expect(assess(r)).rejects.toThrow();
  });
  it("rejects aggregate binding count above 64 even if every per-Input list is bounded", async () => {
    const r = await fixture();
    for (const i of r.snapshot.inputs)
      for (let n = 0; n < 32; n++) {
        const b = structuredClone(i.bindings[0]);
        b.pin.id = id(5000 + r.snapshot.inputs.indexOf(i) * 100 + n);
        i.bindings.push(b);
      }
    await expect(assess(r)).rejects.toThrow("C4A_RESOURCE_LIMIT");
  });
});
