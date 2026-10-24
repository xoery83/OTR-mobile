"""Actual isolated loopback lifetime regression; no device or remote service."""
import json
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]


class FiniteTransferTest(unittest.TestCase):
    def test_idle_connection_cannot_keep_server_alive_or_serve_after_expiry(self):
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
        qa = ROOT / 'docs/ops/universal-dev-execution-20261024/qa-originals'
        expected = json.loads((ROOT / 'docs/ops/universal-native-capture-pins-20261024/EXPECTED_INPUTS.json').read_text())
        packet = {'realC3': {'sources': [dict(i, path=str(qa / i['originalFilename'])) for i in expected if i['kind'] == 'FILE']}}
        with tempfile.TemporaryDirectory(prefix='otr-loopback-deadline-test-') as directory:
            path = Path(directory) / 'packet.json'
            path.write_text(json.dumps(packet))
            child = subprocess.Popen([sys.executable, str(ROOT / 'scripts/import/serve-fixed-qa-originals.py'), '--packet', str(path), '--port', str(port), '--seconds', '1'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            idle = None
            try:
                ready = json.loads(child.stdout.readline())
                self.assertEqual(ready['expiresInSeconds'], 1)
                with urlopen(ready['urls'][0], timeout=1) as response:
                    self.assertEqual(response.headers['Content-Disposition'], 'inline; filename="universal-mixed-bookings-utf8.txt"')
                    self.assertEqual(response.read(), (qa / 'universal-mixed-bookings-utf8.txt').read_bytes())
                idle = socket.create_connection(('127.0.0.1', port), timeout=1)
                started = time.monotonic()
                # Keep the client open: this reproduced an unbounded process before.
                child.wait(timeout=2.5)
                self.assertEqual(child.returncode, 0)
                self.assertLess(time.monotonic() - started, 2)
                self.assertEqual(idle.recv(1024), b'')
                with self.assertRaises(OSError):
                    socket.create_connection(('127.0.0.1', port), timeout=.2)
            finally:
                if idle is not None:
                    idle.close()
                if child.poll() is None:
                    child.kill()
                    child.wait()
                child.stdout.close()
                child.stderr.close()


if __name__ == '__main__':
    unittest.main()
