// eslint-disable-next-line import/no-unresolved -- Fixed loopback route transpiles batch.ts.
import { runSequentialInputs } from "/batch.js";
/* Diagnostic presentation only. Untrusted data never enters innerHTML. */
let language = localStorage.getItem("otr-workbench-language") || "zh";
let selectedRun,
  inspected,
  latestState,
  batchRunning = false;
let inspectedImported = false;
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
      "模型输出未能匹配原文证据，确定性结果已保留。",
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
  for (const key of ["test", "inspect", "compare"]) {
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
  return runtime === "MAC_COMPONENT"
    ? message("Mac", "Mac 本机")
    : message("iOS Simulator", "iOS 模拟器");
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
    message("Source / evidence", "来源／证据"),
  ])
    head.append(node("th", title));
  table.append(head);
  for (const field of fields) {
    const row = node("tr"),
      value = fieldValue(field);
    row.append(node("td", fieldName(field.path || "service")), node("td", value));
    const evidence = node("td");
    evidence.append(
      button(
        source === "model"
          ? message("Apple suggestion · locate evidence", "Apple 补充建议 · 定位证据")
          : message("Deterministic · locate evidence", "确定性解析 · 定位证据"),
        () => locateEvidence(trace, field, inputId),
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
function locateEvidence(trace, field, inputId) {
  const host = el("evidence-view");
  host.hidden = false;
  host.replaceChildren(node("h2", message("Original evidence", "原件证据")));
  const evidence = field.evidence?.[0] || field;
  const excerpt = excerptAt(
    trace.result?.text || trace.extraction?.text,
    evidence.start,
    evidence.end,
  );
  host.append(
    node(
      "p",
      fieldName(field.path || "service") + " · " + (field.raw || field.literal || ""),
    ),
  );
  if (excerpt !== null) host.append(node("blockquote", excerpt));
  else
    host.append(
      node(
        "p",
        message(
          "No recorded text span for this field. No highlight is inferred.",
          "此字段没有已记录的文本范围，不推测高亮位置。",
        ),
      ),
    );
  const input = savedInputs.find((i) => i.id === inputId);
  if (input && /^[0-9a-f-]{36}$/.test(inputId)) {
    const url = "/api/input/" + inputId + "/original";
    const link = node("a", message("Open original", "打开原件"));
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    host.append(link);
    if (input.mediaType === "application/pdf") {
      const pages = (evidence.pages || []).filter((p) => Number.isInteger(p) && p >= 0);
      if (pages.length)
        host.append(
          node(
            "p",
            message("Page ", "第 ") +
              pages.map((p) => p + 1).join(", ") +
              message(
                " — page locator, not a precise rectangle.",
                " 页 — 仅页码定位，无精确矩形坐标。",
              ),
          ),
        );
      const frame = node("iframe");
      frame.title = message("Original PDF", "PDF 原件");
      frame.src = url + (pages.length ? "#page=" + (pages[0] + 1) : "");
      host.append(frame);
    } else if (input.mediaType.startsWith("image/")) {
      const wrap = node("div", undefined, "preview"),
        image = node("img");
      image.src = url;
      image.alt = input.name;
      wrap.append(image);
      for (const box of evidence.boxes || []) {
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
      host.append(wrap);
    }
  } else
    host.append(
      node(
        "p",
        message(
          "Imported trace has no local original attachment.",
          "导入记录未关联本地原件。",
        ),
        "muted",
      ),
    );
  details(host, evidence);
  host.scrollIntoView({ behavior: "auto", block: "start" });
}
function renderInspection(run, imported = false) {
  const root = el("inspection");
  root.replaceChildren();
  el("evidence-view").hidden = true;
  const trace = run.trace || (run.result ? run : null);
  const inputId = run.inputId || trace?.job?.inputId || trace?.result?.inputId;
  const input = savedInputs.find((i) => i.id === inputId);
  const title = section(root, "summary", inputName(inputId));
  if (!trace) {
    title.append(node("p", readableState(run.stage)));
    if (run.error) title.append(node("p", reasonText(run.error)));
    details(title, run);
    return;
  }
  const fields = traceFields(trace),
    suggestions = trace.result?.supplementalServiceObservations || [];
  const pages = trace.extraction?.pages || trace.result?.pages || [];
  const total = Date.parse(trace.finishedAt) - Date.parse(trace.startedAt);
  title.append(
    node(
      "p",
      [
        input?.mediaType || trace.job?.mediaType || message("Unknown format", "格式未知"),
        pages.length
          ? pages.length + message(" pages", " 页")
          : message("Page count not recorded", "未记录页数"),
        readableState(trace.result?.status),
        milliseconds(total >= 0 ? total : undefined),
      ].join(" · "),
      "status",
    ),
  );
  title.append(
    node(
      "p",
      fields.length +
        message(" deterministic fields; ", " 个确定性字段；") +
        suggestions.length +
        message(
          " evidence-linked model suggestions. These are observations, not admitted bookings.",
          " 条有证据的模型补充建议。这些是识别观察，不是已接纳的预订。",
        ),
    ),
  );
  if (imported)
    title.append(
      node(
        "p",
        message(
          "Imported trace — view only, runtime provenance unverified.",
          "导入记录 — 仅查看，运行身份未经验证。",
        ),
        "muted",
      ),
    );
  const nav = node("nav", undefined, "stage-nav");
  const names = [
    ["source", "Source", "原件"],
    ["extraction", "Extraction", "文本提取"],
    ["deterministic", "Deterministic", "确定性解析"],
    ["apple", "Apple Local", "Apple 本地模型"],
    ["evidence", "Evidence", "证据校验"],
    ["typed", "Typed", "航班结构"],
    ["candidate", "Candidate", "候选结果"],
  ];
  for (const [id, en, zh] of names) {
    const a = node("a", message(en, zh));
    a.href = "#stage-" + id;
    nav.append(a);
  }
  title.append(nav);
  const source = section(
    root,
    "stage-source",
    message("1. Source document", "1. 原件"),
    message(
      "Local original only. This diagnostic run does not create a formal Source or upload it.",
      "仅使用本地原件；本次诊断不创建正式 Source，也不上传原件。",
    ),
  );
  if (input) {
    const a = node("a", message("Open original", "打开原件"));
    a.href = "/api/input/" + input.id + "/original";
    a.target = "_blank";
    a.rel = "noopener";
    source.append(a);
  }
  const extraction = section(
    root,
    "stage-extraction",
    message("2. Extracted text / OCR", "2. 提取文本／OCR"),
    milliseconds(trace.timings?.extractionMs),
  );
  extraction.append(
    node(
      "pre",
      trace.extraction?.text ||
        trace.result?.text ||
        message("No extracted text recorded.", "未记录提取文本。"),
    ),
  );
  extraction.append(
    node(
      "p",
      (trace.extraction?.observations || []).length +
        message(" OCR text regions recorded.", " 个 OCR 文本区域。"),
      "muted",
    ),
  );
  const deterministic = section(
    root,
    "stage-deterministic",
    message("3. Deterministic travel fields", "3. 确定性旅行字段"),
    message("Parser and model-capability check combined: ", "解析与模型能力检查合计：") +
      milliseconds(trace.timings?.deterministicAndCapabilityMs),
  );
  fieldTable(deterministic, fields, trace, inputId);
  const apple = section(
    root,
    "stage-apple",
    message("4. Apple on-device model", "4. Apple 本地模型"),
    readableState(trace.result?.modelExecution || trace.model?.status) +
      " · " +
      milliseconds(trace.timings?.modelDeadlineInclusiveMs),
  );
  apple.append(
    node(
      "p",
      message("Availability: ", "可用性：") +
        readableState(trace.capability?.status || trace.result?.modelCapability),
    ),
  );
  if (
    trace.result?.modelExecution !== "SUCCEEDED" &&
    (trace.result?.modelReason || trace.model?.reason)
  )
    apple.append(node("p", reasonText(trace.result?.modelReason || trace.model?.reason)));
  apple.append(
    node(
      "p",
      message(
        "Suggestions stay separate from deterministic fields. They do not overwrite fields or add admitted flights.",
        "补充建议与确定性字段分开，不覆盖字段，也不新增已接纳的航班。",
      ),
      "muted",
    ),
  );
  fieldTable(
    apple,
    suggestions.map((s) => ({ ...s, path: "service" })),
    trace,
    inputId,
    "model",
  );
  if (
    (trace.model?.status === "FAILED" || trace.result?.modelExecution === "FAILED") &&
    !suggestions.length
  )
    apple.append(
      node(
        "p",
        message(
          "Rejected raw model output was not retained. Only the recorded failure reason is available; rejected field values cannot be reconstructed.",
          "被拒绝的模型原始输出未保留。现仅有失败原因，无法展示或还原被拒绝的字段值。",
        ),
      ),
    );
  const evidence = section(
    root,
    "stage-evidence",
    message("5. Evidence validation", "5. 证据校验"),
    message(
      "Evidence validation is included in parsing / model processing; no separate timing was recorded.",
      "证据校验包含在解析／模型处理中，未单独计时。",
    ),
  );
  evidence.append(
    node(
      "p",
      fields.length +
        (imported
          ? message(
              " parser fields recorded in this unverified import; ",
              " 个解析字段记录于此未经验证的导入文件；",
            )
          : message(
              " retained parser fields have production-validated original-text spans; ",
              " 个保留的解析字段具有正式校验的原文范围；",
            )) +
        suggestions.length +
        message(
          " model suggestions have exact source-text evidence.",
          " 条模型建议具有精确原文证据。",
        ),
    ),
  );
  if (trace.result?.modelExecution === "FAILED")
    evidence.append(node("p", reasonText(trace.result.modelReason)));
  evidence.append(
    node(
      "p",
      message(
        "Click a field to see its actual text span, PDF page or OCR region. No coordinates are invented.",
        "点击字段查看真实文本片段、PDF 页码或 OCR 区域，不生成不存在的坐标。",
      ),
    ),
  );
  const typed = section(
    root,
    "stage-typed",
    message("6. Flight typed interpretation", "6. 航班结构化结果"),
    readableState(trace.typed?.status) +
      " · " +
      message("No separate timing recorded", "未单独计时"),
  );
  for (const [index, item] of (trace.typed?.items || []).entries()) {
    const group = node("div", undefined, "card");
    group.append(node("h3", message("Travel item ", "旅行信息项 ") + (index + 1)));
    for (const f of item.fields || [])
      group.append(node("p", fieldName(f.path) + ": " + fieldValue(f)));
    // Display only the three existing local-enrichment conditions, not Admission requirements.
    const paths = new Set((item.fields || []).map((f) => f.path));
    const missing = ["service", "origin.airport", "destination.airport"].filter(
      (path) => !paths.has(path),
    );
    group.append(
      node(
        "p",
        missing.length
          ? message("Still missing for local enrichment: ", "本地增强条件仍缺：") +
              missing.map(fieldName).join("、")
          : message(
              "The three local-enrichment fields are present.",
              "三个本地增强条件字段已存在。",
            ),
      ),
    );
    for (const f of item.deferred || [])
      group.append(
        node("p", message("Deferred field: ", "待进一步处理字段：") + fieldName(f.path)),
      );
    typed.append(group);
  }
  if (!trace.typed?.items?.length)
    typed.append(
      node("p", message("No typed flight item recorded.", "尚无航班结构化信息项。")),
    );
  typed.append(
    node(
      "p",
      message(
        "This is a partial parser projection. The fields above are not a complete Admission required-field check; a model suggestion is not automatically included here.",
        "这是部分解析投影。上述缺项不是完整 Admission 必填校验；模型建议不会自动进入此结构。",
      ),
      "muted",
    ),
  );
  section(
    root,
    "stage-candidate",
    message("7. Candidate / Admission", "7. 候选结果／准入"),
    message(
      "Not available in this diagnostic tool. No formal Source authority, Canonical write or notification is produced.",
      "诊断工具不提供此步骤：没有正式 Source 授权，不写入 Canonical，也不发送通知。",
    ),
  );
  details(root, run);
  show(run);
}
function setLabelControls() {
  const disabled = inspectionLoading || labelSaving || !selectedRun;
  const controls = [
    el("kind"),
    el("add-label"),
    el("save-labels"),
    ...[...el("labels").children].flatMap((row) => [...row.children]),
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
    inspected = run;
    selectedRun = run.trace ? id : undefined;
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
    if (saved && Array.isArray(saved.fields) && saved.fields.length) {
      el("kind").value = saved.kind;
      for (const field of saved.fields) addLabelRow(field.path, field.raw);
    } else {
      el("kind").value = "HUMAN_GROUND_TRUTH";
      addLabelRow();
    }
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
  const fields = [...el("labels").children]
    .map((row) => ({
      path: row.querySelector("select").value,
      raw: row.querySelector("input").value.trim(),
    }))
    .filter((f) => f.raw);
  if (!fields.length) {
    renderStats({ status: "N/A" });
    el("notice").textContent = message(
      "No labels entered; existing saved labels were not changed.",
      "未输入标签，已有保存标签未修改。",
    );
    return;
  }
  const kind = el("kind").value;
  labelSaving = true;
  setLabelControls();
  try {
    await api("/api/run/" + runId + "/labels", { kind, fields });
    if (sequence !== inspectionSequence || selectedRun !== runId) return;
    const stats = await api("/api/run/" + runId + "/stats");
    if (sequence === inspectionSequence && selectedRun === runId) renderStats(stats);
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
  const root = el("comparison");
  root.replaceChildren();
  const a = traceFields(before.trace),
    b = traceFields(after.trace);
  const added = b.filter((f) => !a.some((x) => pairKey(x) === pairKey(f)));
  const removed = a.filter((f) => !b.some((x) => pairKey(x) === pairKey(f)));
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
function addLabelRow(path = "service", raw = "") {
  const row = node("div", undefined, "label-row"),
    select = node("select"),
    input = node("input");
  const paths = [
    ...new Set([
      ...Object.keys(fieldNames),
      ...traceFields(inspected?.trace).map((f) => f.path),
    ]),
  ];
  for (const p of paths) {
    const option = node("option", fieldName(p));
    option.value = p;
    select.append(option);
  }
  select.value = path;
  select.setAttribute("aria-label", message("Expected field", "预期字段"));
  input.value = raw;
  input.placeholder = message("Expected value from original", "原件中的预期值");
  input.setAttribute("aria-label", input.placeholder);
  row.append(
    select,
    input,
    button(message("Remove", "删除"), () => row.remove()),
  );
  el("labels").append(row);
}
function renderStats(stats) {
  const root = el("stats");
  root.replaceChildren();
  if (stats.status !== "HUMAN_LABELLED" || stats.tp + stats.fn === 0)
    root.append(
      node(
        "p",
        message(
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
          "Exact unique field/value pairs against your complete labels; not formal booking quality.",
          "以完整人工标签为基准，统计去重字段／值精确匹配，不代表正式预订质量。",
        ),
        "muted",
      ),
    );
  }
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
    tr.append(td);
    el("runs").append(tr);
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
// Event wiring is deliberately separate so presentation can be tested without a browser runner.
for (const name of ["test", "inspect", "compare"])
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
  language = language === "en" ? "zh" : "en";
  localStorage.setItem("otr-workbench-language", language);
  translate();
  if (inspected) renderInspection(inspected, inspectedImported);
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
el("add-label").onclick = () => addLabelRow();
el("save-labels").onclick = () => {
  void saveLabels().catch(fail);
};
translate();
setLabelControls();
tab("test");
void refresh().catch(fail);
setInterval(() => {
  void refresh().catch(() => undefined);
}, 1500);
