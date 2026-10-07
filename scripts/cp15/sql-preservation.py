"""Unchanged CP13A/Trip protection tests, rollback-only on network-none Server84."""
from pathlib import Path
import subprocess,re,sys,json
root=Path(__file__).resolve().parents[2]
container='otr-cp15-seeded'
assert subprocess.check_output(['docker','inspect',container,'--format','{{.HostConfig.NetworkMode}}'],text=True).strip()=='none'
command=['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres']
files=['trip_event_command_foundation','trip_event_collection','trip_source_protected_foundation','trip_source_command_foundation','trip_source_execution_journal','trip_import_flight_security','trip_import_flight_admission']
seed=subprocess.run(command,input=(root/'supabase/seed.sql').read_text(),text=True,capture_output=True);assert seed.returncode==0,seed.stderr[-1500:]
checks=0
for name in files:
 test_command=command.copy();test_command[test_command.index("supabase_admin") ]="postgres" if name=="trip_source_protected_foundation" else "supabase_admin"
 result=subprocess.run(test_command,input=(root/f'supabase/tests/{name}.test.sql').read_text(),text=True,capture_output=True)
 assert result.returncode==0,(name,result.stderr[-1500:])
 assert not re.search(r'^not ok',result.stdout,re.M),(name,result.stdout[-2000:])
 count=len(re.findall(r'^ok [0-9]+',result.stdout,re.M));assert count>0,name;checks+=count
 print('PASS',name,count,flush=True)
# Reuse the actual C1 UNKNOWN → C2/C3 shared-lock race without changing its source.
source=(root/'scripts/cp13a/verify-local-admission-races.py').read_text().replace(r'otr-cp13a-acceptance(?:-[a-z0-9]+)?',container)
# Avoid TextIO read-ahead hiding the barrier from the original fd selector.
source=source.replace('import json', 'import json\nimport os').replace('line = holder.stdout.readline()', 'line = b""\n        while not line.endswith(b"\\n"):\n            line += os.read(holder.stdout.fileno(), 1)\n        line = line.decode()')
sys.argv=[str(root/'scripts/cp13a/verify-local-admission-races.py'),container]
exec(compile(source,sys.argv[0],'exec'),{'__file__':sys.argv[0]})
print(json.dumps({'status':'PASS','sql_checks':checks,'canonical_authority':'UNCHANGED','provider_calls':0}))
