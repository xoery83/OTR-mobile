/* Local diagnostic UI. Untrusted filenames, text, Trace and errors use textContent. */
let language = localStorage.getItem("otr-workbench-language") || "en";
let selectedRun;
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
  el("native").textContent =
    message("iOS caller last seen: ", "iOS caller 最近连接：") +
    (state.lastNativeSeen || "N/A");
  el("inputs").replaceChildren();
  for (const input of state.inputs) {
    const row = document.createElement("div");
    const name = document.createElement("small");
    name.textContent =
      input.name + " · " + input.byteCount + " bytes · SHA256 " + input.sha256;
    row.append(name);
    for (const runtime of ["MAC_COMPONENT", "IOS_DIAGNOSTIC_COMPONENT"])
      row.append(
        button(message("Run ", "运行 ") + runtime, async () => {
          show(await api("/api/run", { inputId: input.id, runtime }));
          await refresh();
        }),
      );
    el("inputs").append(row);
  }
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
translate();
void refresh().catch((e) => show({ error: e.message }));
setInterval(() => {
  void refresh().catch(() => undefined);
}, 1500);
