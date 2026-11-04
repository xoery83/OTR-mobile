"""Pinned rewrite checks; does not claim actual Source proof/PG qualification."""
from pathlib import Path
import shutil
import sys
import tempfile
from build_finite_native_proof_candidate import PINS, build, changes, function_identity

assert function_identity("CREATE FUNCTION public.demo(actor uuid, pin trip_source_inputs, proof jsonb DEFAULT NULL::jsonb)\n RETURNS boolean") == "public.demo(uuid,public.trip_source_inputs,jsonb)"
assert function_identity("CREATE FUNCTION public.demo(actor uuid, trip uuid, source uuid)\n RETURNS boolean") != function_identity("CREATE FUNCTION public.demo(actor uuid, trip uuid, source uuid, frame jsonb)\n RETURNS boolean")
source = Path(sys.argv[1])
sql = build(source)
assert sql.count("EXECUTE definition;") == len(PINS)
assert "GRANT " not in sql and "ALTER ROLE " not in sql and "INSERT INTO" not in sql
for oid in PINS:
    original = (source / f"function-{oid}.private.sql").read_text()
    changed = original
    for old, new in changes(oid, original):
        assert changed.count(old) == 1
        changed = changed.replace(old, new)
    if oid == "66870":
        assert changed.endswith(original[original.index(" PERFORM public.trip_import_scope_lock"):])
    if oid == "65994":
        assert changed.endswith(original[original.index(" a:=public.trip_source_pdf_upload_v4_scope();"):])
    if oid == "66030":
        assert changed.endswith(original[original.index(" perform public.trip_source_pdf_registration_gate();"):])
    if oid == "66021":
        assert changed.endswith(original[original.index(" if session_user<>"):])
    if oid == "66872":
        suffix = original[original.index(" SELECT * INTO s FROM public.trip_sources"):]
        assert changed.endswith(suffix)
    if oid == "67145":
        suffix = original[original.index(" if not exists(select 1 from public.trip_source_revisions"):]
        assert changed.endswith(suffix)
with tempfile.TemporaryDirectory(prefix="finite-proof-preimage-") as directory:
    directory = Path(directory)
    for oid in PINS:
        shutil.copy(source / f"function-{oid}.private.sql", directory)
    first = directory / "function-66232.private.sql"
    first.write_text(first.read_text() + " ")
    try:
        build(directory)
    except ValueError as error:
        assert str(error) == "PREIMAGE_SHA_REJECTED_66232"
    else:
        raise AssertionError("Changed preimage accepted")
print("PINNED_GENERATOR_AND_PROOF_BODY_PRESERVATION_PASS; NOT_ACTUAL_PROOF_PG_PASS")
