-- Diagnostic only: run using the existing Core gateway connection, never an admin/SET ROLE substitute.
-- No operation submission, receipt insertion, authority change or persisted setting. Always rollback.
BEGIN;
SET LOCAL statement_timeout='5000ms';
SET LOCAL lock_timeout='1000ms';
SELECT current_user AS current_role, session_user AS session_role;
SELECT set_config('otr.core.actor','1f3d7935-1bdc-4952-8d7f-0f72077368c1',true),
       set_config('otr.core.trip','a0bcf637-4d71-4d8b-ba17-a998d8917fe0',true),
       set_config('otr.core.operation','5f7d0785-d519-44da-8852-342af47b806d',true),
       set_config('otr.core.manual_compat','READ',true);
SELECT current_setting('otr.core.manual_compat',true) AS compatibility,
       public.trip_core_finite_scope_allowed('1f3d7935-1bdc-4952-8d7f-0f72077368c1'::uuid,'a0bcf637-4d71-4d8b-ba17-a998d8917fe0'::uuid) AS finite_allowed,
       public.trip_sustained_core_read_scope_allowed('1f3d7935-1bdc-4952-8d7f-0f72077368c1'::uuid,'a0bcf637-4d71-4d8b-ba17-a998d8917fe0'::uuid) AS sustained_read_allowed;
ROLLBACK;
