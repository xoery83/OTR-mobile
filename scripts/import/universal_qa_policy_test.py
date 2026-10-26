"""Proposed SQL scope constraints, not authorization or actual DEV proof."""
import unittest
import universal_qa_policy as m


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.plan = {'actorId': m.ACTOR, 'project': 'tuqigdxrvrerfewsxqgm',
                     'startsAt': '2026-10-25T07:00:00Z', 'adminControl': {'expiresAt': '2026-10-25T07:15:00Z'},
                     'policyActiveRow': {'actor_account_id': m.ACTOR, 'enabled': True,
                         'adoption_cutoff': m.CUTOFF, 'revoked_at': None, 'universal_import_enabled': True}}

    def test_only_new_exact_policy_can_be_created_and_never_silently_reenabled(self):
        sql = m.activate_sql(self.plan)
        self.assertIn('QA_POLICY_ALREADY_EXISTS_RECONCILE_ONLY', sql)
        self.assertIn('QA_TRIP_PREIMAGE_NOT_EMPTY', sql)
        self.assertNotIn('ON CONFLICT', sql)
        self.assertNotIn('GRANT ', sql)

    def test_failure_closes_general_and_universal_without_deleting_anything(self):
        sql = m.close_sql(self.plan)
        self.assertIn('SET enabled=false,universal_import_enabled=false,revoked_at=clock_timestamp()', sql)
        self.assertNotIn('DELETE ', sql)
        self.assertNotIn('ALTER ROLE', sql)
        self.assertIn('WHERE actor_account_id=', sql)

    def test_wrong_identity_and_cutoff_or_unbounded_window_refused(self):
        for change in [lambda p:p.update(actorId='wrong'),
                       lambda p:p['policyActiveRow'].update(adoption_cutoff='2026-10-24T00:00:00Z'),
                       lambda p:p['adminControl'].update(expiresAt='2026-10-25T08:00:00Z')]:
            import copy
            p=copy.deepcopy(self.plan);change(p)
            with self.assertRaises(ValueError):m.activate_sql(p)


    def test_only_exact_already_accepted_trip_receipt_can_relax_empty_trip_preimage(self):
        payload = {'destination': None, 'destinations': [{'destinationId': '9db70354-aee7-4b34-8c87-0459a3919337', 'displayLabel': 'Auckland', 'source': 'MANUAL'}],
                   'endDate': '2026-11-03', 'formatVersion': 2, 'name': 'Universal Stage II Normal QA 20261025', 'startDate': '2026-11-01', 'tripId': '825f79b2-4a9d-4535-a62e-43000ca50c4a'}
        receipt = {'actor_account_id': m.ACTOR, 'trip_id': payload['tripId'], 'operation_id': 'ca52729b-b36b-4c30-b9f1-240c19b5e35e',
                   'request_payload': payload, 'created_at': '2026-10-25T06:45:00Z'}
        closed = {'actor_account_id': m.ACTOR, 'enabled': False, 'adoption_cutoff': m.CUTOFF.replace('Z', '+00:00'),
                  'universal_import_enabled': False, 'revoked_at': '2026-10-25T06:30:00Z'}
        sql = m.resume_sql(self.plan, closed, receipt)
        for term in ['count(*)', 'to_jsonb(r)=', 'public.trips', "role='owner'", "status='linked'"]:
            self.assertIn(term, sql)
        self.assertNotIn('INSERT INTO', sql)
        self.assertIn('EXISTS(SELECT 1 FROM public.trip_create_receipts', m.resume_sql(self.plan, closed))
        import copy
        for change in [lambda r:r.update(actor_account_id='wrong'), lambda r:r.update(trip_id='wrong'),
                       lambda r:r.update(operation_id='wrong'), lambda r:r['request_payload'].update(name='changed')]:
            bad=copy.deepcopy(receipt);change(bad)
            with self.assertRaisesRegex(ValueError, 'EXACT_ALREADY_ACCEPTED'):
                m.resume_sql(self.plan, closed, bad)
