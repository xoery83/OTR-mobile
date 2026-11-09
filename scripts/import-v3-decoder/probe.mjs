// eslint-disable-next-line import/no-unresolved -- The image stages the locked Sharp package beside the probe.
import sharp from "sharp";
import { spawnSync } from "node:child_process";

const base = "/opt/otr/import-v3/pdf";
const versions = [
  [base + "/bin/qpdf", "--version", "qpdf version 11.3.0"],
  [base + "/bin/pdftotext", "-v", "pdftotext version 22.12.0"],
];
if (sharp.versions.sharp !== "0.35.5") process.exit(2);
for (const [path, option, expected] of versions) {
  const result = spawnSync(path, [option], {
    env: { LANG: "C.UTF-8", LD_LIBRARY_PATH: base + "/lib" },
    encoding: "utf8",
    timeout: 1000,
    maxBuffer: 4096,
  });
  if (result.status !== 0 || !(result.stdout + result.stderr).startsWith(expected))
    process.exit(2);
}
process.stdout.write("OTR_IMPORT_V3_READY");
