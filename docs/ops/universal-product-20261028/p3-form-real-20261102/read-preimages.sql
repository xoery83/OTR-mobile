-- PREPARED ONLY; execute through an existing authorized metadata Reader, never a new grant.
BEGIN READ ONLY;
WITH
scope AS (
 SELECT s.scope_id,s.revision,s.environment,s.workload,s.provider_id,s.model_id,
 s.expected_family,s.shadow,s.active,s.integration_id,s.integration_version,
 s.configuration_sha256,s.provider_config_id,s.price_schedule_id,
 jsonb_build_object(
  'adapter_version',s.pins->'adapter_version','prompt_sha256',s.pins->'prompt_sha256',
  'output_schema_sha256',s.pins->'output_schema_sha256','profile_sha256',s.pins->'profile_sha256',
  'task_lifetime_ms',s.pins->'task_lifetime_ms','provider_config_sha256',s.pins->'provider_config_sha256',
  'price_sha256',s.pins->'price_sha256') AS pins,
 (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s.pins) k) AS actual_pin_keys,
 s.scope_sha256,s.expires_at,s.input_ceiling,s.output_ceiling,s.concurrent_account,
 s.account_daily,s.dev_daily,s.provider_daily,s.max_attempts,s.monetary_approved,
 s.currency,s.call_cost_nanos::text AS call_cost_nanos,
 s.account_day_cost_nanos::text AS account_day_cost_nanos,s.dev_day_cost_nanos::text AS dev_day_cost_nanos,
 s.created_by,s.created_at
 FROM public.flight_activation_scopes s
 WHERE s.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid
 AND s.integration_id='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
 ORDER BY s.revision DESC LIMIT 1
),
account_grant AS (
 SELECT g.scope_id,g.account_id,g.revision,g.expires_at,g.revoked,g.updated_by
 FROM public.flight_activation_account_grants g
 WHERE g.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid
 AND g.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid
),
integration AS (
 SELECT i.integration_id,i.environment,i.enabled,i.kill_switch,i.config_version,i.config_sha256
 FROM public.external_integrations i
 WHERE i.integration_id='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
 AND i.environment='DEV'
),
price AS (
 SELECT p.price_schedule_id,p.integration_id,p.provider_id,p.model_id,p.schedule_version,
 p.currency,p.effective_from,p.effective_until,p.schedule_sha256,p.supersedes_schedule_id,p.rounding_policy,
 (SELECT min(n.effective_from) FROM public.external_integration_price_schedules n
 WHERE n.supersedes_schedule_id=p.price_schedule_id) AS superseded_from,
 (SELECT n.schedule_version FROM public.external_integration_price_schedules n
 WHERE n.integration_id=p.integration_id AND n.provider_id IS NOT DISTINCT FROM p.provider_id
 AND n.model_id IS NOT DISTINCT FROM p.model_id AND n.currency=p.currency
 ORDER BY n.effective_from DESC LIMIT 1) AS latest_schedule_version,
 (SELECT jsonb_agg(jsonb_build_object('unit_key',u.unit_key,'measurement_unit',u.measurement_unit,
 'unit_quantity',u.unit_quantity,'price_per_quantity',u.price_per_quantity::text,
 'unit_definition',jsonb_build_object('version',u.unit_definition->'version',
 'relationship',u.unit_definition->'relationship','included_in',u.unit_definition->'included_in',
 'billable',u.unit_definition->'billable')) ORDER BY u.unit_key)
 FROM public.external_integration_price_schedule_units u WHERE u.price_schedule_id=p.price_schedule_id) AS units
 FROM public.external_integration_price_schedules p
 WHERE p.price_schedule_id='56f9eee5-bee5-4ace-820d-c3a8d472ef04'::uuid
 AND p.integration_id='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
)
SELECT clock_timestamp() AS observed_at,
 (SELECT to_jsonb(s)-'actual_pin_keys' FROM scope s) AS scope,
 (SELECT actual_pin_keys FROM scope) AS scope_pin_keys,
 (SELECT to_jsonb(g) FROM account_grant g) AS account_grant,
 (SELECT to_jsonb(i) FROM integration i) AS integration,
 (SELECT to_jsonb(p) FROM price p) AS price;
COMMIT;
