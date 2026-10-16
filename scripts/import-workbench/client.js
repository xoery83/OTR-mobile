// eslint-disable-next-line import/no-unresolved -- Fixed loopback route transpiles batch.ts.
import { runSequentialInputs } from "/batch.js";
/* Diagnostic presentation only. Untrusted data never enters innerHTML. */
let language = localStorage.getItem("otr-workbench-language") || "zh";
let selectedRun,
  inspected,
  latestState,
  batchRunning = false;
let inspectedImported = false;
let inspectedLabels;
let lastComparison;
let selectedField,
  selectedFieldSource = "deterministic",
  resultView = "structure",
  previewPage = 1,
  previewZoom = 100,
  previewManuallyChosen = false;
let inspectionSequence = 0,
  inspectionLoading = false,
  labelSaving = false;
let savedInputs = [];
const selectedInputs = new Set(),
  seenInputs = new Set();
const el = (id) => document.getElementById(id);
const message = (en, zh) => (language === "zh" ? zh : en);
const fieldNames = {
  transport_subtype: ["Transport type", "交通类型"],
  service: ["Flight number", "航班号"],
  operating_service: ["Operating flight", "实际承运航班"],
  "origin.airport": ["Departure airport", "出发机场"],
  "destination.airport": ["Arrival airport", "到达机场"],
  "origin.place_label": ["Departure place", "出发地点"],
  "destination.place_label": ["Arrival place", "到达地点"],
  "origin.local_date": ["Departure date", "出发日期"],
  "destination.local_date": ["Arrival date", "到达日期"],
  "origin.local_time": ["Departure time", "出发时间"],
  "destination.local_time": ["Arrival time", "到达时间"],
  "origin.zone_id": ["Departure time zone", "出发时区"],
  "destination.zone_id": ["Arrival time zone", "到达时区"],
  "origin.supplied_offset_seconds": ["Departure UTC offset", "出发 UTC 偏移"],
  "destination.supplied_offset_seconds": ["Arrival UTC offset", "到达 UTC 偏移"],
  "origin.source_instant": ["Departure instant", "出发时刻"],
  "destination.source_instant": ["Arrival instant", "到达时刻"],
  supplier_occurrence: ["Supplier occurrence", "供应方班次信息"],
  change_notice: ["Schedule change notice", "行程变更通知"],
};
function fieldName(path) {
  const pair = fieldNames[path];
  return pair ? message(...pair) : message("Other extracted field", "其他识别字段");
}
function fieldValue(field) {
  if (Object.prototype.hasOwnProperty.call(field, "normalized")) {
    const value = field.normalized;
    if (value === null) return message("Undetermined", "未确定");
    if (field.path === "transport_subtype" && value === "FLIGHT")
      return message("Flight", "航班");
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    if (value && typeof value === "object") {
      if (
        ["service", "operating_service"].includes(field.path) &&
        typeof value.service_literal === "string"
      )
        return value.service_literal;
      if (typeof value.value === "string" || typeof value.value === "number")
        return String(value.value);
    }
  }
  return message("Original text: ", "原文：") + (field.raw ?? field.literal ?? "");
}

const readableStates = {
  FINISHED: ["Completed — inspect quality below", "运行完成 — 请查看下方质量"],
  FAILED: ["Run failed", "运行失败"],
  INTERRUPTED: ["Interrupted; run again", "运行中断，可重新运行"],
  EXTRACTING: ["Reading document", "正在读取文件"],
  DETERMINISTIC: ["Matching travel fields", "正在识别旅行字段"],
  APPLE_MODEL: ["Apple model running", "Apple 模型推理中"],
  TYPED_PROJECTION: ["Building typed interpretation", "正在整理航班结构"],
  QUEUED: ["Waiting to run", "等待运行"],
  PARTIAL: ["Partial interpretation", "部分解析结果"],
  PARTIAL_FLIGHT_OBSERVATIONS: ["Partial travel information", "已识别部分旅行信息"],
  TEXT_ONLY: ["Text extracted; no flight fields yet", "已提取文本，尚无航班字段"],
  SUCCEEDED: ["Succeeded", "成功"],
  NOT_RUN: ["Not run", "未运行"],
  UNAVAILABLE: ["Unavailable", "不可用"],
  AVAILABLE: ["Available", "可用"],
};
function readableState(value) {
  return readableStates[value]
    ? message(...readableStates[value])
    : message("In progress or unknown", "处理中或状态未知");
}
function reasonText(reason) {
  const reasons = {
    LOCAL_MODEL_EVIDENCE_INVALID: [
      "Model output did not match the original text evidence. Deterministic results are retained.",
      "模型输出证据校验失败，确定性结果已保留。",
    ],
    LOCAL_MODEL_TIMEOUT: [
      "Local model timed out; deterministic results are retained.",
      "本地模型超时，确定性结果已保留。",
    ],
    CAPABILITY_NOT_INSTALLED: [
      "The installed Native runner does not include the Apple model capability.",
      "已安装的 Native Runner 不包含 Apple 模型能力。",
    ],
    CAPABILITY_UNAVAILABLE: [
      "The current environment reports the Apple model as unavailable.",
      "当前环境报告 Apple 模型不可用。",
    ],
    LOCAL_MODEL_UNAVAILABLE: [
      "Apple model resources are unavailable; deterministic results are retained.",
      "Apple 模型资源不可用，确定性结果已保留。",
    ],
    LOCAL_MODEL_OUTPUT_INVALID: [
      "The model response did not match the required response structure; deterministic results are retained.",
      "模型响应不符合要求的结构，确定性结果已保留。",
    ],
    LOCAL_MODEL_OUTPUT_LIMIT: [
      "The model response exceeded the output limit; deterministic results are retained.",
      "模型响应超出输出限制，确定性结果已保留。",
    ],
    LOCAL_MODEL_FAILED: [
      "Apple model execution failed; deterministic results are retained. This alone does not identify a permission or resource cause.",
      "Apple 模型执行失败，确定性结果已保留；仅此状态不足以判定权限或资源原因。",
    ],
    CONFIRMED_VALUE_REQUIRED: [
      "Enter a value for every confirmed field, or mark it Not checked / Not provided.",
      "请为每个已确认字段填写值，或改为“尚未检查／原件未提供”。",
    ],
    PDF_TEXT_UNAVAILABLE: [
      "This PDF has an unreadable or text-free page. The current PDFKit runner does not OCR scanned PDF pages; image OCR is available separately.",
      "此 PDF 包含不可读或无文本页面。当前 PDFKit Runner 不对扫描 PDF 页面执行 OCR，图片 OCR 可单独使用。",
    ],
    PDF_INVALID: [
      "PDF extraction failed; this is not a no-travel-content result.",
      "PDF 提取失败，不能当作无旅行内容。",
    ],
    LOCAL_MODEL_INPUT_LIMIT: [
      "Text exceeds the local model input limit; extracted results remain available.",
      "文本超出本地模型输入限制，已有提取结果仍保留。",
    ],
    IOS_CALLER_TIMEOUT: [
      "The iOS runner did not respond before the deadline.",
      "iOS Runner 未在限定时间内响应。",
    ],
    REQUEST_REJECTED: ["The request could not be completed.", "请求未能完成。"],
    INPUT_LIMIT: [
      "Choose a non-empty file no larger than 10 MiB.",
      "请选择非空且不超过 10 MiB 的文件。",
    ],
    MEDIA_UNSUPPORTED: [
      "Choose PDF, JPEG, PNG or UTF-8 text.",
      "请选择 PDF、JPEG、PNG 或 UTF-8 文本。",
    ],
  };
  return reasons[reason]
    ? message(...reasons[reason])
    : message(
        "This step could not complete. See the recorded reason in Developer Details.",
        "此步骤未能完成，原始原因保留在开发者详情。 ",
      );
}
function node(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = String(text);
  if (className) n.className = className;
  return n;
}
function show(value) {
  el("output").textContent = JSON.stringify(value, null, 2);
}
function fail(error) {
  el("notice").textContent = reasonText(error.message);
  show({ error: error.message });
}
function button(text, action) {
  const b = node("button", text);
  b.type = "button";
  b.onclick = () => Promise.resolve().then(action).catch(fail);
  return b;
}
function translate() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-en]").forEach((n) => {
    n.textContent = n.dataset[language];
  });
}
function tab(name) {
  for (const key of ["test", "inspect", "compare", "ground", "runs"]) {
    el("panel-" + key).hidden = key !== name;
    el("tab-" + key).setAttribute("aria-selected", String(key === name));
  }
}
async function api(path, value) {
  const response = await fetch(
    path,
    value === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "REQUEST_REJECTED");
  return data;
}
function inputName(id) {
  return (
    savedInputs.find((i) => i.id === id)?.name || message("Imported document", "导入文件")
  );
}
function runtimeName(runtime) {
  if (runtime === "MAC_COMPONENT") return message("Mac", "Mac 本机");
  if (runtime === "IOS_DIAGNOSTIC_COMPONENT")
    return message("iOS Simulator", "iOS 模拟器");
  return message("Runner not recorded", "运行环境未记录");
}

function runName(run) {
  return (
    new Date(run.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en-NZ") +
    " · " +
    runtimeName(run.runtime)
  );
}
function updateRunControls() {
  const ready = latestState?.native?.ready === true;
  el("runtime").querySelector('option[value="IOS_DIAGNOSTIC_COMPONENT"]').disabled =
    !ready;
  const disabled =
    batchRunning ||
    latestState?.busy ||
    (el("runtime").value === "IOS_DIAGNOSTIC_COMPONENT" && !ready);
  el("run-selected").disabled = disabled || !selectedInputs.size;
  el("run-all").disabled = disabled || !savedInputs.length;
}
async function runInputs(ids, runtime) {
  if (batchRunning || !ids.length) return;
  batchRunning = true;
  updateRunControls();
  try {
    const results = await runSequentialInputs(ids, runtime, api, (p) => {
      el("batch-status").textContent =
        p.index +
        "/" +
        p.total +
        " · " +
        inputName(p.inputId) +
        " · " +
        readableState(p.stage);
    });
    show({ diagnosticBatch: results });
    await refresh();
    const newest = latestState.runs
      .filter((r) => ids.includes(r.inputId))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) await inspect(newest.id);
    el("batch-status").textContent = message(
      "Batch finished. Inspect each file to assess quality.",
      "批次已结束，请逐份检查解析质量。",
    );
  } finally {
    batchRunning = false;
    await refresh();
  }
}
async function addFiles(files) {
  for (const file of files) {
    if (!file.size || file.size > 10485760) throw new Error("INPUT_LIMIT");
    const media = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      txt: "text/plain",
    }[file.name.split(".").pop().toLowerCase()];
    if (!media) throw new Error("MEDIA_UNSUPPORTED");
    const response = await fetch(
      "/api/input?media=" +
        encodeURIComponent(media) +
        "&name=" +
        encodeURIComponent(file.name),
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      },
    );
    if (!response.ok) throw new Error("INPUT_REJECTED");
  }
  await refresh();
  el("notice").textContent = message(
    "Documents saved locally. Choose Run selected files.",
    "文件已在本地保存，请点击“运行所选文件”。",
  );
}
function section(parent, id, title, text) {
  const s = node("section");
  s.id = id;
  s.append(node("h2", title));
  if (text) s.append(node("p", text));
  parent.append(s);
  return s;
}
function details(parent, value) {
  const d = node("details"),
    summary = node("summary", message("Developer Details", "开发者详情"));
  d.append(summary, node("pre", JSON.stringify(value, null, 2)));
  parent.append(d);
}
function milliseconds(value) {
  return Number.isFinite(value)
    ? (value / 1000).toFixed(2) + message(" s", " 秒")
    : message("Not measured separately", "未单独计时");
}
function traceFields(trace) {
  return Array.isArray(trace?.result?.fields) ? trace.result.fields : [];
}
function fieldTable(parent, fields, trace, inputId, source = "deterministic") {
  if (!fields.length) {
    parent.append(
      node(
        "p",
        message("No fields recorded at this layer.", "此层尚无已记录字段。"),
        "muted",
      ),
    );
    return;
  }
  const table = node("table", undefined, "fields"),
    head = node("tr");
  for (const title of [
    message("Field", "字段"),
    message("Recognized value", "识别值"),
    message("Evidence", "证据"),
    message("Source / details", "来源／详情"),
  ])
    head.append(node("th", title));
  table.append(head);
  for (const field of fields) {
    const row = node("tr"),
      value = fieldValue(field);
    row.append(node("td", fieldName(field.path || "service")), node("td", value));
    const span = field.evidence?.[0] || field;
    const excerpt = excerptAt(
      trace.result?.text || trace.extraction?.text,
      span.start,
      span.end,
    );
    row.append(
      node(
        "td",
        excerpt !== null && (excerpt === field.raw || excerpt === field.literal)
          ? message("Exact text anchor", "精确原文锚点")
          : message("Not Recorded", "未记录"),
      ),
    );
    const evidence = node("td");
    evidence.append(
      button(
        source === "model"
          ? message("Apple suggestion · locate evidence", "Apple 补充建议 · 定位证据")
          : message("Deterministic · locate evidence", "确定性解析 · 定位证据"),
        () => selectField(trace, field, inputId, source),
      ),
    );
    row.append(evidence);
    table.append(row);
  }
  parent.append(table);
}
function excerptAt(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
    return null;
  const bytes = new TextEncoder().encode(text || "");
  if (end > bytes.length) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(start, end));
  } catch {
    return null;
  }
}

function stageState(value, absent = "Not Recorded") {
  if (value === "NOT_RUN" || value === "NOT_USED" || value === "NOT_AVAILABLE")
    return message("Not Run", "未运行");
  if (value === "UNAVAILABLE") return message("Unavailable — Not Run", "不可用 — 未运行");
  if (value === "FAILED") return message("Failed", "失败");
  if (value === "SUCCEEDED" || value === "FINISHED")
    return message("Completed", "已完成");
  return message(absent, absent === "Not Recorded" ? "未记录" : "未运行");
}
function hasDiagnosticLineage(trace) {
  return (
    trace.schema === "OTR_IMPORT_DIAGNOSTIC_TRACE" &&
    trace.version === 1 &&
    trace.typed?.projectionKind === "CURRENT_PARSER_READ"
  );
}
function appleDiagnostic(trace) {
  const known = hasDiagnosticLineage(trace);
  const reason = trace.result?.modelReason || trace.model?.reason;
  const status = trace.model?.status || trace.result?.modelExecution;
  const timed = Number.isFinite(trace.timings?.modelDeadlineInclusiveMs);
  const invoked = timed ? true : known && trace.timings ? false : null;
  const invalidEvidence = reason === "LOCAL_MODEL_EVIDENCE_INVALID";
  return {
    known,
    reason,
    status,
    invoked,
    invalidEvidence,
    retained: (trace.result?.supplementalServiceObservations || []).length,
  };
}
function renderAppleDiagnostic(host, trace) {
  const d = appleDiagnostic(trace),
    card = node("div", undefined, "lineage-note");
  card.append(
    node("h3", message("Apple — five separate checks", "Apple — 五项独立检查")),
  );
  const availability = trace.capability?.status || trace.result?.modelCapability;
  card.append(
    node("p", message("Availability: ", "能力可用性：") + readableState(availability)),
  );
  card.append(
    node(
      "p",
      message("Invocation: ", "是否调用：") +
        (d.invoked === true
          ? message("enrich call recorded · ", "已记录 enrich 调用 · ") +
            milliseconds(trace.timings.modelDeadlineInclusiveMs)
          : d.invoked === false
            ? message("Not Run in this diagnostic trace", "此诊断记录未运行")
            : message("Not Recorded", "未记录")),
    ),
  );
  card.append(
    node(
      "p",
      message("Output produced: ", "是否产生输出：") +
        (d.invalidEvidence && d.known
          ? message(
              "Inferred from the validator failure path: a parseable output was produced; the raw response was not retained.",
              "推断：校验失败路径证明曾产生可解析输出；原始响应未保留。",
            )
          : d.status === "SUCCEEDED"
            ? message(
                "Validated observations recorded; the raw response is not retained.",
                "已记录经校验的观察；原始响应未保留。",
              )
            : d.invoked === false
              ? message("Not Run", "未运行")
              : message(
                  "Not Recorded — a failed call alone does not show whether output was produced.",
                  "未记录 — 调用失败本身不能证明是否产生过输出。",
                )),
    ),
  );
  card.append(
    node(
      "p",
      message("Evidence validation: ", "输出证据校验：") +
        (d.invalidEvidence
          ? trace.model?.evidenceFailure
            ? message(
                "Model-output evidence validation failed; the recorded reason follows. Raw output is not retained.",
                "模型输出证据校验失败；下方显示已记录原因。原始输出未保留。",
              )
            : message(
                "Model-output evidence validation failed. An exact, unique original-text anchor did not pass; the rejected literal and precise cause were not retained.",
                "模型输出证据校验失败。精确且唯一的原文锚点未通过；被拒绝的字面值与具体原因未保留。",
              )
          : d.status === "SUCCEEDED"
            ? message(
                "Recorded observations passed the literal/unique-anchor checks.",
                "已记录观察通过字面值与唯一锚点校验。",
              )
            : d.invoked === false
              ? message("Not Run", "未运行")
              : message("Not Recorded", "未记录")),
    ),
  );
  const failure = trace.model?.evidenceFailure;
  if (d.invalidEvidence && failure) {
    const failureLabels = {
      INVALID_SERVICE_LITERAL: [
        "Output is not a valid flight-number literal",
        "输出不是合法航班号字面值",
      ],
      LITERAL_NOT_FOUND: [
        "Output literal does not occur exactly in the source text",
        "输出字面值未在原文中精确出现",
      ],
      MULTIPLE_LITERAL_MATCHES: [
        "Output literal occurs more than once; its source anchor is ambiguous",
        "输出字面值在原文多处出现，证据锚点不唯一",
      ],
    };
    const label = failureLabels[failure];
    if (label)
      card.append(
        node(
          "p",
          message("Recorded rejection: ", "已记录拒绝原因：") + message(...label),
        ),
      );
  }
  card.append(
    node(
      "p",
      message("Effective retained contribution: ", "实际保留贡献：") +
        d.retained +
        message(" supplementary observations; ", " 条补充观察；") +
        traceFields(trace).length +
        message(" deterministic fields remain available.", " 个确定性字段仍保留。"),
    ),
  );
  if (d.known)
    card.append(
      node(
        "p",
        message(
          "Current local model asks only for flight-number literals, not a complete booking. The current typed read reparses text and does not consume these model supplements.",
          "当前本地模型只请求航班号字面值，不抽取完整预订。当前 Typed 读取重新解析文本，不消费这些模型补充观察。",
        ),
        "muted",
      ),
    );
  if (d.invalidEvidence)
    card.append(
      node(
        "p",
        message(
          "This is an output/evidence failure, not proof that the model engine is unavailable. Whitespace, repeated occurrences or a particular rejected value cannot be guessed from this trace.",
          "这是输出证据问题，不能据此认定模型引擎不可用。不能从本记录猜测空格、重复出现或某个具体拒绝值。",
        ),
        "muted",
      ),
    );
  details(card, {
    capability: trace.capability,
    model: trace.model,
    reason: d.reason,
    hostSourceManifest: trace.job?.hostSourceManifest,
    executedVersion: trace.executedVersion,
    producers: d.known
      ? [
          "runImportDiagnostic",
          "createCaptureLocalExtractorCore.enrich",
          "validateCaptureLocalModelResponse",
          "attachCaptureLocalModelEvidence",
        ]
      : "NOT_RECORDED",
    provenance: "current host source relationship; not executed build attestation",
  });
  host.append(card);
}
function renderExpectedStructure(host) {
  const card = node("section", undefined, "expected-structure");
  card.append(
    node("h3", message("Expected — human annotation only", "Expected — 仅人工标准答案")),
    node(
      "p",
      message(
        "Separate from actual parser output. These labels do not create or prove Bookings, Segments, Candidates or Admission.",
        "与实际解析输出分隔。这些标注不创建或证明 Booking、Segment、Candidate 或 Admission。",
      ),
      "muted",
    ),
  );
  const annotation = inspectedLabels?.annotation;
  if (!annotation)
    card.append(
      node(
        "p",
        message(
          "No saved expected business structure. Field-only labels do not imply a booking/segment structure.",
          "尚未保存人工业务结构；仅有字段标注不能推导预订／分段结构。",
        ),
      ),
    );
  else {
    card.append(
      node(
        "p",
        annotation.documentStatus === "NO_RELEVANT_CONTENT"
          ? message(
              "Human expectation: no relevant content (zero results).",
              "人工预期：无相关内容（零个结果）。",
            )
          : annotation.documentStatus === "UNREVIEWED"
            ? message(
                "Not reviewed — not a structural ground-truth result.",
                "尚未人工检查 — 不属于已确认结构真值。",
              )
            : message("Saved diagnostic expectations: ", "已保存诊断预期：") +
              annotation.results.length +
              message(" result groups", " 个结果组"),
      ),
    );
    for (const [index, result] of (annotation.results || []).entries()) {
      const pair = annotationTypes[result.type],
        label = pair ? message(...pair) : message("Unclassified", "未分类");
      card.append(
        node(
          "p",
          message("Expected result ", "预期结果 ") +
            (index + 1) +
            " · " +
            label +
            " · " +
            result.segments.length +
            message(" expected segments · ", " 个预期分段 · ") +
            result.fields.length +
            message(" expected fields", " 个预期字段"),
        ),
      );
    }
  }
  host.append(card);
}
function renderBusinessStructure(host, trace, inputId) {
  const known = hasDiagnosticLineage(trace),
    results = businessResults(trace),
    flow = node("div", undefined, "lineage-note");
  flow.append(node("h3", message("Actual business structure", "Actual 实际业务结构")));
  const steps = [
    message("Input: one current original", "Input：当前一份原件"),
    message("Partial observations: ", "局部观察：") + results.length,
    message("Consolidation: ", "身份汇总／合并：") +
      (known
        ? message("Not available / Not Run", "未提供／未执行")
        : message("Not Recorded", "未记录")),
    message("Typed: ", "Typed：") +
      (trace.typed?.projectionKind === "CURRENT_PARSER_READ"
        ? message(
            "current parser read; formal typed assembly and completeness assessment Not Run",
            "当前解析器读取投影；正式 Typed 组装／完整性评估未运行",
          )
        : message("Not Recorded", "未记录")),
    message("Candidate / Admission: ", "Candidate／Admission：") +
      (known && trace.admission === "NOT_AVAILABLE"
        ? message("Not Run", "未运行")
        : message("Not Recorded", "未记录")),
    message("Booking / Segment / Trip Item: ", "Booking／Segment／Trip Item：") +
      (known
        ? message("Not generated by this diagnostic path", "此诊断路径未生成")
        : message("Not Recorded", "未记录")),
  ];
  for (const label of steps) flow.append(node("p", label));
  if (known)
    flow.append(
      node(
        "p",
        message(
          "The current read function always labels successful parser projections PARTIAL; this is not a completeness score. Formal typed assembly, required-field assessment and identity consolidation have not run.",
          "当前读取函数对成功解析投影固定标记 PARTIAL，这不是完整性评分。正式 Typed 组装、必填评估与身份汇总均未运行。",
        ),
        "muted",
      ),
    );
  flow.append(
    node(
      "p",
      message(
        "Input, parser item tokens and formal business identities are different. Cross-input booking links, identity matching and deduplication are Not Recorded; repeated observations do not prove duplicate bookings.",
        "Input、解析器观察 token 与正式业务身份不同。跨 Input 预订关联、身份匹配与去重未记录；重复观察不能证明重复预订。",
      ),
      "muted",
    ),
  );
  if (known)
    flow.append(
      node(
        "p",
        message(
          "Producer lineage from current host source: runImportDiagnostic → buildCaptureLocalResult → parseReferenceFlightText; the typed projection calls parseReferenceFlightText again. This describes source relationships, not the executing Native/JS build.",
          "当前主机源码生产关系：runImportDiagnostic → buildCaptureLocalResult → parseReferenceFlightText；Typed 投影再次调用 parseReferenceFlightText。此为源码关系，不是执行中的 Native／JS 构建证明。",
        ),
        "muted",
      ),
    );
  details(flow, {
    inputId,
    projectionKind: trace.typed?.projectionKind,
    sourceAuthority: trace.sourceAuthority,
    admission: trace.admission,
    executedVersion: trace.executedVersion,
    hostSourceManifest: trace.job?.hostSourceManifest,
  });
  host.append(flow);
}

function resultType(item) {
  const types = { "otr.import.flight": ["Air transport observations", "航空交通观察"] };
  return types[item.schema_id]
    ? message(...types[item.schema_id])
    : message("Unclassified interpretation", "未分类解释");
}
function businessResults(trace) {
  const typed = Array.isArray(trace.typed?.items) ? trace.typed.items : [];
  if (typed.length) return typed;
  const groups = new Map();
  for (const field of traceFields(trace)) {
    const key = field.itemToken || "unclassified";
    if (!groups.has(key)) groups.set(key, { token: key, fields: [], schema_id: null });
    groups.get(key).fields.push(field);
  }
  return [...groups.values()];
}
function correspondingField(trace, field, item) {
  return (
    traceFields(trace).find(
      (f) =>
        f.path === field.path &&
        f.raw === field.raw &&
        (!item?.token || f.itemToken === item.token),
    ) || field
  );
}
function modelMatches(trace, field) {
  return (trace.result?.supplementalServiceObservations || []).filter(
    (s) =>
      s.literal === field.raw &&
      (field.evidence || []).some((e) => e.start === s.start && e.end === s.end),
  );
}
function renderDocumentPreview(trace, inputId, field) {
  const host = el("document-preview");
  host.replaceChildren(node("h3", message("Document Preview", "原件预览")));
  const input = savedInputs.find((i) => i.id === inputId),
    extraction = trace.extraction || trace.result || {};
  const evidence = field?.evidence?.[0] || field || {};
  const excerpt = excerptAt(
    trace.result?.text || extraction.text,
    evidence.start,
    evidence.end,
  );
  const pages = Array.isArray(extraction.pages) ? extraction.pages : [];
  if ((evidence.pages || []).length && !previewManuallyChosen)
    previewPage = evidence.pages[0] + 1;
  if (pages.length) previewPage = Math.min(Math.max(1, previewPage), pages.length);
  host.append(
    node(
      "p",
      message("Extraction: ", "提取：") +
        (extraction.engine || message("Not Recorded", "未记录")) +
        " · " +
        milliseconds(trace.timings?.extractionMs),
      "muted",
    ),
  );
  const controls = node("div", undefined, "document-controls");
  if (input?.mediaType === "application/pdf" && pages.length) {
    const previous = button("←", () => {
      previewPage = Math.max(1, previewPage - 1);
      previewManuallyChosen = true;
      renderDocumentPreview(trace, inputId, field);
    });
    previous.disabled = previewPage <= 1;
    const next = button("→", () => {
      previewPage = Math.min(pages.length, previewPage + 1);
      previewManuallyChosen = true;
      renderDocumentPreview(trace, inputId, field);
    });
    next.disabled = previewPage >= pages.length;
    controls.append(
      previous,
      node("span", message("Page ", "第 ") + previewPage + " / " + pages.length),
      next,
    );
  }
  controls.append(
    button("−", () => {
      previewZoom = Math.max(50, previewZoom - 25);
      renderDocumentPreview(trace, inputId, field);
    }),
    node("span", previewZoom + "%"),
    button("+", () => {
      previewZoom = Math.min(250, previewZoom + 25);
      renderDocumentPreview(trace, inputId, field);
    }),
  );
  host.append(controls);
  if (input && /^[0-9a-f-]{36}$/.test(input.id)) {
    const url = "/api/input/" + input.id + "/original",
      link = node("a", message("Open original", "打开原件"));
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    host.append(link);
    if (input.mediaType === "text/plain")
      host.append(
        node("pre", extraction.text || message("Text not recorded", "未记录文本")),
      );
    else if (
      input.mediaType.startsWith("image/") ||
      (input.mediaType === "application/pdf" && pages.length)
    ) {
      const viewport = node("div", undefined, "preview-viewport"),
        wrap = node("div", undefined, "preview"),
        image = node("img");
      wrap.style.width = previewZoom + "%";
      image.src =
        input.mediaType === "application/pdf"
          ? "/api/input/" + input.id + "/preview?page=" + previewPage
          : url;
      image.alt = input.name;
      image.onerror = () => {
        viewport.replaceChildren(
          node(
            "p",
            message(
              "Page preview unavailable. Open the original above; recorded evidence remains below.",
              "页面预览不可用，请使用上方原件链接；下方仍保留真实证据。",
            ),
          ),
        );
      };
      wrap.append(image);
      const boxes = input.mediaType.startsWith("image/") ? evidence.boxes || [] : [];
      for (const box of boxes) {
        if (
          ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
          box.x < 0 ||
          box.y < 0 ||
          box.width <= 0 ||
          box.height <= 0 ||
          box.x + box.width > 1 ||
          box.y + box.height > 1
        )
          continue;
        const marker = node("span", undefined, "box");
        Object.assign(marker.style, {
          left: box.x * 100 + "%",
          top: (1 - box.y - box.height) * 100 + "%",
          width: box.width * 100 + "%",
          height: box.height * 100 + "%",
        });
        wrap.append(marker);
      }
      viewport.append(wrap);
      host.append(viewport);
      if (input.mediaType === "application/pdf" && pages.length) {
        const thumbs = node("div", undefined, "thumbnails");
        for (const page of pages) {
          const n = page.pageIndex + 1;
          const thumbnail = button(String(n), () => {
            previewPage = n;
            previewManuallyChosen = true;
            renderDocumentPreview(trace, inputId, field);
          });
          thumbnail.setAttribute("aria-label", message("Page ", "第 ") + n);
          const img = node("img");
          img.src = "/api/input/" + input.id + "/preview?page=" + n;
          img.alt = message("Page ", "第 ") + n;
          thumbnail.append(img);
          thumbs.append(thumbnail);
        }
        host.append(thumbs);
      }
    } else
      host.append(
        node(
          "p",
          message(
            "Page count is not recorded; use the original link rather than inventing pages.",
            "页数未记录，请打开原件；不推测页面数量。",
          ),
        ),
      );
  } else
    host.append(
      node(
        "p",
        message(
          "Imported trace: no saved local original is attached.",
          "导入记录未关联本地原件。",
        ),
      ),
    );
  if (field) {
    host.append(node("h3", message("Selected source evidence", "选中字段的原文证据")));
    host.append(
      node(
        "blockquote",
        excerpt ??
          message(
            "No exact span recorded. No highlight inferred.",
            "未记录精确文本范围，不推测高亮。",
          ),
      ),
    );
    if ((evidence.pages || []).length)
      host.append(
        node(
          "p",
          message("Recorded pages: ", "记录页码：") +
            evidence.pages.map((p) => p + 1).join(", "),
        ),
      );
  }
  const text = node("details"),
    summary = node(
      "summary",
      message("Extracted text / OCR regions", "提取文本／OCR 区域"),
    );
  text.append(summary, node("pre", extraction.text || message("Not Recorded", "未记录")));
  for (const observation of extraction.observations || [])
    text.append(
      button(observation.text, () =>
        selectField(
          trace,
          {
            path: "ocr_observation",
            raw: observation.text,
            boxes: [observation.boundingBox],
          },
          inputId,
          "extraction",
        ),
      ),
    );
  host.append(text);
}
function step(parent, title, status, output, timing, extra) {
  const card = node("div", undefined, "stage-step");
  card.append(node("h3", title), node("p", status, "status"));
  if (output) card.append(node("p", output));
  if (timing !== undefined) card.append(node("small", milliseconds(timing)));
  if (extra) details(card, extra);
  parent.append(card);
  return card;
}
function renderFieldChain(trace, field, inputId, source = "deterministic") {
  const host = el("field-chain");
  host.replaceChildren(node("h3", message("Evidence & Interpretation", "证据与解释")));
  renderAppleDiagnostic(host, trace);
  if (!field) {
    host.append(
      node(
        "p",
        message(
          "Select a field or OCR observation to inspect its actual processing chain.",
          "选择字段或 OCR 观察，查看真实处理过程。",
        ),
      ),
    );
    return;
  }
  host.append(node("h3", fieldName(field.path)), node("p", fieldValue(field), "status"));
  const evidence = field.evidence?.[0] || field,
    raw = excerptAt(
      trace.result?.text || trace.extraction?.text,
      evidence.start,
      evidence.end,
    );
  step(
    host,
    message("1. Original text / OCR", "1. 原文／OCR"),
    raw !== null ? message("Recorded exact span", "已记录精确范围") : stageState(),
    raw ?? field.raw,
    trace.timings?.extractionMs,
    evidence,
  );
  const deterministic = traceFields(trace).filter(
    (f) =>
      f.path === field.path &&
      f.raw === field.raw &&
      (!field.itemToken || field.itemToken === f.itemToken),
  );
  step(
    host,
    message("2. Deterministic rules", "2. 确定性规则"),
    deterministic.length
      ? message("Field retained", "字段已保留")
      : source === "model"
        ? message("No matching retained rule field", "未记录对应规则字段")
        : stageState(),
    deterministic.length
      ? fieldValue(deterministic[0])
      : message("No intermediate candidate values were recorded.", "未记录中间候选值。"),
    trace.timings?.deterministicAndCapabilityMs,
    { timingScope: "parser and capability combined", fields: deterministic },
  );
  const matches = source === "model" ? [field] : modelMatches(trace, field),
    modelStatus = trace.result?.modelExecution || trace.model?.status;
  let modelText = matches.length
    ? matches.map(fieldValue).join(" / ")
    : message(
        "No field-level model observation recorded. Run-level success is not confirmation of this field.",
        "未记录此字段的模型观察；运行成功不代表模型确认该字段。 ",
      );
  if (modelStatus === "FAILED")
    modelText =
      reasonText(trace.result?.modelReason || trace.model?.reason) +
      message(" Rejected raw output was not retained.", " 被拒绝的原始输出未保留。");
  step(
    host,
    message("3. Apple local model", "3. Apple 本地模型"),
    matches.length
      ? message(
          "Supplementary observation — not adopted into typed result",
          "补充观察 — 未自动纳入结构结果",
        )
      : (trace.result?.modelReason || trace.model?.reason) ===
          "LOCAL_MODEL_EVIDENCE_INVALID"
        ? message("Model-output evidence validation failed", "模型输出证据校验失败")
        : stageState(modelStatus),
    modelText,
    trace.timings?.modelDeadlineInclusiveMs,
    { capability: trace.capability, model: trace.model },
  );
  step(
    host,
    message("4. Remote model", "4. 远端模型"),
    stageState(trace.remote),
    trace.remote === "NOT_USED"
      ? message(
          "Remote model was not called; no remote cost.",
          "未调用远端模型，无远端费用。",
        )
      : message("No field-level remote trace recorded.", "未记录字段级远端结果。"),
  );
  const anchored = raw !== null && (field.raw === raw || field.literal === raw);
  step(
    host,
    message("5. Evidence validation", "5. 证据校验"),
    anchored ? message("Exact original-text evidence", "精确原文证据") : stageState(),
    anchored
      ? message(
          "Text anchor retained; this does not imply user confirmation or Admission.",
          "原文锚点有效，不代表用户确认或正式准入。",
        )
      : message(
          "This field has no recorded validation receipt; do not infer a rejection.",
          "此字段未记录校验回执，不推测为拒绝。",
        ),
    undefined,
    { timing: "included in parser/model, not separately recorded", evidence },
  );
  step(
    host,
    message("6. Consolidation / conflict resolution", "6. 汇总／冲突解决"),
    stageState(),
    message("No independent consolidation step recorded.", "未记录独立汇总处理步骤。"),
  );
  const typed = (trace.typed?.items || [])
    .flatMap((item) => item.fields || [])
    .filter((f) => f.path === field.path && f.raw === field.raw);
  step(
    host,
    message("7. Typed interpretation", "7. 结构化解释"),
    typed.length
      ? message(
          "Present in the current parser read projection",
          "当前解析器读取投影中存在",
        )
      : message("Not adopted / not recorded", "未纳入／未记录"),
    typed.length
      ? fieldValue(typed[0])
      : message("No corresponding typed field recorded.", "未记录对应结构化字段。"),
  );
  step(
    host,
    message("8. Candidate / Admission", "8. 候选／准入"),
    stageState(trace.admission),
    message(
      "Interpretation observations are not formal Candidates, Bookings, Segments or Canonical Items.",
      "解析观察不等于正式 Candidate、Booking、Segment 或 Canonical Item。",
    ),
  );
  details(host, {
    field,
    source,
    inputId,
    hostSourceManifest: trace.job?.hostSourceManifest,
    executedVersion: trace.executedVersion,
  });
}
function selectField(trace, field, inputId, source = "deterministic") {
  selectedField = field;
  selectedFieldSource = source;
  previewManuallyChosen = false;
  renderDocumentPreview(trace, inputId, field);
  renderFieldChain(trace, field, inputId, source);
}
function renderMatrix(host, trace) {
  const wrap = node("div", undefined, "matrix-scroll"),
    table = node("table"),
    header = node("tr");
  for (const title of [
    message("Field", "字段"),
    "Extraction",
    "Rules",
    "Apple Local",
    "Evidence",
    "Typed",
  ])
    header.append(node("th", title));
  table.append(header);
  for (const f of traceFields(trace)) {
    const e = f.evidence?.[0],
      span = e ? excerptAt(trace.result?.text, e.start, e.end) : null,
      typed = (trace.typed?.items || []).some((item) =>
        (item.fields || []).some((x) => x.path === f.path && x.raw === f.raw),
      );
    const tr = node("tr");
    for (const value of [
      fieldName(f.path),
      span === null
        ? message("Not Recorded", "未记录")
        : message("Exact text", "精确原文"),
      message("Retained", "保留"),
      modelMatches(trace, f).length
        ? message("Observation recorded", "已记录观察")
        : message("Not Recorded", "未记录"),
      span === f.raw
        ? message("Exact anchor", "精确锚点")
        : message("Not Recorded", "未记录"),
      typed ? message("Present", "存在") : message("Not Recorded", "未记录"),
    ])
      tr.append(node("td", value));
    table.append(tr);
  }
  for (const s of trace.result?.supplementalServiceObservations || []) {
    const tr = node("tr");
    for (const value of [
      message("Model flight-number observation", "模型航班号观察"),
      s.literal,
      message("Not Recorded", "未记录"),
      message("Proposed", "提出"),
      message("Exact text anchor", "精确原文锚点"),
      message("Not automatically adopted", "未自动纳入"),
    ])
      tr.append(node("td", value));
    table.append(tr);
  }
  wrap.append(table);
  host.append(wrap);
  host.append(
    node(
      "p",
      message(
        "Rejected-field counts and complete Admission required fields are Not Recorded. The three existing local-enrichment conditions are not complete Admission validation.",
        "拒绝字段数与完整 Admission 必填字段未记录。三个本地增强条件不是完整 Admission 校验。",
      ),
      "muted",
    ),
  );
}
function renderParsedResults(trace, inputId) {
  const host = el("parsed-results");
  host.replaceChildren(node("h3", message("Parsed Results", "解析结果")));
  const tabs = node("div", undefined, "result-tabs");
  for (const [key, en, zh] of [
    ["structure", "Business Structure", "业务结构"],
    ["result", "By Observation", "按局部观察"],
    ["field", "By Field", "按字段"],
    ["matrix", "Stage Contribution", "阶段贡献"],
  ]) {
    const b = button(message(en, zh), () => {
      resultView = key;
      renderParsedResults(trace, inputId);
    });
    b.setAttribute("aria-selected", String(resultView === key));
    tabs.append(b);
  }
  host.append(tabs);
  if (resultView === "structure") renderBusinessStructure(host, trace, inputId);
  if (resultView === "matrix") {
    renderMatrix(host, trace);
    return;
  }
  const results = businessResults(trace),
    fields = traceFields(trace),
    suggestions = trace.result?.supplementalServiceObservations || [];
  if (resultView === "field") fieldTable(host, fields, trace, inputId);
  else
    for (const [index, item] of results.entries()) {
      const group = node("div", undefined, "card");
      group.append(
        node("h3", resultType(item) + " · " + (index + 1)),
        node(
          "p",
          message(
            "Interpretation: partial observations · Candidate: Not Run · Admission: Not Run",
            "Interpretation：部分观察 · Candidate：未运行 · Admission：未运行",
          ),
          "muted",
        ),
      );
      group.append(
        node(
          "p",
          message("Source: ", "来源：") +
            inputName(inputId) +
            message(
              " · Booking / Segment identities: Not Recorded",
              " · Booking／Segment 身份：未记录",
            ),
        ),
      );
      group.append(
        node(
          "p",
          message("Producer: ", "生产者：") +
            (hasDiagnosticLineage(trace)
              ? "parseReferenceFlightText → buildCaptureLocalResult"
              : message("Not Recorded", "未记录")) +
            " · " +
            runtimeName(trace.runtime),
        ),
      );
      group.append(
        node(
          "p",
          message(
            "This is a local observation group, not a Booking or Segment. Identity/consolidation/deduplication decisions: Not Recorded.",
            "这是局部观察组，不是 Booking 或 Segment。身份、汇总、去重决策未记录。",
          ),
          "muted",
        ),
      );
      fieldTable(
        group,
        (item.fields || []).map((f) => correspondingField(trace, f, item)),
        trace,
        inputId,
      );
      for (const deferred of item.deferred || []) {
        const span = (trace.typed?.fragments || []).find(
          (f) => f.id === deferred.fragment_id,
        )?.locator;
        const raw = span ? excerptAt(trace.result?.text, span.start, span.end) : null;
        if (raw !== null)
          group.append(
            node(
              "p",
              message(
                "Retained unsupported dimension: ",
                "已保留、尚不支持的业务维度：",
              ) +
                (deferred.dimension === "bookings"
                  ? message("Booking reference", "预订关联")
                  : deferred.dimension) +
                " · " +
                raw +
                message(
                  " — not a Booking identity or link",
                  " — 尚未形成 Booking 身份或关联",
                ),
            ),
          );
      }
      if (item.schema_id === "otr.import.flight") {
        const paths = new Set((item.fields || []).map((f) => f.path)),
          missing = ["service", "origin.airport", "destination.airport"].filter(
            (path) => !paths.has(path),
          );
        group.append(
          node(
            "p",
            missing.length
              ? message("Local-enrichment conditions missing: ", "本地增强条件仍缺：") +
                  missing.map(fieldName).join("、")
              : message(
                  "Local-enrichment fields present; complete Admission requirements not assessed.",
                  "本地增强字段已存在，完整准入要求尚未评估。",
                ),
          ),
        );
      }
      group.append(
        node(
          "p",
          message(
            "Local-enrichment conditions are not complete Admission validation.",
            "本地增强条件不是完整 Admission 校验。",
          ),
          "muted",
        ),
      );
      details(group, {
        token: item.token,
        schema: item.schema_id,
        fields: item.fields,
        fragments: item.fragments,
      });
      host.append(group);
    }
  if (!results.length)
    host.append(
      node(
        "p",
        message(
          "No usable travel booking information found within the current interpreter's scope. Extracted content remains available; this does not prove that an unsupported document has no travel content.",
          "当前解释器范围内未发现可用的旅行预订信息。已提取内容保留；这不代表未支持的文件没有旅行内容。",
        ),
      ),
    );
  if (suggestions.length) {
    host.append(
      node(
        "h3",
        message(
          "Additional Apple observations — not business results",
          "Apple 补充观察 — 不是业务结果",
        ),
      ),
    );
    fieldTable(
      host,
      suggestions.map((s) => ({ ...s, path: "service" })),
      trace,
      inputId,
      "model",
    );
  }
  host.append(
    node(
      "p",
      message(
        "Current production interpreter: partial air-transport observations. Stay, rental, scheduled transport, activity and ticket interpreters are not available. No business type is inferred from document prose.",
        "当前正式解释器：部分航空交通观察。住宿、租车、定时交通、活动、票证解释器尚不可用，不从原文猜测业务类型。",
      ),
      "muted",
    ),
  );
  if (resultView === "structure") renderExpectedStructure(host);
}
function renderInspection(run, imported = false) {
  const root = el("inspection");
  root.replaceChildren();
  el("evidence-view").hidden = true;
  const trace = run.trace || (run.result ? run : null),
    inputId = run.inputId || trace?.job?.inputId || trace?.result?.inputId;
  const input = savedInputs.find((i) => i.id === inputId),
    header = section(root, "summary", inputName(inputId));
  if (!trace) {
    header.append(node("p", readableState(run.stage)));
    if (run.error) header.append(node("p", reasonText(run.error)));
    header.append(
      node(
        "p",
        message(
          "Execution failed or was interrupted; this is not a zero-result interpretation.",
          "执行失败或中断，不属于零结果解析。",
        ),
      ),
    );
    details(header, run);
    show(run);
    return;
  }
  if (!trace.result) {
    header.append(
      node(
        "p",
        message(
          "Imported trace schema does not record these inspection layers. Original JSON is preserved below.",
          "导入记录未包含可展示的解析层结构，原始 JSON 保留在下方。",
        ),
      ),
    );
    details(header, run);
    show(run);
    return;
  }
  const results = businessResults(trace),
    fields = traceFields(trace),
    suggestions = trace.result.supplementalServiceObservations || [],
    ocr = trace.extraction?.observations;
  const elapsed = Date.parse(trace.finishedAt) - Date.parse(trace.startedAt);
  header.append(
    node(
      "p",
      [
        input?.mediaType ||
          trace.job?.mediaType ||
          message("Format not recorded", "格式未记录"),
        readableState(trace.result.status),
        milliseconds(elapsed >= 0 ? elapsed : undefined),
      ].join(" · "),
      "status",
    ),
  );
  const counts = node("div", undefined, "result-counts"),
    types = new Map();
  for (const item of results)
    types.set(resultType(item), (types.get(resultType(item)) || 0) + 1);
  for (const [type, count] of types)
    counts.append(node("span", type + " × " + count, "badge"));
  if (!results.length)
    counts.append(node("span", message("Interpretations × 0", "解释结果 × 0"), "badge"));
  header.append(counts);
  header.append(
    node(
      "p",
      fields.length +
        message(" rule fields · ", " 个规则字段 · ") +
        suggestions.length +
        message(
          " evidence-linked model observations. Not admitted Bookings.",
          " 条有证据的模型观察。不属于已接纳 Booking。",
        ),
    ),
  );
  const stats = node("details"),
    summary = node("summary", message("Stage counts and timings", "阶段数量与耗时"));
  stats.append(summary);
  for (const text of [
    message("Extracted OCR observations: ", "OCR 观察：") +
      (Array.isArray(ocr) ? ocr.length : message("Not Recorded", "未记录")),
    message("Retained rule fields: ", "保留的规则字段：") + fields.length,
    message(
      "Proposed fields before validation: Not Recorded",
      "校验前提出的字段数：未记录",
    ),
    message("Evidence-valid rule fields: ", "有原文证据的规则字段：") +
      fields.filter((f) => (f.evidence || []).length).length,
    message("Rejected field count: Not Recorded", "拒绝字段数：未记录"),
    message("Typed fields: ", "结构字段：") +
      (trace.typed?.items || []).reduce((n, item) => n + (item.fields || []).length, 0),
    message("Required missing fields: Not Recorded", "必填缺项总数：未记录"),
    message("Extraction: ", "提取：") + milliseconds(trace.timings?.extractionMs),
    message("Parser + capability combined: ", "解析与模型能力检查合计：") +
      milliseconds(trace.timings?.deterministicAndCapabilityMs),
    message("Apple local call: ", "Apple 本地调用：") +
      milliseconds(trace.timings?.modelDeadlineInclusiveMs),
    message(
      "Evidence timing is included in parser/model processing, not separately recorded.",
      "证据校验包含在解析／模型处理中，未单独计时。",
    ),
  ])
    stats.append(node("p", text));
  header.append(stats);
  if (imported)
    header.append(
      node(
        "p",
        message(
          "Imported view only; runtime and validation are unverified.",
          "导入记录仅供查看，运行与校验未经验证。",
        ),
        "muted",
      ),
    );
  if (trace.result.modelExecution === "FAILED")
    header.append(
      node(
        "p",
        reasonText(trace.result.modelReason) +
          message(
            " Rejected raw output was not retained.",
            " 被拒绝的模型原始输出未保留。",
          ),
      ),
    );
  const columns = node("div", undefined, "inspector-columns"),
    left = node("section"),
    middle = node("section"),
    right = node("section", undefined, "evidence-column");
  left.id = "document-preview";
  middle.id = "parsed-results";
  right.id = "field-chain";
  columns.append(left, middle, right);
  root.append(columns);
  renderDocumentPreview(trace, inputId, selectedField);
  renderParsedResults(trace, inputId);
  renderFieldChain(trace, selectedField, inputId, selectedFieldSource);
  details(root, run);
  show(run);
}

function setLabelControls() {
  const disabled = inspectionLoading || labelSaving || !selectedRun;
  const descendants = (element) => [
    element,
    ...[...element.children].flatMap(descendants),
  ];
  const controls = [
    el("kind"),
    el("document-status"),
    el("add-label"),
    el("save-labels"),
    ...descendants(el("labels")),
  ];
  for (const control of controls) control.disabled = disabled;
}
function beginInspection() {
  const sequence = ++inspectionSequence;
  inspectionLoading = true;
  selectedRun = undefined;
  setLabelControls();
  return sequence;
}
async function inspect(id) {
  const sequence = beginInspection();
  try {
    const run = await api("/api/run/" + id);
    if (sequence !== inspectionSequence) return;
    const [saved, stats] = run.trace
      ? await Promise.all([
          api("/api/run/" + id + "/labels"),
          api("/api/run/" + id + "/stats"),
        ])
      : [null, { status: "N/A" }];
    if (sequence !== inspectionSequence) return;
    inspectedImported = false;
    selectedFieldSource = "deterministic";
    selectedField =
      traceFields(run.trace).find((f) => f.path === "service") ||
      traceFields(run.trace)[0];
    previewPage = 1;
    previewZoom = 100;
    previewManuallyChosen = false;
    inspected = run;
    inspectedLabels = saved;
    selectedRun = run.trace ? id : undefined;
    el("inspect-input").value = run.inputId;
    populateInspectionRuns();
    renderInspection(run);
    tab("inspect");
    el("exports").replaceChildren();
    el("export-section").hidden = false;
    for (const format of ["json", "html"]) {
      const a = node("a", message("Export ", "导出 ") + format.toUpperCase());
      a.href = "/api/run/" + id + "/" + format;
      el("exports").append(a);
    }
    el("label-target").textContent = inputName(run.inputId) + " · " + runName(run);
    el("labels").replaceChildren();
    loadAnnotation(saved, run);
    renderStats(stats);
    el("compare-input").value = run.inputId;
    populateCompareRuns();
  } catch (error) {
    if (sequence === inspectionSequence) throw error;
  } finally {
    if (sequence === inspectionSequence) {
      inspectionLoading = false;
      setLabelControls();
    }
  }
}
async function inspectImported(id) {
  const sequence = beginInspection();
  try {
    const imported = await api("/api/import/" + id);
    if (sequence !== inspectionSequence) return;
    const payload = imported.payload ?? imported;
    inspectedImported = true;
    inspectedLabels = undefined;
    selectedFieldSource = "deterministic";
    selectedField = undefined;
    previewPage = 1;
    previewZoom = 100;
    previewManuallyChosen = false;
    inspected = payload.trace ? payload : { trace: payload };
    renderInspection(inspected, true);
    el("label-target").textContent = message(
      "Imported traces are view-only; select a completed local run to label it.",
      "导入记录仅可查看，请选择本地已完成运行后标注。",
    );
    el("labels").replaceChildren();
    renderStats({ status: "N/A" });
    el("export-section").hidden = true;
    tab("inspect");
  } catch (error) {
    if (sequence === inspectionSequence) throw error;
  } finally {
    if (sequence === inspectionSequence) {
      inspectionLoading = false;
      setLabelControls();
    }
  }
}
async function saveLabels() {
  const runId = selectedRun,
    sequence = inspectionSequence;
  if (inspectionLoading || labelSaving || !runId) return;
  const annotation = readAnnotationForm();
  const fields = annotation.results
    .flatMap((result) => [
      ...result.fields,
      ...result.segments.flatMap((segment) => segment.fields),
    ])
    .filter((field) => field.status === "CONFIRMED" && field.raw.trim())
    .map(({ path, raw }) => ({ path, raw }));
  if (
    annotation.results.some((result) =>
      [...result.fields, ...result.segments.flatMap((segment) => segment.fields)].some(
        (field) => field.status === "CONFIRMED" && !field.raw.trim(),
      ),
    )
  )
    throw new Error("CONFIRMED_VALUE_REQUIRED");
  const kind = el("kind").value;
  labelSaving = true;
  setLabelControls();
  try {
    await api("/api/run/" + runId + "/labels", { kind, fields, annotation });
    if (sequence !== inspectionSequence || selectedRun !== runId) return;
    const stats = await api("/api/run/" + runId + "/stats");
    if (sequence === inspectionSequence && selectedRun === runId) {
      inspectedLabels = { kind, fields, annotation };
      renderStats(stats);
      if (resultView === "structure" && inspected?.trace)
        renderParsedResults(inspected.trace, inspected.inputId);
    }
  } catch (error) {
    if (sequence === inspectionSequence && selectedRun === runId) throw error;
  } finally {
    labelSaving = false;
    setLabelControls();
  }
}

function populateCompareRuns() {
  const runs = (latestState?.runs || [])
    .filter((r) => r.inputId === el("compare-input").value && r.stage === "FINISHED")
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const name of ["a", "b"]) {
    el(name).replaceChildren();
    for (const run of runs) {
      const option = node("option", runName(run));
      option.value = run.id;
      el(name).append(option);
    }
  }
  if (runs.length > 1) el("a").value = runs[1].id;
  if (runs.length) el("b").value = runs[0].id;
  updateCompareControl();
}
function updateCompareControl() {
  el("compare").disabled =
    !el("a").value || !el("b").value || el("a").value === el("b").value;
}
function pairKey(field) {
  return JSON.stringify([field.path, field.raw]);
}
function renderComparison(before, after, diff) {
  lastComparison = { before, after, diff };
  const root = el("comparison");
  root.replaceChildren();
  const a = traceFields(before.trace),
    b = traceFields(after.trace);
  const added = b.filter((f) => !a.some((x) => pairKey(x) === pairKey(f)));
  const removed = a.filter((f) => !b.some((x) => pairKey(x) === pairKey(f)));
  const unchanged = diff.sameFieldEvidence && !diff.modelChanged;
  root.append(
    node(
      "p",
      unchanged
        ? message("Unchanged", "未变化")
        : message(
            "Changed — accuracy direction requires reviewed Ground Truth",
            "有变化 — 准确率方向需要已检查的人工真值",
          ),
      "status",
    ),
  );
  root.append(
    node(
      "p",
      message("Partial interpretation groups: ", "部分解释分组：") +
        businessResults(before.trace).length +
        " → " +
        businessResults(after.trace).length,
    ),
  );
  root.append(
    node(
      "p",
      message("Business types: ", "业务类型：") +
        [...new Set(businessResults(before.trace).map(resultType))].join(" / ") +
        " → " +
        [...new Set(businessResults(after.trace).map(resultType))].join(" / "),
    ),
  );
  root.append(
    node(
      "p",
      message(
        "Segment structure: Not Comparable — no formal Segment identities recorded. Typed completeness: Not Comparable — no complete required-field evaluator.",
        "分段结构：不可比较 — 未记录正式 Segment 身份。结构完整性：不可比较 — 尚无完整必填评估器。",
      ),
    ),
  );
  root.append(node("h3", message("What changed?", "改善了什么？")));
  for (const [title, list] of [
    [message("New values", "新增值"), added],
    [message("Missing values", "丢失值"), removed],
  ]) {
    root.append(node("h3", title));
    if (!list.length) root.append(node("p", message("None", "无")));
    for (const f of list) root.append(node("p", fieldName(f.path) + ": " + f.raw));
  }
  const changed = [...new Set([...a, ...b].map((f) => f.path))].filter((path) => {
    const x = a
        .filter((f) => f.path === path)
        .map((f) => f.raw)
        .sort(),
      y = b
        .filter((f) => f.path === path)
        .map((f) => f.raw)
        .sort();
    return x.length && y.length && JSON.stringify(x) !== JSON.stringify(y);
  });
  root.append(
    node(
      "p",
      message("Changed fields: ", "变化字段：") +
        (changed.map(fieldName).join("、") || message("None", "无")),
    ),
  );
  root.append(
    node(
      "p",
      diff.sameFieldEvidence
        ? message("Field evidence is unchanged.", "字段证据未变化。")
        : message(
            "Field evidence changed. Review added / removed evidence in Developer Details; a locator change alone does not prove better quality.",
            "字段证据有变化。新增／丢失证据保留在开发者详情；定位变化本身不代表质量改善。",
          ),
    ),
  );
  root.append(
    node(
      "p",
      message("Host source versions: ", "主机源码版本：") +
        (diff.sameHostSourceManifest === true
          ? message("Unchanged", "未变化")
          : diff.sameHostSourceManifest === false
            ? message("Changed", "有变化")
            : message("Not Recorded / Not Comparable", "未记录／不可比较")),
    ),
  );
  const oldModel = before.trace?.result?.modelExecution,
    newModel = after.trace?.result?.modelExecution;
  const direction =
    oldModel === newModel
      ? message("Unchanged", "未变化")
      : newModel === "SUCCEEDED"
        ? message(
            "Improved: model suggestions passed evidence validation",
            "改善：模型建议通过证据校验",
          )
        : oldModel === "SUCCEEDED"
          ? message(
              "Regressed: model suggestions no longer succeeded",
              "退化：模型建议未再成功通过",
            )
          : message("Changed, but quality is undetermined", "有变化，但无法判断质量方向");
  root.append(
    node("p", message("Model evidence status: ", "模型证据状态：") + direction),
  );
  for (const key of [
    "extractionMs",
    "deterministicAndCapabilityMs",
    "modelDeadlineInclusiveMs",
  ])
    root.append(
      node(
        "p",
        {
          extractionMs: message("Extraction", "提取"),
          deterministicAndCapabilityMs: message("Parser + capability", "解析与能力检查"),
          modelDeadlineInclusiveMs: message("Apple model", "Apple 模型"),
        }[key] +
          ": " +
          milliseconds(before.trace?.timings?.[key]) +
          " → " +
          milliseconds(after.trace?.timings?.[key]),
      ),
    );
  root.append(
    node(
      "p",
      message(
        "Timing compares these runs only. Model-resource cold state is unverified. Remote calls: 0; remote cost: 0.",
        "耗时仅对比这两次运行，模型资源冷状态未经验证。远端调用 0 次，远端成本 0。",
      ),
      "muted",
    ),
  );
  details(root, { before: before.id, after: after.id, diff });
  show(diff);
}
let annotationDraft,
  annotationCounter = 0;
const annotationTypes = {
  FLIGHT: ["Air transport", "航空交通"],
  STAY: ["Stay", "住宿"],
  CAR_RENTAL: ["Car rental", "租车"],
  SCHEDULED_TRANSPORT: ["Scheduled transport", "定时交通"],
  ACTIVITY: ["Activity / event", "活动／事件"],
  TICKET: ["Ticket / pass", "票证"],
  UNCLASSIFIED: ["Unclassified", "未分类"],
};
function choice(options, value) {
  const select = node("select");
  for (const [key, en, zh] of options) {
    const option = node("option", message(en, zh));
    option.value = key;
    select.append(option);
  }
  select.value = value;
  return select;
}
function emptyAnnotationField() {
  return { path: "service", raw: "", status: "UNCHECKED" };
}
function annotationId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + ++annotationCounter;
}
function newAnnotationResult() {
  return {
    id: annotationId("result"),
    type: "UNCLASSIFIED",
    status: "UNREVIEWED",
    fields: [],
    segments: [],
  };
}
function annotationFields(host) {
  return [...host.children]
    .filter((row) => row.gt)
    .map((row) => ({
      path: row.gt.path.value,
      raw: row.gt.raw.value,
      status: row.gt.status.value,
      ...(row.gt.participant.value.trim()
        ? { participantId: row.gt.participant.value.trim() }
        : {}),
    }));
}
function readAnnotationForm() {
  return {
    documentStatus: el("document-status").value,
    results: [...el("labels").children]
      .filter((row) => row.gtResult)
      .map((row) => {
        const data = row.gtResult;
        return {
          id: data.id,
          type: data.type.value,
          status: data.status.value,
          fields: annotationFields(data.fields),
          segments: [...data.segments.children]
            .filter((n) => n.gtSegment)
            .map((segment) => ({
              id: segment.gtSegment.id,
              fields: annotationFields(segment.gtSegment.fields),
            })),
        };
      }),
  };
}
function mutateAnnotation(action) {
  annotationDraft = readAnnotationForm();
  action(annotationDraft);
  renderAnnotationForm();
  setLabelControls();
}
function annotationFieldRow(host, field) {
  const row = node("div", undefined, "label-row"),
    path = choice(
      [
        ...new Set([
          ...traceFields(inspected?.trace).map((f) => f.path),
          ...Object.keys(fieldNames),
          field.path,
        ]),
      ].map((p) => [p, fieldName(p), fieldName(p)]),
      field.path,
    ),
    raw = node("input"),
    participant = node("input"),
    status = choice(
      [
        ["UNCHECKED", "Not checked", "尚未检查"],
        ["CONFIRMED", "Confirmed value", "已确认值"],
        ["NOT_PROVIDED", "Not provided by original", "原件未提供"],
      ],
      field.status,
    );
  raw.value = field.raw || "";
  raw.placeholder = message(
    "Expected original-text value (scored)",
    "预期原文值（用于评分）",
  );
  raw.setAttribute("aria-label", raw.placeholder);
  participant.value = field.participantId || "";
  participant.placeholder = message(
    "Traveller / participant label (optional)",
    "旅客／参与人标注（可选）",
  );
  participant.setAttribute("aria-label", participant.placeholder);
  path.setAttribute("aria-label", message("Field", "字段"));
  status.setAttribute("aria-label", message("Human review status", "人工检查状态"));
  row.gt = { path, raw, status, participant };
  row.append(
    path,
    raw,
    status,
    participant,
    button(message("Remove", "删除"), () => row.remove()),
  );
  host.append(row);
}
function renderAnnotationForm() {
  const host = el("labels");
  host.replaceChildren();
  el("document-status").value = annotationDraft.documentStatus;
  for (const [index, result] of annotationDraft.results.entries()) {
    const card = node("div", undefined, "annotation-result"),
      type = choice(
        Object.entries(annotationTypes).map(([key, pair]) => [key, ...pair]),
        result.type,
      ),
      status = choice(
        [
          ["UNREVIEWED", "Not checked", "尚未检查"],
          ["CONFIRMED", "Type checked", "类型已检查"],
          ["WRONG_TYPE", "Wrong business type", "业务类型识别错误"],
        ],
        result.status,
      ),
      fields = node("div"),
      segments = node("div");
    card.append(
      node("h3", message("Expected business result ", "标准答案业务结果 ") + (index + 1)),
      type,
      status,
      node(
        "p",
        message(
          "Diagnostic annotation only. Type choices do not imply that an interpreter exists.",
          "仅诊断标注；类型选项不代表对应解释器已实现。",
        ),
        "muted",
      ),
    );
    card.gtResult = { id: result.id, type, status, fields, segments };
    for (const field of result.fields) annotationFieldRow(fields, field);
    card.append(
      fields,
      button(message("Add field", "添加字段"), () =>
        mutateAnnotation((draft) =>
          draft.results[index].fields.push(emptyAnnotationField()),
        ),
      ),
    );
    for (const [segmentIndex, segment] of result.segments.entries()) {
      const block = node("div", undefined, "card"),
        segmentFields = node("div");
      block.gtSegment = { id: segment.id, fields: segmentFields };
      block.append(
        node("h3", message("Expected segment ", "标准答案分段 ") + (segmentIndex + 1)),
      );
      for (const field of segment.fields) annotationFieldRow(segmentFields, field);
      block.append(
        segmentFields,
        button(message("Add segment field", "添加分段字段"), () =>
          mutateAnnotation((draft) =>
            draft.results[index].segments[segmentIndex].fields.push(
              emptyAnnotationField(),
            ),
          ),
        ),
        button(message("Remove segment", "删除分段"), () =>
          mutateAnnotation((draft) =>
            draft.results[index].segments.splice(segmentIndex, 1),
          ),
        ),
      );
      segments.append(block);
    }
    card.append(
      segments,
      button(message("Add segment", "添加分段"), () =>
        mutateAnnotation((draft) =>
          draft.results[index].segments.push({
            id: annotationId("segment"),
            fields: [],
          }),
        ),
      ),
      button(message("Delete result", "删除结果"), () =>
        mutateAnnotation((draft) => draft.results.splice(index, 1)),
      ),
      button(message("Split result", "拆分结果"), () =>
        mutateAnnotation((draft) => {
          const current = draft.results[index],
            next = newAnnotationResult();
          next.type = current.type;
          next.fields = current.fields.splice(Math.ceil(current.fields.length / 2));
          draft.results.splice(index + 1, 0, next);
        }),
      ),
    );
    if (index)
      card.append(
        button(message("Merge into previous", "合并到上一结果"), () =>
          mutateAnnotation((draft) => {
            const current = draft.results[index],
              previous = draft.results[index - 1];
            previous.fields.push(...current.fields);
            previous.segments.push(...current.segments);
            previous.status = "UNREVIEWED";
            draft.results.splice(index, 1);
          }),
        ),
      );
    host.append(card);
  }
  if (!annotationDraft.results.length)
    host.append(
      node(
        "p",
        message(
          "Zero expected results. Choose No relevant content only after checking the document; otherwise leave Unreviewed.",
          "当前标准答案为零个结果。人工检查后才选择“无相关内容”，否则保留“尚未检查”。",
        ),
      ),
    );
}
function loadAnnotation(saved, run) {
  if (saved?.annotation) annotationDraft = JSON.parse(JSON.stringify(saved.annotation));
  else {
    const confirmed = Array.isArray(saved?.fields) ? saved.fields : [];
    annotationDraft = {
      documentStatus: confirmed.length ? "RESULTS" : "UNREVIEWED",
      results: confirmed.length
        ? [
            {
              id: "legacy-labels",
              type: (run.trace?.typed?.items || []).some(
                (i) => i.schema_id === "otr.import.flight",
              )
                ? "FLIGHT"
                : "UNCLASSIFIED",
              status: "CONFIRMED",
              fields: confirmed.map((f) => ({ ...f, status: "CONFIRMED" })),
              segments: [],
            },
          ]
        : [],
    };
  }
  el("kind").value = saved?.kind || "HUMAN_GROUND_TRUTH";
  renderAnnotationForm();
}

function renderStats(stats) {
  const root = el("stats");
  root.replaceChildren();
  if (stats.status !== "HUMAN_LABELLED" || stats.tp + stats.fn === 0)
    root.append(
      node(
        "p",
        stats.annotationSummary
          ? stats.annotationSummary.documentStatus === "NO_RELEVANT_CONTENT"
            ? message(
                "Human-marked no relevant content — field scoring is not applicable (N/A).",
                "已人工标注无相关内容 — 字段评分不适用（N/A）。",
              )
            : stats.annotationSummary.wrongTypeResults
              ? message(
                  "Wrong business type marked — field scoring is not applicable (N/A).",
                  "已标注业务类型识别错误 — 字段评分不适用（N/A）。",
                )
              : message(
                  "This annotation is incomplete or has no supported scoring scope (N/A). Unchecked fields are not parsing errors.",
                  "当前标注尚未完成或缺少支持的评分范围（N/A）；尚未检查不当作解析错误。",
                )
          : message(
              "Unlabelled / hypothesis — accuracy is not scored.",
              "未标注／仅推测 — 不计算准确率。",
            ),
      ),
    );
  else {
    root.append(
      node(
        "p",
        message("Exact field/value precision: ", "字段／值精确匹配率：") +
          (stats.precision === null ? "—" : (stats.precision * 100).toFixed(1) + "%") +
          message(" · Coverage: ", " · 覆盖率：") +
          (stats.recall === null ? "—" : (stats.recall * 100).toFixed(1) + "%"),
      ),
    );
    root.append(
      node(
        "p",
        message("Matching / unexpected / missing: ", "匹配／非预期／缺失：") +
          [stats.tp, stats.fp, stats.fn].join(" / "),
      ),
    );
    root.append(
      node(
        "p",
        message(
          "Original-text matching on explicitly reviewed field paths only. Business-result, segment and participant identity matching is not scored; unlabelled fields are not errors.",
          "仅对已明确检查的字段做原文值匹配；业务结果／航段／参与者身份匹配未评分。未标注字段不当作错误。",
        ),
        "muted",
      ),
    );
  }
  for (const label of [
    message("Type identification accuracy", "类型识别准确情况"),
    message("Evidence validity rate", "证据有效率"),
    message("Typed completeness", "结构完整性"),
    message("Local-model incremental value", "本地模型增量价值"),
    message("Remote upgrade rate", "远端升级率"),
  ])
    root.append(
      node(
        "p",
        label +
          ": N/A · " +
          message("No compatible evaluation recorded", "未记录相应评估"),
      ),
    );
  if (stats.reasonCode === "IDENTITY_ALIGNMENT_NOT_IMPLEMENTED")
    root.append(
      node(
        "p",
        message(
          "Identity alignment across results, segments or participants is not implemented; precision / recall are not scored.",
          "尚未实现结果／分段／参与人身份对齐，暂不计算精确率／召回率。",
        ),
      ),
    );
  if (stats.annotationSummary) {
    const summary = stats.annotationSummary;
    root.append(
      node(
        "p",
        message("Human annotations: ", "人工标注：") +
          summary.resultCount +
          message(" results · ", " 个结果 · ") +
          summary.segmentCount +
          message(" segments · ", " 个分段 · ") +
          summary.confirmedFields +
          message(" confirmed values · ", " 个确认值 · ") +
          summary.notProvidedFields +
          message(" not provided · ", " 个原件未提供 · ") +
          summary.uncheckedFields +
          message(" unchecked", " 个尚未检查"),
      ),
    );
  }
  if (stats.annotationSummary) details(root, stats.annotationSummary);
  details(root, stats);
}
async function refresh() {
  const state = await api("/api/state");
  latestState = state;
  savedInputs = state.inputs;
  el("native").textContent = state.native?.ready
    ? message("iOS runner connected and ready.", "iOS Runner 已连接，可以运行。")
    : message(
        "iOS runner is not connected or not armed. Mac runs remain available.",
        "iOS Runner 尚未连接或启用，仍可使用 Mac 本机运行。",
      );
  el("inputs").replaceChildren();
  for (const input of savedInputs) {
    if (!seenInputs.has(input.id)) {
      seenInputs.add(input.id);
      selectedInputs.add(input.id);
    }
    const row = node("div", undefined, "file-row"),
      label = node("label"),
      checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedInputs.has(input.id);
    checkbox.disabled = batchRunning;
    checkbox.onchange = () => {
      if (checkbox.checked) selectedInputs.add(input.id);
      else selectedInputs.delete(input.id);
      updateRunControls();
    };
    label.append(
      checkbox,
      node("span", input.name + " · " + (input.byteCount / 1024).toFixed(0) + " KB"),
    );
    row.append(label);
    details(row, input);
    el("inputs").append(row);
  }
  updateRunControls();
  el("runs").replaceChildren();
  for (const run of [...state.runs].sort((a, b) => b.createdAt - a.createdAt)) {
    const tr = node("tr");
    for (const value of [
      inputName(run.inputId),
      runName(run) + " · " + readableState(run.stage),
      run.fields ?? "—",
    ])
      tr.append(node("td", value));
    const td = node("td");
    td.append(button(message("Inspect", "检查"), () => inspect(run.id)));
    const replay = button(message("Run again", "再次运行"), () =>
      runInputs([run.inputId], run.runtime),
    );
    replay.disabled =
      batchRunning ||
      state.busy ||
      (run.runtime === "IOS_DIAGNOSTIC_COMPONENT" && !state.native?.ready);
    td.append(replay);
    for (const format of ["json", "html"]) {
      const link = node("a", message("Export ", "导出 ") + format.toUpperCase());
      link.href = "/api/run/" + run.id + "/" + format;
      td.append(link);
    }
    tr.append(td);
    el("runs").append(tr);
  }
  if (!inspectionLoading) {
    const currentInput =
      inspected?.inputId || inspected?.trace?.job?.inputId || el("inspect-input").value;
    el("inspect-input").replaceChildren();
    for (const input of savedInputs) {
      const option = node("option", input.name);
      option.value = input.id;
      el("inspect-input").append(option);
    }
    if (savedInputs.some((i) => i.id === currentInput))
      el("inspect-input").value = currentInput;
    populateInspectionRuns();
  }
  const previous = el("compare-input").value;
  el("compare-input").replaceChildren();
  for (const input of savedInputs) {
    const o = node("option", input.name);
    o.value = input.id;
    el("compare-input").append(o);
  }
  if (savedInputs.some((i) => i.id === previous)) el("compare-input").value = previous;
  // Keep a user's selected runs while the live status list refreshes.
  const a = el("a").value,
    b = el("b").value;
  populateCompareRuns();
  if (state.runs.some((r) => r.id === a && r.inputId === el("compare-input").value))
    el("a").value = a;
  if (state.runs.some((r) => r.id === b && r.inputId === el("compare-input").value))
    el("b").value = b;
  updateCompareControl();
  el("imports").replaceChildren();
  for (const [index, id] of (state.imports || []).entries())
    el("imports").append(
      button(message("View imported trace ", "查看导入记录 ") + (index + 1), () =>
        inspectImported(id),
      ),
    );
}
function populateInspectionRuns() {
  el("inspect-run").replaceChildren();
  const runs = [...(latestState?.runs || [])]
    .filter((r) => r.inputId === el("inspect-input").value)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const run of runs) {
    const option = node("option", runName(run) + " · " + readableState(run.stage));
    option.value = run.id;
    el("inspect-run").append(option);
  }
  const currentRun = selectedRun || (!inspectedImported ? inspected?.id : undefined);
  if (runs.some((r) => r.id === currentRun)) el("inspect-run").value = currentRun;
}
// Event wiring is deliberately separate so presentation can be tested without a browser runner.
for (const name of ["test", "inspect", "compare", "ground", "runs"])
  el("tab-" + name).onclick = () => {
    tab(name);
    if (name === "inspect" && !inspected) {
      const newest = [...(latestState?.runs || [])].sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      const run =
        newest.find((r) => r.stage === "FINISHED" && r.fields !== undefined) || newest[0];
      if (run) void inspect(run.id).catch(fail);
    }
  };
el("language").onclick = () => {
  if (selectedRun && !inspectionLoading) annotationDraft = readAnnotationForm();
  language = language === "en" ? "zh" : "en";
  localStorage.setItem("otr-workbench-language", language);
  translate();
  if (inspected) renderInspection(inspected, inspectedImported);
  if (selectedRun && annotationDraft && !inspectionLoading) {
    renderAnnotationForm();
    setLabelControls();
  }
  if (lastComparison)
    renderComparison(lastComparison.before, lastComparison.after, lastComparison.diff);
  void refresh().catch(fail);
};
el("files").onchange = (e) => {
  void addFiles(e.target.files).catch(fail);
};
el("drop").ondragover = (e) => e.preventDefault();
el("drop").ondrop = (e) => {
  e.preventDefault();
  void addFiles(e.dataTransfer.files).catch(fail);
};
el("run-selected").onclick = () => {
  void runInputs(
    savedInputs.filter((i) => selectedInputs.has(i.id)).map((i) => i.id),
    el("runtime").value,
  ).catch(fail);
};
el("run-all").onclick = () => {
  void runInputs(
    savedInputs.map((i) => i.id),
    el("runtime").value,
  ).catch(fail);
};
el("runtime").onchange = updateRunControls;
el("inspect-input").onchange = () => {
  populateInspectionRuns();
  if (el("inspect-run").value) void inspect(el("inspect-run").value).catch(fail);
};
el("inspect-run").onchange = () => {
  if (el("inspect-run").value) void inspect(el("inspect-run").value).catch(fail);
};
el("compare-input").onchange = populateCompareRuns;
el("a").onchange = updateCompareControl;
el("b").onchange = updateCompareControl;
el("compare").onclick = async () => {
  try {
    const a = el("a").value,
      b = el("b").value;
    if (!a || !b || a === b) throw new Error("COMPARE_REQUIRES_DIFFERENT_RUNS");
    const [before, after, diff] = await Promise.all([
      api("/api/run/" + a),
      api("/api/run/" + b),
      api("/api/compare?a=" + a + "&b=" + b),
    ]);
    renderComparison(before, after, diff);
  } catch (error) {
    fail(error);
  }
};
el("trace-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file || file.size > 2000000) throw new Error("TRACE_LIMIT");
    const imported = await api("/api/import-trace", JSON.parse(await file.text()));
    show(imported);
    await refresh();
  } catch (error) {
    fail(error);
  }
};
el("add-label").onclick = () =>
  mutateAnnotation((draft) => {
    draft.documentStatus = "RESULTS";
    draft.results.push(newAnnotationResult());
  });
el("document-status").onchange = () =>
  mutateAnnotation((draft) => {
    if (draft.documentStatus === "NO_RELEVANT_CONTENT") draft.results = [];
  });
el("save-labels").onclick = () => {
  void saveLabels().catch(fail);
};
translate();
setLabelControls();
tab("test");
void refresh()
  .then(() => {
    const latest = [...(latestState?.runs || [])].sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0];
    if (latest) return inspect(latest.id);
  })
  .catch(fail);
setInterval(() => {
  void refresh().catch(() => undefined);
}, 1500);
