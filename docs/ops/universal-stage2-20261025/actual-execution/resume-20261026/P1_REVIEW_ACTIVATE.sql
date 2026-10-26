-- NOT AUTHORIZED YET. One fixed candidate; clock starts once, no renewal/replay extension.
BEGIN;
DO $$DECLARE n integer;BEGIN
 UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=true,
 universal_p1_review_scope='{"tripId":"825f79b2-4a9d-4535-a62e-43000ca50c4a","sourceId":"0c71927f-3f3b-4612-a49e-333761e90441","batchId":"bd0d6ea6-7870-48a9-b74b-779a46783609","taskId":"861a9d47-a35b-87a6-99f1-98422493d76b","token":"i1","resultSha256":"596f244c81110efb459524c4d5eff78fe5a1bee135fc97b1fa49e31605672198","candidateId":"44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67","targetId":"34dece59-61ae-8716-a976-7d3da49b51d0","operationId":"b1406697-47aa-8780-846c-37f4796cb52b","slotId":"1952c59b-114e-8636-8799-fe90e2f38d36"}'::jsonb || jsonb_build_object('expiresAt',clock_timestamp()+interval '15 minutes')
 WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'P1_REVIEW_ACTIVATION_PREIMAGE_MISMATCH';END IF;
END $$;
COMMIT;
