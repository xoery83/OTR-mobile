"""Verify B2 review preflight on an already replayed task-owned disposable DB.

No new application authority or SQL is authored. Runs the accepted Server83
acceptance plus review-lifecycle probes. Requires network-none container
otr-cp14-b2-preflight, populated by the unchanged replay-disposable.py harness.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / "scripts/cp14/persistence-acceptance.py").read_text()
marker = "review_result=invoke("
assert source.count(marker) == 1
probes = r'''# B2 literal pre-proposal review reservation is not an admitted decision.
b2_start = checks
for updates, expected in [
    ({"confirmed_at": None}, 'null value in column "confirmed_at"'),
    ({"confirmed_user_id": None}, 'null value in column "confirmed_user_id"'),
    ({"disposition": "PROPOSED"}, "violates check constraint"),
    ({"state": "NEEDS_REVIEW"}, "CP14_REVIEW_SCOPE"),
    ({"disposition": "REJECT"}, "violates check constraint"),
    ({"disposition": "DEFER"}, "violates check constraint"),
]:
    proposed = {**review, "review_decision_id": uid(), "review_key": uid(),
                "candidate_id": uid(), **updates}
    invoke("inbound_ai_reserve_review", {**scope, "row": proposed},
           "inbound_gateway", "OTR_USER", expect_error=expected)
# Existing package refs are references, not a pending review-decision contract.
equal(scalar("select public.cp14_publication_refs('[{\"kind\":\"REVIEW\"}]'::jsonb);"),
      "f", "B2 package refs do not add REVIEW authority")
print("PASS B2 exact review-lifecycle preflight: " + str(checks-b2_start) + " checks", flush=True)
'''
source = source.replace(marker, probes + marker, 1)
source = source.replace("otr-cp14-acceptance", "otr-cp14-b2-preflight")
exec(compile(source, str(root / "scripts/cp14/persistence-acceptance.py"), "exec"),
     {"__file__": str(root / "scripts/cp14/persistence-acceptance.py")})
