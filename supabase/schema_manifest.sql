with object_lines as (
  select 'table|' || c.relname as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'

  union all

  select concat_ws('|', 'column', c.relname, a.attnum, a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
    coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
    and a.attnum > 0 and not a.attisdropped

  union all

  select concat_ws('|', 'constraint', c.relname, x.conname,
    pg_get_constraintdef(x.oid, true))
  from pg_constraint x
  join pg_class c on c.oid = x.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all

  select concat_ws('|', 'index', indexname, indexdef)
  from pg_indexes where schemaname = 'public'

  union all

  select concat_ws('|', 'function', p.oid::regprocedure::text,
    pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'

  union all

  select concat_ws('|', 'trigger', c.relname, t.tgname,
    pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all

  select concat_ws('|', 'rls', c.relname, c.relrowsecurity, c.relforcerowsecurity)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'

  union all

  select concat_ws('|', 'policy', schemaname, tablename, policyname, permissive,
    roles::text, cmd, coalesce(qual, ''), coalesce(with_check, ''))
  from pg_policies where schemaname in ('public', 'storage')

  union all

  select concat_ws('|', 'bucket', id, name, public, coalesce(file_size_limit::text, ''),
    coalesce(array_to_string(allowed_mime_types, ','), ''))
  from storage.buckets
), canonical as (
  select string_agg(value, E'\n' order by value) as payload from object_lines
), counts as (
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
    (select count(*) from information_schema.columns
      where table_schema = 'public') as columns,
    (select count(*) from pg_constraint x join pg_namespace n on n.oid = x.connamespace
      where n.nspname = 'public') as constraints,
    (select count(*) from pg_indexes where schemaname = 'public') as indexes,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public') as functions,
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal) as triggers,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as rls_tables,
    (select count(*) from pg_policies where schemaname in ('public', 'storage')) as policies,
    (select count(*) from storage.buckets) as buckets
)
select jsonb_build_object(
  'checksum', encode(extensions.digest(canonical.payload, 'sha256'), 'hex'),
  'tables', counts.tables,
  'columns', counts.columns,
  'constraints', counts.constraints,
  'indexes', counts.indexes,
  'functions', counts.functions,
  'triggers', counts.triggers,
  'rls_tables', counts.rls_tables,
  'policies', counts.policies,
  'buckets', counts.buckets
)::text
from canonical cross join counts;
