import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(root + "package.json"), ts = require("typescript");
const receipt = JSON.parse(fs.readFileSync(new URL("./VALIDATION.json", import.meta.url), "utf8"));
const files = receipt.files.filter((file) => /\.tsx?$/.test(file)).map((file) => root + file);
if (files.length !== 14) throw Error("FIXED_UI_TYPE_ROOTS_REQUIRED");
const raw = ts.readConfigFile(root + "tsconfig.json", ts.sys.readFile);
if (raw.error) throw Error("CONFIG_READ_FAILED");
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, root);
const program = ts.createProgram(files, { ...config.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => root,
  getCanonicalFileName: (file) => file,
  getNewLine: () => "\n",
}));
console.log(JSON.stringify({ status: "SCOPED_UI_TYPES_PASS", rootFiles: files.length }));
