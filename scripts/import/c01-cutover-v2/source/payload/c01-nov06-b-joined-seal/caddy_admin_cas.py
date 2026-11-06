"""Bind the exact Caddy 2.6.2 Unix-admin config root to the reviewed route CAS."""
from controls import cas_request

CONFIG_ROOT = "/config/"


def admin_cas_request(plan, raw, etag, reverse=False):
    prefix = '"' + CONFIG_ROOT + " "
    if not isinstance(etag, str) or not etag.startswith(prefix):
        raise ValueError("EXACT_CADDY_ROOT_TRAILER_REQUIRED")
    method, path, headers, body = cas_request(
        plan, raw, '"/config ' + etag[len(prefix):], reverse=reverse,
    )
    return method, path, {**headers, "If-Match": etag}, body
