#!/usr/bin/env python3
"""Local-only build package. No deploy, credentials, DEV, Provider or source registration.
Builds existing image with an additional explicit trusted-operator bundle. Never runs it.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


BASE_IMAGE = "sha256:40e998c31815a77452dd52dbbd6d8789ea8a815a6d1afba068029e97e919bbaa"


def candidate_dockerfile(root):
    # Fixed existing healthy runtime, not the incomplete local node:24 cache.
    # Only reviewed bundles change; no dependency install or networked build.
    return ("FROM " + BASE_IMAGE + "\n" +
            "\n".join("COPY --chown=otr:otr " + name + " /app/" + name
                      for name in ["server.mjs", "server-capture.mjs", "universal-prepare.mjs", "universal-settled-recovery.mjs"]) + "\n")


def prepare(root, output):
    output.mkdir(parents=True, exist_ok=False)
    dockerfile = output / "Dockerfile.universal"
    dockerfile.write_text(candidate_dockerfile(root))
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=root, text=True)
    if status:
        raise RuntimeError("SOURCE_NOT_FIXED_COMMIT_BEFORE_BUILD")
    manifest = {"status": "LOCAL_BUILD_PREPARED_NOT_DEPLOYED", "sourceHead": head,
                "dockerfileSha256": digest(dockerfile), "baseImageId": BASE_IMAGE, "imageId": None, "bundles": {}}
    for path in sorted((root / "backend/sql").glob("universal_*candidate.sql")):
        manifest.setdefault("sql", {})[str(path.relative_to(root))] = digest(path)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--build-local", action="store_true")
    parser.add_argument("--docker-context", help="optional existing context; never changes Docker configuration")
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    manifest = prepare(root, output)
    if args.build_local:
        entries = {"server.mjs": "backend/src/server.ts", "server-capture.mjs": "backend/src/serverCapture.ts",
                   "universal-prepare.mjs": "backend/src/universalPreparationMain.ts",
                   "universal-settled-recovery.mjs": "backend/src/universalSettledRecoveryMain.ts"}
        for name, entry in entries.items():
            bundle_args = ["npx", "--no-install", "esbuild", entry, "--bundle", "--platform=node", "--target=node24", "--format=esm", "--alias:@=./src", "--external:./src/data/auth/guestLocalWorkspace.ts", "--alias:expo-crypto=./backend/src/headlessExpoCrypto.ts",
                    "--outfile=" + str(output / name), '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);']
            if name != "server.mjs": bundle_args += ["--external:react-native", "--external:expo-*"]
            subprocess.run(bundle_args, cwd=root, check=True)
        docker = ["docker"] + (["--context", args.docker_context] if args.docker_context else [])
        subprocess.run(docker + ["image", "inspect", BASE_IMAGE], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(docker + ["build", "--platform", "linux/amd64", "--network", "none", "--pull=false", "--file", str(output / "Dockerfile.universal"),
                        "--iidfile", str(output / "image.id"), str(output)], check=True)
        image = (output / "image.id").read_text().strip()
        manifest["imageId"] = image
        # No candidate container startup/network. Copy exact built artifacts from a
        # stopped owned container, then remove only that container.
        container = subprocess.check_output(docker + ["create", "--network", "none", image], text=True).strip()
        try:
            for name in entries:
                subprocess.run(docker + ["cp", container + ":/app/" + name, str(output / name)], check=True)
                manifest["bundles"][name] = digest(output / name)
        finally:
            subprocess.run(docker + ["rm", container], check=True, stdout=subprocess.DEVNULL)
        manifest["status"] = "LOCAL_IMAGE_FIXED_NOT_DEPLOYED"
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
