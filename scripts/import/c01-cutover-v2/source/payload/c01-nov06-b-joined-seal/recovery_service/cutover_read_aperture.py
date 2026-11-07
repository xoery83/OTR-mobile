"""Render a Caddy read aperture and its fail-closed loopback guard. No Host writes."""
from copy import deepcopy
import hashlib
import json
import re

APERTURE = "c01_exact_read_aperture"
PORT = 18787
BACKEND = "127.0.0.1:8787"
TABLE = "otr_c01_keep_v5"
UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
OLD_READ = re.compile(
    rf"(?:/v2/import-batches/{UUID}/interpretations/{UUID}\?tripId={UUID}"
    rf"|/v2/trips/{UUID}/receipts/{UUID}/content)"
)
DENY = [{"handler":"static_response","status_code":503,"headers":{"Cache-Control":["no-store"]}}]


def config_sha(config):
    return hashlib.sha256(json.dumps(config,sort_keys=True,separators=(",",":"),
                                    ensure_ascii=False,allow_nan=False).encode()).hexdigest()


def caddy_config(full_fence, full_fence_sha, old_reads, *, allow_health_only=False):
    if (config_sha(full_fence) != full_fence_sha or
            BACKEND in json.dumps(full_fence["apps"]["http"]["servers"])):
        raise ValueError("C01_FULL_CADDY_FENCE_DRIFT")
    minimum_reads = 0 if allow_health_only else 1
    if (not isinstance(old_reads,list) or not minimum_reads <= len(old_reads) <= 3
            or any(not isinstance(uri,str) or not OLD_READ.fullmatch(uri) for uri in old_reads)
            or len(set(old_reads)) != len(old_reads)):
        raise ValueError("C01_EXACT_OLD_GET_PINS_REQUIRED")
    candidate=deepcopy(full_fence)
    servers=candidate["apps"]["http"]["servers"]
    if APERTURE in servers or any(str(PORT) in listener for server in servers.values()
                                 for listener in server.get("listen",[])):
        raise ValueError("C01_APERTURE_LISTEN_COLLISION")
    routes=[]
    for uri in ["/health",*old_reads]:
        expression="{http.request.uri} == "+json.dumps(uri)
        match={"method":["GET"],"expression":expression}
        if uri != "/health":
            match["header"]={"Authorization":["*"]}
        # The upstream path is fixed again. Backend remains the owning auth check.
        proxy={"handler":"reverse_proxy","upstreams":[{"dial":BACKEND}],
               "rewrite":{"method":"GET","uri":uri},
               "transport":{"protocol":"http","keep_alive":{"enabled":False}}}
        routes.append({"match":[match],"handle":[proxy],"terminal":True})
    routes.append({"handle":deepcopy(DENY),"terminal":True})
    servers[APERTURE]={"listen":[f"127.0.0.1:{PORT}"],"protocols":["h1"],
                       "automatic_https":{"disable":True},"routes":routes}
    return candidate


def nft_rules(caddy_uid,caddy_cgroup):
    if (type(caddy_uid) is not int or not 0 < caddy_uid < 2**32-1
            or not re.fullmatch(r"system\.slice/[A-Za-z0-9_.@-]+\.service",caddy_cgroup)):
        raise ValueError("C01_EXACT_CADDY_SOCKET_OWNER_REQUIRED")
    match=f'ip daddr 127.0.0.1 tcp dport 8787'
    owner=f'meta skuid {caddy_uid} socket cgroupv2 level 2 "{caddy_cgroup}"'
    return f"""table inet {TABLE} {{
 chain redirect_reads {{
  type nat hook output priority dstnat; policy accept;
  {match} {owner} return
  {match} counter redirect to :{PORT}
 }}
 chain refuse_raw {{
  type filter hook output priority filter; policy accept;
  {match} {owner} return
  {match} counter drop
 }}
}}
"""

def replace_handler(config, route, key):
    path=route["path"]
    match=re.fullmatch(r"/config/apps/http/servers/([A-Za-z0-9_-]+)/routes/([0-9]+)/handle",path)
    if match is None:
        raise ValueError("C01_EXACT_ROUTE_PATH_REQUIRED")
    server,index=match.groups()
    result=deepcopy(config)
    result["apps"]["http"]["servers"][server]["routes"][int(index)]["handle"]=route[key]
    return result


def binding_valid(value, *, require_legacy_pg=True, allow_health_only=False):
    hashes = {"nftSHA256", "fullSHA256", "scopedSHA256"}
    if require_legacy_pg:
        hashes.add("legacyPGFenceSHA256")
    if not isinstance(value,dict) or set(value) != hashes | {
            "oldReads","caddyUid","caddyCgroup","caddyPidStart"}:
        raise ValueError("C01_COMPOSITE_BINDING_REQUIRED")
    nft_rules(value["caddyUid"],value["caddyCgroup"])
    old=value["oldReads"]
    minimum_reads = 0 if allow_health_only else 1
    if (not isinstance(old,list) or not minimum_reads <= len(old) <= 3 or
        any(not isinstance(x,str) or not OLD_READ.fullmatch(x) for x in old) or len(set(old))!=len(old)
        or not isinstance(value["caddyPidStart"],list) or len(value["caddyPidStart"])!=2
        or any(type(x) is not int or x<=0 for x in value["caddyPidStart"])
        or any(not isinstance(value[key],str) or not re.fullmatch(r"[0-9a-f]{64}",value[key])
               for key in hashes)):
        raise ValueError("C01_COMPOSITE_BINDING_DRIFT")


def servers_cas(raw,etag,before,after):
    if config_sha(json.loads(raw))!=before:
        raise ValueError("C01_COMPOSITE_CADDY_PREIMAGE_DRIFT")
    tag=2166136261
    for byte in raw:
        tag=((tag^byte)*16777619)&0xffffffff
    if etag!=f'"/config/ {tag:08x}"':
        raise ValueError("C01_COMPOSITE_CADDY_ETAG_DRIFT")
    old=json.loads(raw)
    old["apps"]["http"]["servers"]=after["apps"]["http"]["servers"]
    if old!=after:
        raise ValueError("C01_CADDY_NON_SERVER_CHANGE")
    return "/config/apps/http/servers",{"If-Match":etag,"Content-Type":"application/json"},after["apps"]["http"]["servers"]


def rollback_projection(current, fence_route, before_sha, aperture):
    if config_sha(current) not in {aperture["fullSHA256"],aperture["scopedSHA256"]}:
        raise ValueError("C01_ROLLBACK_COMPOSITE_PREIMAGE_DRIFT")
    restored=replace_handler(current,fence_route,"reverse")
    del restored["apps"]["http"]["servers"][APERTURE]
    if config_sha(restored)!=before_sha:
        raise ValueError("C01_ROLLBACK_CADDY_POSTIMAGE_DRIFT")
    return restored, f"delete table inet {TABLE}\n"


def proof_pins(aperture):
    return {key:aperture[key] for key in ("scopedSHA256","nftSHA256","legacyPGFenceSHA256")}


if __name__ == "__main__":
    import argparse
    import os
    from pathlib import Path
    cli=argparse.ArgumentParser()
    cli.add_argument("binding",type=Path)
    cli.add_argument("output",type=Path)
    args=cli.parse_args()
    value=json.loads(args.binding.read_bytes())
    config=caddy_config(value["fullFence"],value["fullFenceSHA256"],value["oldReads"])
    output={"caddyConfig":config,"caddySHA256":config_sha(config),
            "nftRules":nft_rules(value["caddyUid"],value["caddyCgroup"])}
    raw=(json.dumps(output,sort_keys=True)+"\n").encode()
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    print(json.dumps({"caddySHA256":output["caddySHA256"],
                      "sealedOutputSHA256":hashlib.sha256(raw).hexdigest()}))
