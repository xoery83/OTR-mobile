-- LOCAL REVIEW CANDIDATE ONLY. Never delete Source/registration/seal/business data.
-- First disable/unbind the new Backend /2 composition and stop its owned workers.
-- Revoke only new entry points; preserve functions/receipts for retained evidence.
begin;
revoke execute on function public.trip_source_pdf_v2_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_v2_context(uuid,uuid,jsonb),public.trip_source_pdf_v2_commit(jsonb,text),public.trip_source_pdf_v2_original_begin(uuid,text,uuid),public.trip_source_pdf_v2_original_finish(uuid,text,uuid,text,bigint),public.trip_source_pdf_v2_registration_lookup(uuid,uuid,uuid,text),public.trip_source_pdf_v2_registration_context(uuid,uuid,jsonb),public.trip_source_pdf_v2_registration_commit(jsonb,text,text) from otr_trip_source_command_gateway;
commit;
-- Do not drop tables/immutable receipts or roll Source data back to a /1 fiction.
-- Keep existing global gates in their prior state; this packet never enabled them.
