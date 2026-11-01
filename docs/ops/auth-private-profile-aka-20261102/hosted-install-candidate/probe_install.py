"""Reuse the frozen disposable network-none installer fixture; no Hosted IO."""
import hashlib
from pathlib import Path
from render_install import GATE, OLD_GATE, render

HERE = Path(__file__).resolve().parent
original = HERE.parents[1] / 'auth-private-profile-20261031' / 'hosted-install-candidate' / 'probe_install.py'
source = original.read_text()
if hashlib.sha256(original.read_bytes()).hexdigest() != '44fedd2e5bb3543cd3a12c99c32b58e09fc96467d00813f18a1c1cf8d2aa95e7':
    raise ValueError('FROZEN_INSTALL_PROBE_MISMATCH')
if (HERE / 'INSTALL_CANDIDATE.sql').read_text() != render():
    raise ValueError('EXACT_AKA_INSTALL_REQUIRED')
source = source.replace(OLD_GATE, GATE)
anchor = '    sql(APPROVAL + INSTALL)\n'
if source.count(anchor) != 1:
    raise ValueError('FROZEN_INSTALL_PROBE_ANCHOR')
source = source.replace(anchor, "    sql(APPROVAL.replace('" + GATE + "','" + OLD_GATE + "') + INSTALL, error='PRIVATE_PROFILE_EXACT_DEV_GATE_REQUIRED')\n"
    + "    assert sql(CHECK_ABSENT) == 't'\n"
    + "    checks.append('old non-AKA approval marker cannot authorize the new candidate')\n" + anchor)
source = source.replace('LOCAL_INSTALL_CAS_PRIVILEGE_AND_ROLLBACK_PASS', 'LOCAL_AKA_INSTALL_CAS_PRIVILEGE_AND_ROLLBACK_PASS')
source = source.replace('installer fixture only; reuse existing unchanged-body domain/RLS proof separately',
    'installer fixture only; same AKA body550a36d7 domain/RLS/legacy-replay proof reused separately')
exec(compile(source, str(original), 'exec'), {'__file__': __file__})
