// eslint-disable-next-line import/no-unresolved -- Fixed loopback route transpiles batch.ts; no filesystem URL.
import { runSequentialInputs } from "/batch.js";
/* Local diagnostic UI. Untrusted filenames, text, Trace and errors use textContent. */
let language = localStorage.getItem("otr-workbench-language") || "en";
let selectedRun;
let savedInputs = [];
const selectedInputs = new Set();
const seenInputs = new Set();
let batchRunning = false;
let latestState;
function updateRunControls() {
  const nativeReady = latestState?.native?.ready === true;
  el("runtime").querySelector('option[value="IOS_DIAGNOSTIC_COMPONENT"]').disabled =
    !nativeReady;
  const disabled =
    batchRunning ||
    latestState?.busy ||
    (el("runtime").value === "IOS_DIAGNOSTIC_COMPONENT" && !nativeReady);
  el("run-selected").disabled = disabled || selectedInputs.size === 0;
  el("run-all").disabled = disabled || savedInputs.length === 0;
}
async function runInputs(ids, runtime) {
  if (batchRunning || !ids.length) return;
  batchRunning = true;
  updateRunControls();
  try {
    const results = await runSequentialInputs(ids, runtime, api, (current) => {
      el("batch-status").textContent =
        current.index +
        "/" +
        current.total +
        " · " +
        current.inputId.slice(0, 8) +
        " · " +
        current.stage;
    });
    show({ diagnosticBatch: results });
    el("batch-status").textContent =
      message("Batch ended: ", "批次结束：") + results.map((r) => r.stage).join(" / ");
  } finally {
    batchRunning = false;
    await refresh();
  }
}
const el = (id) => document.getElementById(id);
const message = (en, zh) => (language === "zh" ? zh : en);
function translate() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-en]").forEach((n) => {
    n.textContent = n.dataset[language];
  });
}
function show(v) {
  el("output").textContent = JSON.stringify(v, null, 2);
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
function button(text, action) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = () =>
    Promise.resolve()
      .then(action)
      .catch((e) => show({ error: e.message }));
  return b;
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
}
async function inspect(id) {
  selectedRun = id;
  show(await api("/api/run/" + id));
  el("exports").replaceChildren();
  for (const format of ["json", "html"]) {
    const a = document.createElement("a");
    a.href = "/api/run/" + id + "/" + format;
    a.textContent = message("Export ", "导出 ") + format.toUpperCase();
    el("exports").append(a);
  }
  el("stats").textContent = JSON.stringify(
    await api("/api/run/" + id + "/stats"),
    null,
    2,
  );
}
async function refresh() {
  const state = await api("/api/state");
  el("imports").replaceChildren();
  for (const id of state.imports ?? [])
    el("imports").append(
      button("Imported / 已导入 " + id.slice(0, 8), async () =>
        show(await api("/api/import/" + id)),
      ),
    );
  latestState = state;
  savedInputs = state.inputs;
  const nativeReady = state.native?.ready === true;
  el("native").textContent = nativeReady
    ? message(
        "Native caller connected · executed Native/JS versions UNVERIFIED",
        "Native caller 已连接 · 实际 Native／JS 版本未经验证",
      )
    : message(
        "Native caller not connected / not armed — iOS Run disabled; executed Native/JS versions UNVERIFIED",
        "Native caller 未连接／未启用 — iOS 运行不可用；实际 Native／JS 版本未经验证",
      );
  el("inputs").replaceChildren();
  for (const input of state.inputs) {
    if (!seenInputs.has(input.id)) {
      seenInputs.add(input.id);
      selectedInputs.add(input.id);
    }
    const row = document.createElement("div");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedInputs.has(input.id);
    checkbox.disabled = batchRunning;
    checkbox.onchange = () => {
      if (checkbox.checked) selectedInputs.add(input.id);
      else selectedInputs.delete(input.id);
      updateRunControls();
    };
    const name = document.createElement("small");
    name.textContent =
      input.name + " · " + input.byteCount + " bytes · SHA256 " + input.sha256;
    label.append(checkbox, name);
    row.append(label);
    for (const runtime of ["MAC_COMPONENT", "IOS_DIAGNOSTIC_COMPONENT"]) {
      const run = button(message("Run ", "运行 ") + runtime, () =>
        runInputs([input.id], runtime),
      );
      run.disabled =
        batchRunning ||
        state.busy ||
        (runtime === "IOS_DIAGNOSTIC_COMPONENT" && !nativeReady);
      row.append(run);
    }
    el("inputs").append(row);
  }
  updateRunControls();
  el("runs").replaceChildren();
  for (const run of state.runs) {
    const tr = document.createElement("tr");
    for (const value of [
      run.id.slice(0, 8) + " / " + run.inputId.slice(0, 8),
      run.runtime + " / " + run.stage,
      (run.fields ?? "—") + " / " + (run.model ?? run.error ?? "—"),
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    const td = document.createElement("td");
    td.append(button(message("View", "查看"), () => inspect(run.id)));
    tr.append(td);
    el("runs").append(tr);
  }
  for (const name of ["a", "b"]) {
    const old = el(name).value;
    el(name).replaceChildren();
    for (const run of state.runs.filter((r) => r.stage === "FINISHED")) {
      const option = document.createElement("option");
      option.value = run.id;
      option.textContent = run.id.slice(0, 8) + " / " + run.runtime;
      el(name).append(option);
    }
    if (old) el(name).value = old;
  }
}
el("language").onclick = () => {
  language = language === "en" ? "zh" : "en";
  localStorage.setItem("otr-workbench-language", language);
  translate();
  void refresh();
};
el("files").onchange = (e) => {
  void addFiles(e.target.files).catch((e) => show({ error: e.message }));
};
el("drop").ondragover = (e) => e.preventDefault();
el("drop").ondrop = (e) => {
  e.preventDefault();
  void addFiles(e.dataTransfer.files).catch((e) => show({ error: e.message }));
};
el("compare").onclick = () => {
  void api("/api/compare?a=" + el("a").value + "&b=" + el("b").value)
    .then(show)
    .catch((e) => show({ error: e.message }));
};
el("trace-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file || file.size > 2000000) throw new Error("TRACE_LIMIT");
    show(await api("/api/import-trace", JSON.parse(await file.text())));
  } catch (error) {
    show({ error: error.message });
  }
};
el("save-labels").onclick = async () => {
  try {
    if (!selectedRun) throw new Error("SELECT_RUN");
    await api("/api/run/" + selectedRun + "/labels", {
      kind: el("kind").value,
      fields: JSON.parse(el("labels").value),
    });
    el("stats").textContent = JSON.stringify(
      await api("/api/run/" + selectedRun + "/stats"),
      null,
      2,
    );
  } catch (error) {
    show({ error: error.message });
  }
};
el("run-selected").onclick = () => {
  void runInputs(
    savedInputs.filter((i) => selectedInputs.has(i.id)).map((i) => i.id),
    el("runtime").value,
  ).catch((e) => show({ error: e.message }));
};
el("run-all").onclick = () => {
  void runInputs(
    savedInputs.map((i) => i.id),
    el("runtime").value,
  ).catch((e) => show({ error: e.message }));
};
el("runtime").onchange = updateRunControls;
translate();
void refresh().catch((e) => show({ error: e.message }));
setInterval(() => {
  void refresh().catch(() => undefined);
}, 1500);
