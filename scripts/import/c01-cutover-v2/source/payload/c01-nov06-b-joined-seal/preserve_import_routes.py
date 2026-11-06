"""Build the exact full-fence to import-fence route CAS without applying it."""
from copy import deepcopy

from controls import FENCE, config_sha, route_plan

IMPORT_PATHS = (
    r"(?i)^/v2/(?:import-batches(?:/|$)|"
    r"capture-jobs/[^/]+/inputs/[^/]+/processing(?:/|$)|"
    r"trips/[^/]+/(?:sources|universal-source-originals)(?:/|$))"
)


def route_after_maintenance(original):
    full = route_plan(original)
    _,_,_,_,_,server,_,index,_ = full["path"].split("/")
    target = deepcopy(original)
    handlers = deepcopy(full["reverse"])
    replacement = [{"handler":"subroute","routes":[
        {"match":[{"path_regexp":{"name":"c01_preserved_import","pattern":IMPORT_PATHS}}],
         "handle":deepcopy(FENCE),"terminal":True},
        {"handle":handlers},
    ]}]
    target["apps"]["http"]["servers"][server]["routes"][int(index)]["handle"] = replacement
    return dict(path=full["path"],before=full["fenced"],fenced=config_sha(target),
                forward=replacement,reverse=deepcopy(FENCE))
