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
  private identifier = "";
  register?: (id: string, element: Element) => void;
  set id(value: string) {
    this.identifier = value;
    this.register?.(value, this);
  }
  get id() {
    return this.identifier;
  }
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
      createElement: (tag: string) => {
        const e = new Element(tag);
        e.register = (id, n) => elements.set(id, n);
        return e;
      },
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
  schema: "OTR_IMPORT_DIAGNOSTIC_TRACE",
  version: 1,
  runtime: "IOS_DIAGNOSTIC_COMPONENT",
  admission: "NOT_AVAILABLE",
  sourceAuthority: "NONE",
  remote: "NOT_USED",
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
    projectionKind: "CURRENT_PARSER_READ",
    status: "PARTIAL",
    items: [
      {
        schema_id: "otr.import.flight",
        token: "item",
        fields: [{ path: "service", raw: "NZ 5069" }],
        deferred: [],
      },
    ],
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
    expect(text).toContain("模型输出证据校验失败");
    expect(text).toContain("被拒绝的模型原始输出未保留");
    expect(text).toContain("本地增强条件仍缺：出发机场、到达机场");
    expect(text).toContain("不是完整 Admission");
    expect(text).toContain("解析与模型能力检查合计：0.20 秒");
    expect(text).toContain("证据校验包含在解析／模型处理中，未单独计时");
    expect(text).toContain("Admission：未运行");
  });
  it("uses UTF-8 evidence offsets and converts Vision bottom-left coordinates without inventing regions", () => {
    const b = browser();
    b.context.trace = trace;
    b.run(
      `savedInputs = [{ id: trace.job.inputId, name: 'Original.jpg', mediaType: 'image/jpeg' }]; selectField(trace, trace.result.fields[0], trace.job.inputId)`,
    );
    const e = b.elements.get("document-preview")!;
    expect(allText(e)).toContain("NZ 5069");
    const box = descendants(e).find((n) => n.className === "box")!;
    expect(parseFloat(box.style.top)).toBeCloseTo(60);
    expect(box.style.left).toBe("20%");
    expect(box.style.width).toBe("40%");
    b.run("selectField(trace, {path:'service',raw:'unknown'}, trace.job.inputId)");
    expect(descendants(e).filter((n) => n.className === "box")).toHaveLength(0);
    expect(allText(e)).toContain("未记录精确文本范围");
  });
  it("displays recorded zero-based PDF pages as one-based only", () => {
    const b = browser();
    b.context.trace = trace;
    b.run(
      `savedInputs = [{ id: trace.job.inputId, name: 'Original.pdf', mediaType: 'application/pdf' }]; selectField(trace, {path:'service',raw:'NZ 5069', evidence:[{start:7,end:14,pages:[0],boxes:[]}]}, trace.job.inputId)`,
    );
    const e = b.elements.get("document-preview")!;
    expect(allText(e)).toContain("记录页码：1");
    expect(allText(e)).toContain("页数未记录");
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
    const label = descendants(b.elements.get("labels")!).find(
      (n) => n.className === "label-row",
    )!;
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
    const rows = descendants(b.elements.get("labels")!).filter(
      (n) => n.className === "label-row",
    );
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
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      path: "/api/run/A/labels",
      value: {
        kind: "HUMAN_GROUND_TRUTH",
        fields: [{ path: "service", raw: "A_VALUE" }],
        annotation: {
          results: [
            { fields: [{ path: "service", raw: "A_VALUE", status: "CONFIRMED" }] },
          ],
        },
      },
    });
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
  it("shows normalized flight type and places instead of the shared raw route", () => {
    const b = browser();
    b.context.fields = [
      { path: "transport_subtype", raw: "NZ 5069", normalized: "FLIGHT", evidence: [] },
      {
        path: "origin.place_label",
        raw: "Auckland to Nelson",
        normalized: "Auckland",
        evidence: [],
      },
      {
        path: "destination.place_label",
        raw: "Auckland to Nelson",
        normalized: "Nelson",
        evidence: [],
      },
    ];
    b.context.trace = trace;
    b.run('fieldTable(el("table"),fields,trace,"file")');
    const rows = b.elements.get("table")!.children[0].children;
    expect(rows[1].children[1].textContent).toBe("航班");
    expect(rows[2].children[1].textContent).toBe("Auckland");
    expect(rows[3].children[1].textContent).toBe("Nelson");
    expect(allText(b.elements.get("table")!)).not.toContain("Auckland to Nelson");
    b.context.run = {
      trace: {
        ...trace,
        typed: { status: "PARTIAL", items: [{ fields: b.context.fields }] },
      },
    };
    b.run("renderInspection(run)");
    const typed = descendants(b.elements.get("inspection")!).find(
      (n) => (n as Element & { id: string }).id === "parsed-results",
    )!;
    expect(allText(typed)).toContain("交通类型");
    expect(allText(typed)).toContain("航班");
    expect(allText(typed)).toContain("出发地点");
    expect(allText(typed)).toContain("Auckland");
    const displayed = descendants(typed)
      .filter((n) => n.tag === "td")
      .map((n) => n.textContent)
      .join(" ");
    expect(displayed).not.toContain("Auckland to Nelson");
  });
  it("formats existing service / airport / clock values but retains the raw evidence span", () => {
    const b = browser();
    expect(
      b.run(
        'fieldValue({path:"service",raw:"Flight: NZ 5069",normalized:{service_literal:"NZ 5069"}})',
      ),
    ).toBe("NZ 5069");
    expect(
      b.run(
        'fieldValue({path:"origin.airport",raw:"AKL -> NSN",normalized:{namespace:"IATA_AIRPORT",value:"AKL"}})',
      ),
    ).toBe("AKL");
    expect(
      b.run(
        'fieldValue({path:"origin.local_time",raw:"departure: 01:27 PM",normalized:{value:"13:27",precision:-1,quality:"EXACT"}})',
      ),
    ).toBe("13:27");
    const raw = "departure: 01:27 PM";
    b.context.clockTrace = { result: { text: raw } };
    b.context.clockField = {
      path: "origin.local_time",
      raw,
      normalized: { value: "13:27" },
      evidence: [{ start: 0, end: new TextEncoder().encode(raw).length }],
    };
    b.run('selectField(clockTrace,clockField,"unattached")');
    expect(allText(b.elements.get("document-preview")!)).toContain(raw);
  });
  it("does not invent a normalized value when null or unknown", () => {
    const b = browser();
    expect(
      b.run('fieldValue({path:"origin.local_date",normalized:null,raw:"date: someday"})'),
    ).toBe("未确定");
    expect(b.run('fieldValue({path:"origin.local_date",raw:"date: someday"})')).toBe(
      "原文：date: someday",
    );
    expect(
      b.run(
        'fieldValue({path:"service",normalized:{unknown:"x"},raw:"Flight: unknown"})',
      ),
    ).toBe("原文：Flight: unknown");
  });
  it("provides all five workspaces and an actual three-column inspector", () => {
    const html = workbenchHtml();
    for (const key of ["test", "inspect", "compare", "ground", "runs"])
      expect(html).toContain(`id="panel-${key}"`);
    const b = browser();
    b.context.run = { trace };
    b.run("renderInspection(run)");
    const root = b.elements.get("inspection")!;
    expect(descendants(root).some((n) => n.className === "inspector-columns")).toBe(true);
    for (const key of ["document-preview", "parsed-results", "field-chain"])
      expect(b.elements.get(key)).toBeDefined();
  });
  it("shows zero interpretations without fabricating a Booking or diagnosing unsupported content from prose", () => {
    const b = browser();
    b.context.run = {
      trace: {
        ...trace,
        result: { ...trace.result, fields: [], supplementalServiceObservations: [] },
        typed: { items: [] },
      },
    };
    b.run("renderInspection(run)");
    const text = allText(b.elements.get("inspection")!);
    expect(text).toContain("解释结果 × 0");
    expect(text).toContain("未发现可用的旅行预订信息");
    expect(text).toContain("不代表未支持的文件没有旅行内容");
    expect(text).not.toContain("Booking × 1");
  });
  it("does not turn unknown actual schema output into a flight result", () => {
    const b = browser();
    b.context.run = {
      trace: {
        ...trace,
        typed: {
          items: [
            {
              schema_id: "unknown.real.output",
              fields: [{ path: "property_name", raw: "Real provided value" }],
            },
          ],
        },
      },
    };
    b.run("renderInspection(run)");
    expect(allText(b.elements.get("parsed-results")!)).toContain("未分类解释");
    expect(allText(b.elements.get("parsed-results")!)).toContain("Real provided value");
  });
  it("distinguishes Not Run from Not Recorded and does not invent consolidation", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      remote: "NOT_USED",
      admission: "NOT_AVAILABLE",
      result: { ...trace.result, modelExecution: "NOT_RUN" },
    };
    b.run("renderFieldChain(trace,trace.result.fields[0],trace.job.inputId)");
    const text = allText(b.elements.get("field-chain")!);
    expect(text).toContain("未运行");
    expect(text).toContain("未记录独立汇总处理步骤");
    expect(text).toContain("不代表用户确认或正式准入");
  });
  it("uses real PDF page previews and thumbnails with no fabricated rectangles", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      extraction: {
        text: "document",
        pages: [
          { pageIndex: 0, start: 0, end: 3 },
          { pageIndex: 1, start: 4, end: 8 },
        ],
      },
    };
    b.run(
      'savedInputs=[{id:trace.job.inputId,name:"Real.pdf",mediaType:"application/pdf"}];renderDocumentPreview(trace,trace.job.inputId,{path:"service",evidence:[{pages:[1]}]})',
    );
    const nodes = descendants(b.elements.get("document-preview")!);
    expect(nodes.some((n) => n.tag === "img" && n.src.endsWith("/preview?page=2"))).toBe(
      true,
    );
    expect(nodes.filter((n) => n.className === "box")).toHaveLength(0);
    expect(nodes.filter((n) => n.tag === "img")).toHaveLength(3);
  });
  it("roundtrips zero / multiple annotation results, segments and participant labels without business writes", () => {
    const b = browser();
    b.context.annotation = {
      documentStatus: "RESULTS",
      results: [
        {
          id: "gt-a",
          type: "FLIGHT",
          status: "CONFIRMED",
          fields: [
            {
              path: "service",
              raw: "NZ 5069",
              status: "CONFIRMED",
              participantId: "Traveller A",
            },
          ],
          segments: [
            {
              id: "leg-1",
              fields: [{ path: "origin.airport", raw: "AKL", status: "NOT_PROVIDED" }],
            },
          ],
        },
        {
          id: "gt-b",
          type: "STAY",
          status: "UNREVIEWED",
          fields: [{ path: "property_name", raw: "", status: "UNCHECKED" }],
          segments: [],
        },
      ],
    };
    b.run("annotationDraft=annotation;renderAnnotationForm()");
    expect(b.run("readAnnotationForm()")).toEqual(b.context.annotation);
    b.run(
      'annotationDraft={documentStatus:"NO_RELEVANT_CONTENT",results:[]};renderAnnotationForm()',
    );
    expect(b.run("readAnnotationForm()")).toEqual({
      documentStatus: "NO_RELEVANT_CONTENT",
      results: [],
    });
  });
  it("displays stage statistics separately without inventing rejection / required counts", () => {
    const b = browser();
    b.context.run = { trace };
    b.run("renderInspection(run)");
    const text = allText(b.elements.get("inspection")!);
    expect(text).toContain("拒绝字段数：未记录");
    expect(text).toContain("必填缺项总数：未记录");
    b.run('renderMatrix(el("matrix"),run.trace)');
    expect(allText(b.elements.get("matrix")!)).toContain("不是完整 Admission 校验");
  });
  it("treats a checked no-content annotation as inapplicable, not unlabelled or inaccurate", () => {
    const b = browser();
    b.run(
      'renderStats({status:"N/A",annotationSummary:{documentStatus:"NO_RELEVANT_CONTENT",resultCount:0,segmentCount:0,confirmedFields:0,notProvidedFields:0,uncheckedFields:0,wrongTypeResults:0}})',
    );
    const text = allText(b.elements.get("stats")!);
    expect(text).toContain("已人工标注无相关内容");
    expect(text).not.toContain("未标注／仅推测");
    expect(text).not.toContain("0.0%");
  });
  it("preserves a selected failed no-trace run in the Inspect history selector", () => {
    const b = browser();
    b.run(
      'el("inspect-input").value="file";inspected={id:"failed",inputId:"file"};latestState={runs:[{id:"new",inputId:"file",createdAt:2,stage:"FINISHED"},{id:"failed",inputId:"file",createdAt:1,stage:"FAILED"}]};populateInspectionRuns()',
    );
    expect(b.elements.get("inspect-run")!.value).toBe("failed");
  });
  it("commits the inspected file/run selectors with the matching body without a polling refresh", async () => {
    const b = browser(),
      pdfLabels = deferred<unknown>(),
      jpgLabels = deferred<unknown>();
    b.context.dispatch = async (path: string) => {
      if (path === "/api/run/PDF/labels") return pdfLabels.promise;
      if (path === "/api/run/JPG/labels") return jpgLabels.promise;
      if (path.endsWith("/stats")) return { status: "N/A" };
      return {
        id: path.endsWith("PDF") ? "PDF" : "JPG",
        inputId: path.endsWith("PDF") ? "pdf" : "jpg",
        createdAt: 1,
        trace,
      };
    };
    b.run(
      'api=dispatch;savedInputs=[{id:"jpg",name:"Original.jpg"},{id:"pdf",name:"Original.pdf"}];latestState={runs:[{id:"JPG",inputId:"jpg",createdAt:2,stage:"FINISHED"},{id:"PDF",inputId:"pdf",createdAt:1,stage:"FINISHED"}]};el("inspect-input").value="jpg";populateInspectionRuns()',
    );
    const pdf = b.run('inspect("PDF")');
    await nextMicrotasks();
    pdfLabels.resolve(null);
    await pdf;
    expect(b.elements.get("inspect-input")!.value).toBe("pdf");
    expect(b.elements.get("inspect-run")!.value).toBe("PDF");
    expect(allText(b.elements.get("inspection")!)).toContain("Original.pdf");
    const jpg = b.run('inspect("JPG")');
    await nextMicrotasks();
    jpgLabels.resolve(null);
    await jpg;
    expect(b.elements.get("inspect-input")!.value).toBe("jpg");
    expect(b.elements.get("inspect-run")!.value).toBe("JPG");
    expect(allText(b.elements.get("inspection")!)).toContain("Original.jpg");
  });
  it("keeps actual local observations separate from inferred Bookings, Segments and expected annotations", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      typed: {
        ...trace.typed,
        items: [
          ...trace.typed.items,
          { schema_id: "otr.import.flight", token: "second", fields: [], deferred: [] },
        ],
      },
    };
    b.run(
      'renderBusinessStructure(el("structure"),trace,"one-input");renderExpectedStructure(el("expected"))',
    );
    const actual = allText(b.elements.get("structure")!);
    expect(actual).toContain("局部观察：2");
    expect(actual).toContain("未提供／未执行");
    expect(actual).toContain("此诊断路径未生成");
    expect(actual).toContain("正式 Typed 组装／完整性评估未运行");
    expect(actual).toContain("不是完整性评分");
    expect(actual).toContain("跨 Input 预订关联、身份匹配与去重未记录");
    expect(allText(b.elements.get("expected")!)).toContain("尚未保存人工业务结构");
    b.run(
      'inspectedLabels={annotation:{documentStatus:"RESULTS",results:[{type:"FLIGHT",fields:[],segments:[{id:"human-one",fields:[]},{id:"human-two",fields:[]}]}]}};renderExpectedStructure(el("expected"))',
    );
    expect(allText(b.elements.get("expected")!)).toContain("2 个预期分段");
    expect(actual).not.toContain("2 个预期分段");
  });
  it("reports five Apple statuses without mistaking output-evidence failure for an unavailable engine", () => {
    const b = browser();
    b.context.trace = trace;
    b.run('renderAppleDiagnostic(el("apple"),trace)');
    const text = allText(b.elements.get("apple")!);
    expect(text).toContain("能力可用性：可用");
    expect(text).toContain("已记录 enrich 调用");
    expect(text).toContain("推断：校验失败路径证明曾产生可解析输出");
    expect(text).toContain("模型输出证据校验失败");
    expect(text).toContain("具体原因未保留");
    expect(text).toContain("实际保留贡献：0");
    expect(text).toContain("不能据此认定模型引擎不可用");
    expect(text).toContain("只请求航班号字面值");
    const info = b.run("appleDiagnostic(trace)");
    expect(info).toMatchObject({ invoked: true, invalidEvidence: true, retained: 0 });
  });
  it("shows a recorded exact evidence failure instead of guessing a model outage", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      model: { ...trace.model, evidenceFailure: "MULTIPLE_LITERAL_MATCHES" },
    };
    b.run('renderAppleDiagnostic(el("apple"),trace)');
    const text = allText(b.elements.get("apple")!);
    expect(text).toContain("输出字面值在原文多处出现，证据锚点不唯一");
    expect(text).not.toContain("具体原因未保留");
  });
  it("marks model output as not recorded for a timeout and never fabricates rejected literal values", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      model: { status: "FAILED", reason: "LOCAL_MODEL_TIMEOUT", observations: [] },
      result: { ...trace.result, modelReason: "LOCAL_MODEL_TIMEOUT" },
    };
    b.run('renderAppleDiagnostic(el("apple"),trace)');
    const text = allText(b.elements.get("apple")!);
    expect(text).toContain("调用失败本身不能证明是否产生过输出");
    expect(text).not.toContain("校验失败路径证明");
  });
  it("shows model supplements as retained observations rather than complete booking interpretation", () => {
    const b = browser();
    b.context.trace = {
      ...trace,
      model: {
        status: "SUCCEEDED",
        observations: [{ literal: "AA 101", start: 0, end: 6 }],
      },
      result: {
        ...trace.result,
        modelExecution: "SUCCEEDED",
        modelReason: "VERBATIM_SERVICE_EVIDENCE_ONLY",
        supplementalServiceObservations: [{ literal: "AA 101", start: 0, end: 6 }],
      },
    };
    b.run('renderAppleDiagnostic(el("apple"),trace)');
    const text = allText(b.elements.get("apple")!);
    expect(text).toContain("实际保留贡献：1 条补充观察");
    expect(text).toContain("不消费这些模型补充观察");
    expect(text).not.toContain("生成 1 个 Booking");
  });
  it("does not manufacture producer attribution for an incompatible imported trace", () => {
    const b = browser();
    b.context.trace = { result: { fields: [] }, typed: { items: [] } };
    b.run('renderBusinessStructure(el("unknown"),trace,"input")');
    const text = allText(b.elements.get("unknown")!);
    expect(text).toContain("未记录");
    expect(text).not.toContain("runImportDiagnostic →");
    expect(b.run("appleDiagnostic(trace).invoked")).toBeNull();
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

it("keeps model deadline, cancel, generation, transport and evidence explanations distinct", () => {
  const b = browser();
  const labels = [
    "LOCAL_MODEL_APP_TIMEOUT",
    "LOCAL_MODEL_CANCELLED",
    "LOCAL_MODEL_GENERATION_ERROR",
    "LOCAL_MODEL_GENERATION_DECODE",
    "LOCAL_MODEL_TRANSPORT_PARSE",
    "LOCAL_MODEL_EVIDENCE_REJECTED",
  ].map((reason) => b.run(`reasonText(${JSON.stringify(reason)})`));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels.every((label) => !String(label).includes("开发者详情"))).toBe(true);
});
