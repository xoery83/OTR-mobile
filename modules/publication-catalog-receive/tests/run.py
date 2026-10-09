"""Local native receiver fixtures only: no Hosted, app build, simulator or device API."""
import gzip
import http.server
import json
import pathlib
import ssl
import subprocess
import tempfile
import threading
import time
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
LIMIT = 4_194_304
ERROR_LIMIT = 8192
observations = {"forwarded": 0, "disconnected": 0}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
            observations["disconnected"] += 1

    def do_GET(self):
        name = self.path.strip("/")
        if name == "forwarded":
            observations["forwarded"] += 1
        if name in ["redirect", "cross-redirect"]:
            self.send_response(302)
            origin = "http://localhost" if name == "cross-redirect" else "http://127.0.0.1"
            self.send_header("Location", f"{origin}:{self.server.server_port}/forwarded")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if name == "slow":
            self.send_response(200)
            self.send_header("Content-Length", str(LIMIT))
            self.end_headers()
            try:
                for _ in range(100):
                    self.wfile.write(b"x" * 1024)
                    self.wfile.flush()
                    time.sleep(0.02)
            except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
                observations["disconnected"] += 1
            return
        assert self.headers.get("Accept-Encoding") in (None, "identity"), self.headers
        raw = b"{}"
        encoded = gzip.compress(raw)
        catalog = (ROOT.parents[1] / "src/data/repositories/__fixtures__/tripImportCatalogs.json").read_bytes()
        encodings = {
            "ordinary-gzip": (encoded, ["gzip"]),
            "catalog-concat": (gzip.compress(catalog) + gzip.compress(b"x" * (LIMIT + 1)), ["gzip"]),
            "catalog-truncated": (gzip.compress(catalog)[:-8], ["gzip"]),
            "catalog-crc": (gzip.compress(catalog), ["gzip"]),
            "gzip-concat": (encoded + gzip.compress(b"x" * (LIMIT + 1)), ["gzip"]),
            "gzip-truncated": (encoded[:-8], ["gzip"]),
            "gzip-bad-crc": (encoded[:-8] + bytes([encoded[-8] ^ 255]) + encoded[-7:], ["gzip"]),
            "gzip-garbage": (b"not-gzip", ["gzip"]),
            "deflate": (zlib.compress(raw), ["deflate"]),
            "br": (subprocess.check_output(["node", "-e", "process.stdout.write(require('node:zlib').brotliCompressSync(Buffer.from('{}')))" ]), ["br"]),
            "zstd": (raw, ["zstd"]), "unknown": (raw, ["unknown"]),
            "identity": (raw, ["identity"]), "no-encoding": (raw, []),
            "missing-gzip": (encoded, []), "missing-gzip-split": (encoded, []),
            "gzip-prefix-only": (b"\x1f", []),
            "identity-gzip-magic": (encoded, ["identity"]),
            "duplicate-gzip-identity": (encoded, ["gzip", "identity"]),
            "duplicate-identity-gzip": (encoded, ["identity", "gzip"]),
            "duplicate-identity": (raw, ["identity", "identity"]),
            "case-conflict": (encoded, ["gzip", "identity"]),
            "encoding-chain": (encoded, ["gzip, identity"]),
            "empty-encoding": (raw, [""]),
        }
        if name in encodings:
            wire, headers = encodings[name]
            if name == "catalog-crc":
                wire = wire[:-8] + bytes([wire[-8] ^ 255]) + wire[-7:]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            for i, value in enumerate(headers):
                self.send_header("content-encoding" if name == "case-conflict" and i else "Content-Encoding", value)
            if name == "missing-gzip-split":
                self.send_header("Transfer-Encoding", "chunked")
            else:
                self.send_header("Content-Length", str(len(wire)))
            self.end_headers()
            try:
                if name == "missing-gzip-split":
                    self.wfile.write(b"1\r\n" + wire[:1] + b"\r\n"); self.wfile.flush(); time.sleep(0.4)
                    wire = f"{len(wire) - 1:x}\r\n".encode() + wire[1:] + b"\r\n0\r\n\r\n"
                self.wfile.write(wire); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
                observations["disconnected"] += 1
            return
        error = name.startswith("error")
        size = ERROR_LIMIT if error else LIMIT
        if "over" in name:
            size += 1
        body = b"x" * size
        if name == "unicode":
            body = "\U0001f30d".encode() * (LIMIT // 4)
        if name == "unicode-over":
            body = "\U0001f30d".encode() * (LIMIT // 4) + b"\xf0"
        compressed = "gzip" in name
        wire = gzip.compress(body) if compressed else body
        self.send_response(500 if error else 200)
        if compressed:
            self.send_header("Content-Encoding", "gzip")
        if name == "unsupported":
            self.send_header("Content-Encoding", "br")
        if name.startswith("missing"):
            self.send_header("Connection", "close")
            self.close_connection = True
        else:
            self.send_header("Content-Length", str(len(wire) + (100 if name == "lying" else 0)))
            if name == "lying":
                self.send_header("Connection", "close")
                self.close_connection = True
        self.end_headers()
        try:
            for offset in range(0, len(wire), 32767):
                self.wfile.write(wire[offset:offset + 32767])
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
            observations["disconnected"] += 1


with tempfile.TemporaryDirectory(prefix="otr-publication-native-") as directory:
    temporary = pathlib.Path(directory)
    executable = temporary / "receive-check"
    subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-module-cache-path", str(temporary / "module-cache"), str(ROOT / "ios/PublicationCatalogReceiver.swift"), str(ROOT / "tests/main.swift"), "-o", str(executable)], check=True)
    subprocess.run([str(executable), "policy"], check=True)
    http_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=http_server.serve_forever, daemon=True).start()
    key, cert = temporary / "key.pem", temporary / "cert.pem"
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(cert), "-days", "1", "-subj", "/CN=localhost"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tls = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    tls.socket = context.wrap_socket(tls.socket, server_side=True)
    threading.Thread(target=tls.serve_forever, daemon=True).start()
    cases = [
        ("exact", None, LIMIT), ("over", "BODY_LIMIT", None),
        ("error", None, ERROR_LIMIT), ("error-over", "BODY_LIMIT", None),
        ("gzip", "UNSUPPORTED_ENCODING", None), ("gzip-over", "UNSUPPORTED_ENCODING", None),
        ("error-gzip", "UNSUPPORTED_ENCODING", None), ("error-gzip-over", "UNSUPPORTED_ENCODING", None),
        ("missing", None, LIMIT), ("missing-over", "BODY_LIMIT", None), ("lying", "NETWORK_FAILURE", None),
        ("unicode", None, LIMIT), ("unicode-over", "BODY_LIMIT", None),
        ("unsupported", ("UNSUPPORTED_ENCODING", "NETWORK_FAILURE"), None),
        ("redirect", "REDIRECT_DENIED", None), ("cross-redirect", "REDIRECT_DENIED", None),
        ("slow", "REQUEST_TIMEOUT", None), ("cancel", "REQUEST_CANCELED", None),
        ("tls", "TLS_FAILURE", None),
    ]
    original_seven = ["catalog-concat", "catalog-truncated", "catalog-crc", "gzip-concat", "gzip-truncated", "gzip-bad-crc", "gzip-garbage"]
    negatives = original_seven + ["ordinary-gzip", "deflate", "br", "zstd", "unknown", "missing-gzip", "missing-gzip-split", "gzip-prefix-only", "identity-gzip-magic", "duplicate-gzip-identity", "duplicate-identity-gzip", "duplicate-identity", "case-conflict", "encoding-chain", "empty-encoding"]
    cases += [(name, "UNSUPPORTED_ENCODING", None) for name in negatives]
    cases += [("identity", None, 2), ("no-encoding", None, 2)]
    try:
        for name, encoding, count, prefix in [
            ("ordinary-gzip", "gzip", 2, [123, 125]),
            ("deflate", "deflate", 2, [123, 125]), ("br", "br", 2, [123, 125]),
            ("no-encoding", "ABSENT", 2, [123, 125]),
            ("missing-gzip", "ABSENT", len(gzip.compress(b"{}")), [31, 139]),
            ("duplicate-gzip-identity", "gzip, identity", 2, [123, 125]),
            ("duplicate-identity-gzip", "identity, gzip", len(gzip.compress(b"{}")), [31, 139]),
            ("duplicate-identity", "identity, identity", 2, [123, 125]),
            ("case-conflict", "gzip, identity", 2, [123, 125]),
        ]:
            result = json.loads(subprocess.check_output([str(executable), "headers", f"http://127.0.0.1:{http_server.server_port}/{name}"], text=True, timeout=8))
            assert result == {"encoding": encoding, "headers": [] if encoding == "ABSENT" else [encoding], "bytes": count, "prefix": prefix, "error": "NONE"}, (name, result)
            print(f"URLSession headers {name} PASS {json.dumps(result, sort_keys=True)}")
        subprocess.run([str(executable), "slot", f"http://127.0.0.1:{http_server.server_port}/exact"], check=True, timeout=12)
        for name, error, size in cases:
            path = "slow" if name == "cancel" else name
            url = f"http://127.0.0.1:{http_server.server_port}/{path}"
            if name == "tls":
                url = f"https://localhost:{tls.server_port}/exact"
            command = [str(executable), url, "80" if name == "slow" else "3000"]
            if name == "cancel":
                command.append("cancel")
            result = json.loads(subprocess.check_output(command, text=True, timeout=8))
            assert result["completions"] == 1, (name, result)
            assert result["maximumRetained"] <= (ERROR_LIMIT if name.startswith("error") else LIMIT), (name, result)
            if error:
                if error == "UNSUPPORTED_ENCODING":
                    assert result["maximumRetained"] == 0, (name, result)
                accepted = error if isinstance(error, tuple) else (error,)
                assert result.get("error") in accepted and "bytes" not in result, (name, result)
            else:
                assert result["bytes"] == size and result["utf8"], (name, result)
            print(f"{name} PASS {json.dumps(result, sort_keys=True)}")
        print("original seven independent encoding negatives CLOSED: 7/7")
        assert observations["forwarded"] == 0, observations
        time.sleep(0.2)
        assert observations["disconnected"] >= 2, observations
        print(f"native policy + slot + {len(cases)} fixtures PASS; redirects forwarded=0; cancellation disconnects observed")
    finally:
        http_server.shutdown()
        tls.shutdown()
