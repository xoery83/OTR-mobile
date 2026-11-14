import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BackendDependencies, createDevBackendHandler } from "../app";
import type { SelfTripNicknamePort } from "../selfTripNicknameHttp";

// Disposable exact-main source fixture only, never a runtime wrapper or shared-file editor.
export async function selfTripNicknameMountCandidate() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const packet = join(
    root,
    "docs/ops/auth-c03-self-nickname-20261105/app-mount-candidate",
  );
  const metadata = JSON.parse(readFileSync(join(packet, "PREIMAGE.json"), "utf8"));
  const directory = mkdtempSync(join(tmpdir(), "otr-self-nickname-mount-unit-"));
  const target = join(directory, "backend/src");
  mkdirSync(target, { recursive: true });
  const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const gitSource = (path: string) =>
    execFileSync("git", ["show", `${metadata.sourceMain}:${path}`], { cwd: root });
  try {
    for (const entry of readdirSync(join(root, "backend/src"), { withFileTypes: true })) {
      if (["app.ts", "selfTripNicknameHttp.ts"].includes(entry.name)) continue;
      symlinkSync(
        join(root, "backend/src", entry.name),
        join(target, entry.name),
        entry.isDirectory() ? "dir" : "file",
      );
    }
    function overlay(source: string, destination: string, descend: string[]) {
      mkdirSync(destination, { recursive: true });
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        const from = join(source, entry.name),
          to = join(destination, entry.name);
        if (entry.name === descend[0]) overlay(from, to, descend.slice(1));
        else symlinkSync(from, to, entry.isDirectory() ? "dir" : "file");
      }
    }
    overlay(join(root, "src"), join(directory, "src"), ["domain", "trip"]);
    symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "dir");
    const before = gitSource("backend/src/app.ts");
    if (hash(before) !== metadata.preSHA256) throw Error("APP_PREIMAGE_CHANGED");
    writeFileSync(join(target, "app.ts"), before);
    writeFileSync(join(target, "before.ts"), before);
    writeFileSync(
      join(target, "selfTripNicknameHttp.ts"),
      readFileSync(join(root, "backend/src/selfTripNicknameHttp.ts")),
    );
    // Extract only missing direct/transitive source imports from the same fixed main.
    function missingImports(text: string, owner: string) {
      for (const match of text.matchAll(/from ["'](\.[^"']+)["']/g)) {
        const path = resolve(dirname(owner), match[1]);
        if ([path, path + ".ts", path + ".tsx", join(path, "index.ts")].some(existsSync))
          continue;
        const file = path + ".ts";
        const sourcePath = file.startsWith(target + "/")
          ? "backend/src/" + file.slice(target.length + 1)
          : file.startsWith(join(directory, "src/domain/trip") + "/")
            ? "src/domain/trip/" +
              file.slice(join(directory, "src/domain/trip").length + 1)
            : null;
        if (!sourcePath) throw Error("FIXTURE_DEPENDENCY_OUTSIDE_FIXED_SOURCE");
        const contents = gitSource(sourcePath);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, contents);
        missingImports(contents.toString(), file);
      }
    }
    missingImports(before.toString(), join(target, "app.ts"));
    const patch = join(packet, "APP_OPTIONAL_PORT.patch");
    if (hash(readFileSync(patch)) !== metadata.patchSHA256)
      throw Error("APP_PATCH_CHANGED");
    execFileSync("git", ["apply", "--check", patch], { cwd: directory });
    execFileSync("git", ["apply", patch], { cwd: directory });
    if (hash(readFileSync(join(target, "app.ts"))) !== metadata.postSHA256)
      throw Error("APP_POSTIMAGE_CHANGED");
    type Module = {
      createDevBackendHandler: (
        options: BackendDependencies & { selfTripNicknamePort?: SelfTripNicknamePort },
      ) => ReturnType<typeof createDevBackendHandler>;
    };
    const baseline = (await import(
      /* @vite-ignore */ pathToFileURL(join(target, "before.ts")).href
    )) as Module;
    const patched = (await import(
      /* @vite-ignore */ pathToFileURL(join(target, "app.ts")).href
    )) as Module;
    return {
      baseline,
      patched,
      directory,
      metadata,
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
