"""Reuse owned network-none CP14 schema fixture; actual grant CAS, zero DEV access."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
fixture=ROOT/'scripts/import-workbench/universal-config-sql-acceptance.py'
prefix=fixture.read_text().split('    # Arm-before-provision:')[0]
body=r'''
    from universal_config_control import prepare_grant_provision_sql,revoke_sql,revoked_sql,authority_sql
    import datetime as dt
    qa=str(uuid.uuid4());sql("insert into auth.users(id) values('"+qa+"');insert into public.profiles(id,display_name) values('"+qa+"','Isolated grant renewal');",'supabase_admin')
    p=json.loads(json.dumps(p).replace(actor,qa));a=p['adminControl'];a['grantRenewalPreimages']={}
    start=dt.datetime.fromisoformat(a['startsAt'].replace('Z','+00:00'))
    for g in a['temporaryGrants']:
        prior=copy.deepcopy(g);prior.update(grant_revision=2,created_at=(start-dt.timedelta(seconds=120)).isoformat(),expires_at=(start-dt.timedelta(seconds=20)).isoformat(),revoked_at=(start-dt.timedelta(seconds=40)).isoformat())
        a['grantRenewalPreimages'][g['permission']]=prior;g.update(grant_revision=3,created_at=prior['created_at'])
        sql("insert into public.external_integration_admin_grants select (jsonb_populate_record(null::public.external_integration_admin_grants,"+ns['literal'](prior)+")).*;")
    for x in a['activation']+a['restore']:
        c=x['command'];c['request_sha256']=hashlib.sha256(canonical({'domain':'otr-cp14-command-v1','command':{k:v for k,v in c.items() if k!='request_sha256'}})).hexdigest();x['context']['request_sha256']=c['request_sha256']
    validate_admin(p)
    assert restore_once(p,wrapped,recover_only=True)['status']=='CLOSED_VERIFIED'
    before=json.loads(sql("select jsonb_agg(to_jsonb(g) order by permission) from public.external_integration_admin_grants g where actor_id='"+qa+"' and environment='DEV';").stdout)
    wrong=copy.deepcopy(p);wrong['adminControl']['grantRenewalPreimages']['CONFIG_ADMIN']['expires_at']=(start-dt.timedelta(seconds=10)).isoformat()
    denied=sql(prepare_grant_provision_sql(wrong),'postgres',True);assert denied.returncode and 'ADMIN_RENEWAL_PREIMAGE_DRIFT' in denied.stderr
    after=json.loads(sql("select jsonb_agg(to_jsonb(g) order by permission) from public.external_integration_admin_grants g where actor_id='"+qa+"' and environment='DEV';").stdout);assert before==after
    sql(prepare_grant_provision_sql(p))
    sql("alter role otr_external_integration_admin_gateway login valid until '"+a['expiresAt']+"';")
    assert wrapped(authority_sql(a))==[{'ready':True}]
    active=json.loads(sql("select jsonb_agg(to_jsonb(g) order by permission) from public.external_integration_admin_grants g where actor_id='"+qa+"' and environment='DEV';").stdout)
    for old,new in zip(before,active):
        assert new['grant_revision']==3 and new['revoked_at'] is None
        assert {k:v for k,v in old.items() if k not in ['grant_revision','revoked_at','expires_at']}=={k:v for k,v in new.items() if k not in ['grant_revision','revoked_at','expires_at']}
    denied=sql(prepare_grant_provision_sql(p),'postgres',True);assert denied.returncode and 'ADMIN_RENEWAL_PREIMAGE_DRIFT' in denied.stderr
    sql(revoke_sql(a));assert wrapped(revoked_sql(a))==[{'closed':True}]
    closed=json.loads(sql("select jsonb_agg(to_jsonb(g) order by permission) from public.external_integration_admin_grants g where actor_id='"+qa+"' and environment='DEV';").stdout)
    assert all(g['grant_revision']==4 and g['revoked_at'] is not None for g in closed)
    assert restore_once(p,wrapped,recover_only=True)['status']=='CLOSED_VERIFIED'
    print(json.dumps({'status':'LOCAL_ISOLATED_GRANT_RENEWAL_PASS','checks':['exact old revoked2 read-only CLOSED before renewal','foreign expiry preimage CAS rejected without mutation','same ID/created fields revoked2 to active3','actual owning authority qualification passes revision3','replay/active preimage rejected without retry','exact active3 to revoked4 and read-only closure'],'hostedWrites':0,'providerCalls':0},indent=2))
finally:
    if created:subprocess.run(['docker','rm','-f',NAME],capture_output=True)
'''
exec(compile(prefix+body,str(fixture),'exec'),{'__file__':str(fixture)})
