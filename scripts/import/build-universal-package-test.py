import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).with_name('build-universal-package.py')
spec=importlib.util.spec_from_file_location('build_universal_package',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PackageTests(unittest.TestCase):
    def test_fixed_existing_base_three_bundles_only(self):
        text=m.candidate_dockerfile(Path('.'))
        self.assertTrue(text.startswith('FROM '+m.BASE_IMAGE+'\n'))
        self.assertEqual(text.count('COPY --chown=otr:otr'),3)
        self.assertIn('universal-prepare.mjs /app/universal-prepare.mjs',text)
        for forbidden in ['RUN ', 'ENV ', 'CMD ', 'USER ', '--prepare-once', 'OTR_DEV_']:
            self.assertNotIn(forbidden,text)
if __name__=='__main__':unittest.main()
