"""Run the unchanged Server83 matrix against the task-owned network-none Server84 fixture."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=(root/'scripts/cp14/persistence-acceptance.py').read_text()
source=source.replace("CONTAINER='otr-cp14-acceptance'","CONTAINER='otr-cp15-acceptance'")
# Original V1 clients omit the new nullable field, including START grammar.
source=source.replace("return result\n\ndef request","result.pop('provider_request_id',None)\n return result\n\ndef request")
exec(compile(source,str(root/'scripts/cp14/persistence-acceptance.py'),'exec'))
