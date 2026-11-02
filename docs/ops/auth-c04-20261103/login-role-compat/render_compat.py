"""Render only the reviewed existing-LOGIN-role compatibility delta; no execution."""
import hashlib
from pathlib import Path

SOURCE_SHA256 = "2eec272c3551e4b8184621ec0728f7773cf2b363785ba08ba706c5189ce6d587"
OLD_MARKER = "OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_V1"
NEW_MARKER = "OTR_MEMBER_CLAIM_REGISTERED_DEV_20261103_LOGIN_COMPAT_V1"
OLD_GUARD = "rolname='otr_trip_core_v2_gateway' AND NOT rolcanlogin"
NEW_GUARD = ("rolname='otr_trip_core_v2_gateway' AND rolcanlogin"
             " AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit"
             " AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication")

def render(source: bytes) -> bytes:
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError("APPROVED_SOURCE_BYTES_REQUIRED")
    text = source.decode("utf8")
    if text.count(OLD_MARKER) != 1 or text.count(OLD_GUARD) != 1:
        raise ValueError("EXACT_TWO_REPLACEMENTS_REQUIRED")
    return text.replace(OLD_MARKER, NEW_MARKER).replace(OLD_GUARD, NEW_GUARD).encode("utf8")

if __name__ == "__main__":
    directory = Path(__file__).resolve().parent
    source = directory.parent / "pg-candidate/MEMBER_CLAIM_CANDIDATE.sql"
    destination = directory / "INSTALL_CANDIDATE.sql"
    destination.write_bytes(render(source.read_bytes()))
