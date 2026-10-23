import unittest
from recover_password_operator import reserve,FIXTURES
class Scope(unittest.TestCase):
 def test_each_fixture_one_reservation_even_after_unknown(self):
  counts={'A':0,'B':0};reserve(counts,'A');self.assertEqual(counts,{'A':1,'B':0})
  with self.assertRaises(ValueError):reserve(counts,'A')
  reserve(counts,'B');self.assertEqual(counts,{'A':1,'B':1})
 def test_only_current_scope_fixture_constants(self):
  self.assertEqual(set(FIXTURES),{'A','B'});self.assertNotEqual(FIXTURES['A']['id'],FIXTURES['B']['id'])
if __name__=='__main__':unittest.main()
