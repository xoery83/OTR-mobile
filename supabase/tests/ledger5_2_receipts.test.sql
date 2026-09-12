begin;
select plan(8);

select has_table('public', 'receipt_assets', 'receipt asset metadata exists');
select col_is_null('public', 'receipt_assets', 'ocr_suggestion', 'OCR suggestion stays optional');
select policies_are('public', 'receipt_assets', array[]::text[], 'clients have no receipt table policy');
select has_check('public', 'receipt_assets', 'receipt metadata is constrained');
select has_index('public', 'receipt_assets', 'receipt_assets_journey_expense_idx', 'receipt lookup is indexed');
select is((select public from storage.buckets where id = 'ledger-receipts'), false, 'receipt bucket is private');
select is((select file_size_limit from storage.buckets where id = 'ledger-receipts'), 15728640::bigint, 'receipt limit is enforced');
select ok('RECEIPT' = any(regexp_split_to_array(pg_get_constraintdef(oid), E'\\W+')),
  'change feed accepts receipt entities') from pg_constraint where conname = 'ledger_changes_entity_type_check';

select * from finish();
rollback;
