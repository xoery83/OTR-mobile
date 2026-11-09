-- Requires unchanged owning write trigger definition from the same catalog snapshot.
CREATE TRIGGER owning_item_guard BEFORE INSERT OR UPDATE ON public.itinerary_events FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_write();
CREATE TRIGGER owning_document_guard BEFORE INSERT OR UPDATE ON public.trip_operational_documents FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_write();
CREATE TRIGGER owning_link_guard BEFORE INSERT OR UPDATE ON public.trip_item_document_links FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_write();
CREATE TRIGGER owning_receipt_guard BEFORE INSERT OR UPDATE ON public.trip_core_command_receipts FOR EACH ROW EXECUTE FUNCTION public.trip_core_guard_write();
SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;
SET ROLE otr_trip_core_v2_writer;
DO $$
DECLARE actor uuid; target uuid; operation uuid; document uuid;
 trip uuid:='00000000-0000-4000-8000-000000000010';
 owner_item uuid:='00000000-0000-4000-8000-000000000011';
BEGIN
 PERFORM set_config('otr.core.trip',trip::text,true);
 PERFORM set_config('otr.core.manual_compat','MANUAL',true);
 PERFORM set_config('otr.core.admission','MANUAL',true);
 PERFORM set_config('otr.core.family','P1',true);
 FOR actor,target IN SELECT owner_account_id,id FROM public.itinerary_events ORDER BY id LOOP
  PERFORM set_config('otr.core.actor',actor::text,true);
  PERFORM set_config('otr.core.target_item',target::text,true);
  PERFORM set_config('otr.core.command','SET_ITEM_TEXT',true);
  UPDATE public.itinerary_events SET title='Changed',semantic_revision=2 WHERE id=target;
  INSERT INTO public.trip_core_command_receipts(trip_id,actor_account_id,operation_id,body)
  VALUES (trip,actor,gen_random_uuid(),'{"command":"SET_ITEM_TEXT"}');
  document:=gen_random_uuid();
  operation:=gen_random_uuid();
  PERFORM set_config('otr.core.target_item',document::text,true);
  PERFORM set_config('otr.core.operation',operation::text,true);
  PERFORM set_config('otr.core.command','CREATE_DOCUMENT_METADATA',true);
  INSERT INTO public.trip_operational_documents VALUES (document,trip,actor,'LOCAL_ONLY','PRIVATE');
  INSERT INTO public.trip_core_command_receipts(trip_id,actor_account_id,operation_id,body) VALUES (trip,actor,operation,'{"command":"CREATE_DOCUMENT_METADATA"}');
  PERFORM set_config('otr.core.target_item',target::text,true);
  PERFORM set_config('otr.core.command','RECONCILE_ITEM_DOCUMENTS',true);
  INSERT INTO public.trip_item_document_links VALUES(trip,target,document,actor,true);
  operation:=gen_random_uuid();
  PERFORM set_config('otr.core.operation',operation::text,true);
  INSERT INTO public.trip_core_command_receipts(trip_id,actor_account_id,operation_id,body)
  VALUES (trip,actor,operation,'{"command":"RECONCILE_ITEM_DOCUMENTS"}');
 END LOOP;
 IF (SELECT count(*) FROM public.itinerary_events WHERE semantic_revision=2 AND title='Changed')<>2
 OR (SELECT count(*) FROM public.trip_operational_documents WHERE custody='LOCAL_ONLY')<>2
 OR (SELECT count(*) FROM public.trip_item_document_links WHERE active)<>2
 OR (SELECT count(*) FROM public.trip_core_command_receipts)<>6 THEN RAISE EXCEPTION 'fixture write readback'; END IF;
 PERFORM set_config('otr.core.target_item',owner_item::text,true);
 PERFORM set_config('otr.core.command','SET_ITEM_TEXT',true);
 BEGIN
  UPDATE public.itinerary_events SET title='Forbidden' WHERE id=owner_item;
  RAISE EXCEPTION 'foreign item write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('otr.core.command','RECONCILE_ITEM_DOCUMENTS',true);
 BEGIN
  INSERT INTO public.trip_item_document_links VALUES(trip,owner_item,document,actor,true);
  RAISE EXCEPTION 'foreign item link accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET SESSION AUTHORIZATION;
SELECT 'CORE_MANUAL_ITEM_DOCUMENT_RECEIPT_GUARDS_PASS';
