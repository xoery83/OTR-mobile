"""Reuse the pinned network-none Profile PG fixture, with AKA-only extra checks."""
import hashlib
from pathlib import Path

original = Path(__file__).resolve().parent.parent / 'auth-private-profile-20261031' / 'probe_private_profile.py'
source = original.read_text()
assert hashlib.sha256(original.read_bytes()).hexdigest() == 'bc00ce5370e3ccb2004b760b73dcee6a407cb0b779afd7bc9b83a343245ec3a4'
anchor = "    proof = {'status': 'LOCAL_PROFILE_RLS_CAS_AND_RECOVERY_PASS', 'checks': checks,"
assert source.count(anchor) == 1
extra = '''    # Old request receipt remains identical after subsequent edits; no AKA default enters its digest.
    assert json.loads(sql(save(A, OP, 0, changes))) == first
    aka = ["  林 e\\u0301  ", "علي", "林", "林", ""]
    aka_op = str(uuid.uuid4())
    result = json.loads(sql(save(A, aka_op, 3, {'globalAka': aka})))
    assert result['revision'] == 4 and json.loads(sql(save(A, aka_op, 3, {'globalAka': aka}))) == result
    fields = json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;'))
    assert fields == {**final, 'globalAka': aka}
    sql(save(A, aka_op, 3, {'globalAka': []}), error='PROFILE_OPERATION_COLLISION')
    for invalid in [None, 'alias', [None], [7], [{'accountId': B}]]:
        sql(save(A, str(uuid.uuid4()), 4, {'globalAka': invalid}), error='PROFILE_INVALID')
    sql(save(A, str(uuid.uuid4()), 4, {'displayName': 'changed display'}))
    assert json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;'))['globalAka'] == aka
    sql(save(A, str(uuid.uuid4()), 5, {'globalAka': []}))
    fields = json.loads(sql(actor(A) + 'SELECT fields_json FROM public.account_private_profiles;'))
    assert fields['globalAka'] == [] and fields['travelDocumentName'] == changes['travelDocumentName']
    assert sql(actor(B) + 'SELECT count(*) FROM public.account_private_profiles WHERE account_id=' + quote(A) + ';') == '0'
    assert json.loads(sql(save(A, OP, 0, changes))) == first
    checks.append('private AKA Unicode/order/duplicates/blank preserved, same-operation replay identical, changed payload collides')
    checks.append('AKA absent means preserve, explicit empty means clear; invalid element types fail; foreign Account RLS remains denied')
'''
source = source.replace(anchor, extra + anchor)
source = source.replace("'LOCAL_PROFILE_RLS_CAS_AND_RECOVERY_PASS'", "'LOCAL_PRIVATE_AKA_PROFILE_CAS_LEGACY_REPLAY_PASS'")
exec(compile(source, str(original), 'exec'), {'__file__': __file__})
