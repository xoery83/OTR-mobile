import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { workbenchHtml } from "./view";

class Element {
  tag: string;
  textContent = "";
  children: Element[] = [];
  value = "";
  hidden = false;
  disabled = false;
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = "";
  href = "";
  src = "";
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...nodes: Element[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Element[]) {
    this.children = nodes;
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
  }
  scrollIntoView() {}
  querySelector(tag: string): Element | undefined {
    return this.children.find((c) => c.tag === tag);
  }
}
function browser() {
  const elements = new Map<string, Element>();
  const context = createContext({
    document: {
      getElementById: (id: string) => {
        if (!elements.has(id)) elements.set(id, new Element("div"));
        return elements.get(id);
      },
      createElement: (tag: string) => new Element(tag),
    },
    localStorage: { getItem: () => null },
    TextEncoder,
    TextDecoder,
  });
  const source = readFileSync(new URL("./client.js", import.meta.url), "utf8");
  const body = source
    .replace(/import \{ runSequentialInputs \} from "\/batch.js";/, "")
    .split("// Event wiring is deliberately separate")[0];
  runInContext(body, context);
  return { context, elements, run: (code: string) => runInContext(code, context) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function nextMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
function allText(e: Element): string {
  return e.textContent + " " + e.children.map(allText).join(" ");
}
function descendants(e: Element): Element[] {
  return [e, ...e.children.flatMap(descendants)];
}
const trace = {
  job: { inputId: "00000000-0000-4000-8000-000000000001", mediaType: "image/jpeg" },
  startedAt: "2026-10-16T01:00:00Z",
  finishedAt: "2026-10-16T01:00:02Z",
  timings: {
    extractionMs: 100,
    deterministicAndCapabilityMs: 200,
    modelDeadlineInclusiveMs: 1700,
  },
  capability: { status: "AVAILABLE" },
  model: { status: "FAILED", reason: "LOCAL_MODEL_EVIDENCE_INVALID" },
  extraction: { text: "航班 NZ 5069", observations: [{ text: "航班 NZ 5069" }] },
  result: {
    text: "航班 NZ 5069",
    status: "PARTIAL_FLIGHT_OBSERVATIONS",
    modelExecution: "FAILED",
    modelReason: "LOCAL_MODEL_EVIDENCE_INVALID",
    fields: [
      {
        path: "service",
        raw: "NZ 5069",
        evidence: [
          {
            start: 7,
            end: 14,
            pages: [],
            boxes: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.1 }],
          },
        ],
      },
    ],
    supplementalServiceObservations: [],
  },
  typed: {
    status: "PARTIAL",
    items: [{ fields: [{ path: "service", raw: "NZ 5069" }], deferred: [] }],
  },
};
describe("human-readable workbench presentation", () => {
  it("uses Chinese by default and keeps raw output in closed developer details", () => {
    const html = workbenchHtml();
    expect(html).toContain('<html lang="zh">');
    expect(html).toMatch(/<details><summary>Developer Details/);
    expect(html).not.toContain("<details open");
    expect(html).not.toContain('<textarea id="labels"');
    expect(html).toContain('id="panel-inspect"');
    expect(html).toContain('id="compare-input"');
    expect(html).toContain('id="run-selected"');
  });
  it("renders actual layered fields without adopting model proposals or invented admission checks", () => {
    const b = browser();
    b.context.run = { id: "run", inputId: trace.job.inputId, trace };
    b.run("renderInspection(run)");
    const text = allText(b.elements.get("inspection")!);
    expect(text).toContain("航班号");
    expect(text).toContain("NZ 5069");
    expect(text).toContain("模型输出未能匹配原文证据");
    expect(text).toContain("被拒绝的模型原始输出未保留");
    expect(text).toContain("本地增强条件仍缺：出发机场、到达机场");
    expect(text).toContain("不是完整 Admission 必填校验");
    expect(text).toContain("解析与模型能力检查合计：0.20 秒");
    expect(text).toContain("证据校验包含在解析／模型处理中，未单独计时");
    expect(text).toContain("诊断工具不提供此步骤");
  });
  it("uses UTF-8 evidence offsets and converts Vision bottom-left coordinates without inventing regions", () => {
    const b = browser();
    b.context.trace = trace;
    b.run(
      `savedInputs = [{ id: trace.job.inputId, name: 'Original.jpg', mediaType: 'image/jpeg' }]; locateEvidence(trace, trace.result.fields[0], trace.job.inputId)`,
    );
    const e = b.elements.get("evidence-view")!;
    expect(allText(e)).toContain("NZ 5069");
    const box = descendants(e).find((n) => n.className === "box")!;
    expect(parseFloat(box.style.top)).toBeCloseTo(60);
    expect(box.style.left).toBe("20%");
    expect(box.style.width).toBe("40%");
    b.run("locateEvidence(trace, {path:'service',raw:'unknown'}, trace.job.inputId)");
    expect(descendants(e).filter((n) => n.className === "box")).toHaveLength(0);
    expect(allText(e)).toContain("没有已记录的文本范围");
  });
  it("displays recorded zero-based PDF pages as one-based only", () => {
    const b = browser();
    b.context.trace = trace;
    b.run(
      `savedInputs = [{ id: trace.job.inputId, name: 'Original.pdf', mediaType: 'application/pdf' }]; locateEvidence(trace, {path:'service',raw:'NZ 5069', evidence:[{start:7,end:14,pages:[0],boxes:[]}]}, trace.job.inputId)`,
    );
    const e = b.elements.get("evidence-view")!;
    expect(allText(e)).toContain("第 1 页");
    expect(descendants(e).find((n) => n.tag === "iframe")!.src).toContain("#page=1");
  });
  it("defaults comparison to two different latest finished runs for the same input", () => {
    const b = browser();
    b.context.runs = [
      { id: "latest", inputId: "file", stage: "FINISHED", createdAt: 30 },
      { id: "earlier", inputId: "file", stage: "FINISHED", createdAt: 20 },
      { id: "old", inputId: "file", stage: "FINISHED", createdAt: 10 },
      { id: "other", inputId: "another", stage: "FINISHED", createdAt: 40 },
    ];
    b.run('el("compare-input").value="file"; latestState={runs}; populateCompareRuns()');
    expect(b.elements.get("a")!.value).toBe("earlier");
    expect(b.elements.get("b")!.value).toBe("latest");
    expect(b.elements.get("a")!.children).toHaveLength(3);
    b.run('el("a").value="latest"; updateCompareControl()');
    expect(b.elements.get("compare")!.disabled).toBe(true);
  });
  it("does not interpret missing ground truth or hypotheses as errors", () => {
    const b = browser();
    b.run('renderStats({status:"N/A",labelKind:"HYPOTHESIS"})');
    expect(allText(b.elements.get("stats")!)).toContain("不计算准确率");
  });
  it("does not score an explicitly empty saved ground-truth list", () => {
    const b = browser();
    b.run(
      'renderStats({status:"HUMAN_LABELLED",tp:0,fp:20,fn:0,precision:0,recall:null})',
    );
    expect(allText(b.elements.get("stats")!)).toContain("不计算准确率");
    expect(allText(b.elements.get("stats")!)).not.toContain("精确匹配率");
  });
  it("compares added and changed values without claiming a locator change is improved quality", () => {
    const b = browser();
    b.context.before = {
      id: "a",
      trace: { ...trace, result: { ...trace.result, modelExecution: "FAILED" } },
    };
    b.context.after = {
      id: "b",
      trace: {
        ...trace,
        result: {
          ...trace.result,
          modelExecution: "SUCCEEDED",
          fields: [{ path: "service", raw: "NZ 5070", evidence: [] }],
        },
      },
    };
    b.run("renderComparison(before,after,{sameFieldEvidence:false})");
    const text = allText(b.elements.get("comparison")!);
    expect(text).toContain("新增值");
    expect(text).toContain("NZ 5070");
    expect(text).toContain("NZ 5069");
    expect(text).toContain("变化字段：航班号");
    expect(text).toContain("定位变化本身不代表质量改善");
    expect(text).toContain("改善：模型建议通过证据校验");
  });
  it("restores saved ground truth through the existing labels endpoint", async () => {
    const b = browser();
    b.context.run = { id: "run", inputId: "file", createdAt: 1, trace };
    b.run(
      'api = async (path) => path.endsWith("/labels") ? {kind:"HUMAN_GROUND_TRUTH", fields:[{path:"service",raw:"NZ 5069"}]} : path.endsWith("/stats") ? {status:"HUMAN_LABELLED",tp:1,fp:0,fn:0,precision:1,recall:1} : run',
    );
    await b.run('inspect("run")');
    const label = b.elements.get("labels")!.children[0];
    expect(label.children.find((n) => n.tag === "select")!.value).toBe("service");
    expect(label.children.find((n) => n.tag === "input")!.value).toBe("NZ 5069");
  });
  it("shows a failed no-trace run without requesting accuracy statistics", async () => {
    const b = browser();
    b.context.calls = [];
    b.run(
      'api = async (path) => {calls.push(path);return {id:"failed",inputId:"file",stage:"FAILED",error:"IOS_CALLER_TIMEOUT",createdAt:1}}',
    );
    await b.run('inspect("failed")');
    expect(b.context.calls).toEqual(["/api/run/failed"]);
    expect(allText(b.elements.get("inspection")!)).toContain("未在限定时间内响应");
    expect(allText(b.elements.get("stats")!)).toContain("不计算准确率");
  });
  it("keeps only B labels when A labels finish after a newer inspection", async () => {
    const b = browser(),
      late = deferred<unknown>();
    b.context.dispatch = async (path: string) => {
      if (path === "/api/run/A/labels") return late.promise;
      if (path.endsWith("/labels"))
        return {
          kind: "HUMAN_GROUND_TRUTH",
          fields: [{ path: "service", raw: "B_VALUE" }],
        };
      if (path.endsWith("/stats")) return { status: "N/A" };
      return { id: path.split("/").pop(), inputId: "file", createdAt: 1, trace };
    };
    b.run("api=dispatch");
    const a = b.run('inspect("A")');
    await nextMicrotasks();
    expect(b.elements.get("save-labels")!.disabled).toBe(true);
    await b.run('inspect("B")');
    late.resolve({
      kind: "HUMAN_GROUND_TRUTH",
      fields: [{ path: "service", raw: "A_VALUE" }],
    });
    await a;
    expect(b.run("selectedRun")).toBe("B");
    const rows = b.elements.get("labels")!.children;
    expect(rows).toHaveLength(1);
    expect(rows[0].children.find((n) => n.tag === "input")!.value).toBe("B_VALUE");
  });
  it("invalidates a pending Inspect when an imported trace is selected", async () => {
    const b = browser(),
      late = deferred<unknown>();
    b.context.dispatch = async (path: string) => {
      if (path === "/api/run/A/labels") return late.promise;
      if (path === "/api/run/A/stats") return { status: "N/A" };
      if (path === "/api/import/imported") return { payload: { trace } };
      return { id: "A", inputId: "file", createdAt: 1, trace };
    };
    b.run("api=dispatch");
    const a = b.run('inspect("A")');
    await nextMicrotasks();
    await b.run('inspectImported("imported")');
    late.resolve({
      kind: "HUMAN_GROUND_TRUTH",
      fields: [{ path: "service", raw: "A_VALUE" }],
    });
    await a;
    expect(b.run("selectedRun")).toBeUndefined();
    expect(b.run("inspectedImported")).toBe(true);
    expect(b.elements.get("labels")!.children).toHaveLength(0);
    expect(b.elements.get("save-labels")!.disabled).toBe(true);
    expect(b.elements.get("export-section")!.hidden).toBe(true);
  });
  it("binds an in-flight save to A even after selecting B and ignores old feedback", async () => {
    const b = browser(),
      post = deferred<unknown>(),
      calls: { path: string; value: unknown }[] = [];
    b.context.dispatch = async (path: string, value: unknown) => {
      calls.push({ path, value });
      if (value) return post.promise;
      if (path.endsWith("/labels"))
        return {
          kind: "HUMAN_GROUND_TRUTH",
          fields: [
            { path: "service", raw: path.includes("/A/") ? "A_VALUE" : "B_VALUE" },
          ],
        };
      if (path.endsWith("/stats"))
        return { status: "N/A", marker: path.includes("/B/") ? "B_STATS" : "A_STATS" };
      return { id: path.split("/").pop(), inputId: "file", createdAt: 1, trace };
    };
    b.run("api=dispatch");
    await b.run('inspect("A")');
    const saving = b.run("saveLabels()");
    await nextMicrotasks();
    await b.run('inspect("B")');
    expect(b.elements.get("save-labels")!.disabled).toBe(true);
    post.resolve({ saved: true });
    await saving;
    const writes = calls.filter((c) => c.value);
    expect(writes).toEqual([
      {
        path: "/api/run/A/labels",
        value: {
          kind: "HUMAN_GROUND_TRUTH",
          fields: [{ path: "service", raw: "A_VALUE" }],
        },
      },
    ]);
    expect(b.run("selectedRun")).toBe("B");
    expect(allText(b.elements.get("stats")!)).toContain("B_STATS");
    expect(allText(b.elements.get("stats")!)).not.toContain("A_STATS");
    expect(b.elements.get("save-labels")!.disabled).toBe(false);
  });
  it("does not render a delayed save-statistics response over another run", async () => {
    const b = browser(),
      lateStats = deferred<unknown>();
    let saved = false;
    b.context.dispatch = async (path: string, value: unknown) => {
      if (value) {
        saved = true;
        return { saved: true };
      }
      if (path === "/api/run/A/stats" && saved) return lateStats.promise;
      if (path.endsWith("/stats")) return { status: "N/A", marker: "B_CURRENT" };
      if (path.endsWith("/labels"))
        return {
          kind: "HUMAN_GROUND_TRUTH",
          fields: [{ path: "service", raw: "VALUE" }],
        };
      return { id: path.split("/").pop(), inputId: "file", createdAt: 1, trace };
    };
    b.run("api=dispatch");
    await b.run('inspect("A")');
    const saving = b.run("saveLabels()");
    await nextMicrotasks();
    await b.run('inspect("B")');
    lateStats.resolve({ status: "N/A", marker: "A_LATE" });
    await saving;
    expect(allText(b.elements.get("stats")!)).toContain("B_CURRENT");
    expect(allText(b.elements.get("stats")!)).not.toContain("A_LATE");
  });
  it("renders hostile file names, values and trace text as literal text nodes", () => {
    const b = browser();
    const hostile = '<img src=x onerror="alert(1)">';
    b.context.trace = {
      ...trace,
      extraction: { text: hostile },
      result: {
        ...trace.result,
        fields: [{ path: "service", raw: hostile, evidence: [] }],
      },
    };
    b.run("renderInspection({trace})");
    const root = b.elements.get("inspection")!;
    expect(allText(root)).toContain(hostile);
    expect(descendants(root).filter((n) => n.tag === "img")).toHaveLength(0);
    expect(readFileSync(new URL("./client.js", import.meta.url), "utf8")).not.toMatch(
      /\.innerHTML\s*=/,
    );
  });
});
