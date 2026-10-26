sc.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid AND sc.revision=6
 AND sc.environment='DEV' AND sc.workload='UNIVERSAL_IMPORT_V1' AND sc.concurrent_account=1
 AND r.environment='DEV' AND r.task_class='UNIVERSAL_IMPORT_V1' AND r.provider_id='DeepSeek' AND r.model_id='deepseek-flash'
 AND r.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND r.user_id=r.account_id
 AND r.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
 AND r.integration_id='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
 AND c.account_id=r.account_id AND c.trip_id=r.trip_id AND c.integration_id=r.integration_id
 AND c.environment='DEV' AND c.task_class='UNIVERSAL_IMPORT_V1' AND c.provider_id='DeepSeek' AND c.model_id='deepseek-flash'
 AND c.dispatch_state='MAY_HAVE_STARTED' AND c.execution_certainty IN('RUNNING','UNKNOWN')
 AND h.scope_id=sc.scope_id AND h.account_id=c.account_id AND h.provider_id=c.provider_id
 AND EXISTS(SELECT 1 FROM public.model_task_admissions expired WHERE expired.call_id=c.call_id AND expired.account_id=c.account_id
 AND expired.integration_id=c.integration_id AND expired.task_id=c.task_id AND expired.contract_version='otr-model-task-v1'
 AND expired.request_snapshot->>'task_id'=c.task_id::text
 AND expired.deadline=(expired.request_snapshot->'policy_snapshot'->>'deadline')::timestamptz
 AND expired.deadline+interval '60 seconds'<clock_timestamp())
