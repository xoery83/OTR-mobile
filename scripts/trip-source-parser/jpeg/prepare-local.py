"""Prepare only the pinned local test decoder; never register a Source profile."""
import hashlib, json, tarfile
from pathlib import Path

root = Path(__file__).resolve().parent
archive = root / "vendor/jpeg-js-0.4.4.tgz"
expected = json.loads((root / "DEPENDENCY.json").read_text())["sha256"]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
output = root / "decoder"
assert not output.is_symlink()
if not output.exists():
    output.mkdir(mode=0o700)
    allowed = {"package/lib/decoder.js", "package/package.json", "package/LICENSE", "package/README.md"}
    with tarfile.open(archive, "r:gz") as source:
        members = [entry for entry in source.getmembers() if entry.name in allowed]
        assert {entry.name for entry in members} == allowed and all(entry.isfile() for entry in members)
        source.extractall(output, members=members, filter="data")
module = output / "package/lib/decoder.js"
assert not (output / "package").is_symlink() and not module.is_symlink()
assert hashlib.sha256(module.read_bytes()).hexdigest() == "a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f"
assert json.loads((output / "package/package.json").read_text())["version"] == "0.4.4"
print("Pinned local decoder ready; Source execution remains closed.")
