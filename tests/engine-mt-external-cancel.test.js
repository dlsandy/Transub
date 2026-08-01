/**
 * @vitest-environment node
 */
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const enginePython = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    'python.exe',
);

describe('external MT cancel/timeout contract', () => {
    it('engine maps adapter cancel (502+已取消/aborted) to MT_EXTERNAL_CANCELLED', () => {
        const py = `
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from transub_engine.mt.external_http import MtExternalError, external_translate_cues

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length:
            self.rfile.read(length)
        payload = json.dumps({"error": "已取消", "code": "aborted"}).encode()
        self.send_response(502)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a):
        pass

srv = HTTPServer(('127.0.0.1', 0), H)
port = srv.server_address[1]
Thread(target=srv.serve_forever, daemon=True).start()
try:
    external_translate_cues(
        [{"start": 0, "end": 1, "text": "a"}],
        mt_external={"url": f"http://127.0.0.1:{port}/translate", "timeoutSec": 5, "batchSize": 8},
        language="ja",
    )
    raise SystemExit("expected MtExternalError")
except MtExternalError as e:
    assert e.code == "MT_EXTERNAL_CANCELLED", e
finally:
    srv.shutdown()
`;
        const r = spawnSync(enginePython, ['-c', py], {
            encoding: 'utf8',
            timeout: 20000,
        });
        assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    });

    it('engine maps ambiguous 502+请求超时或已取消/aborted to timeout and retries', () => {
        const py = `
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from transub_engine.mt.external_http import external_translate_cues

hits = {"n": 0}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) if length else b'{}')
        hits["n"] += 1
        if hits["n"] < 2:
            payload = json.dumps({
                "error": "请求超时或已取消",
                "code": "aborted",
            }).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
            return
        cues = body.get('cues') or []
        payload = json.dumps({
            "cues": [{"id": c["id"], "text": "译" + str(c["text"])} for c in cues]
        }).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a):
        pass

srv = HTTPServer(('127.0.0.1', 0), H)
port = srv.server_address[1]
Thread(target=srv.serve_forever, daemon=True).start()
try:
    out = external_translate_cues(
        [{"start": 0, "end": 1, "text": "hi"}],
        mt_external={"url": f"http://127.0.0.1:{port}/translate", "timeoutSec": 5, "batchSize": 8},
        language="ja",
    )
    assert out[0]["text"] == "译hi", out
    assert hits["n"] == 2, hits
finally:
    srv.shutdown()
`;
        const r = spawnSync(enginePython, ['-c', py], {
            encoding: 'utf8',
            timeout: 30000,
        });
        assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    });

    it('engine waits on 429 adapter busy then succeeds', () => {
        const py = `
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from transub_engine.mt.external_http import external_translate_cues

hits = {"n": 0}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) if length else b'{}')
        hits["n"] += 1
        if hits["n"] < 3:
            payload = json.dumps({"error": "adapter busy", "code": "busy"}).encode()
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
            return
        cues = body.get('cues') or []
        payload = json.dumps({
            "cues": [{"id": c["id"], "text": "译" + str(c["text"])} for c in cues]
        }).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a):
        pass

srv = HTTPServer(('127.0.0.1', 0), H)
port = srv.server_address[1]
Thread(target=srv.serve_forever, daemon=True).start()
try:
    t0 = time.time()
    out = external_translate_cues(
        [{"start": 0, "end": 1, "text": "hi"}],
        mt_external={"url": f"http://127.0.0.1:{port}/translate", "timeoutSec": 30, "batchSize": 8},
        language="ja",
    )
    assert out[0]["text"] == "译hi", out
    assert hits["n"] == 3, hits
    assert time.time() - t0 >= 2.0, "expected busy backoff wait"
finally:
    srv.shutdown()
`;
        const r = spawnSync(enginePython, ['-c', py], {
            encoding: 'utf8',
            timeout: 30000,
        });
        assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    });

    it('engine maps 504 timeout and retries then succeeds', () => {
        const py = `
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from transub_engine.mt.external_http import external_translate_cues

hits = {"n": 0}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) if length else b'{}')
        hits["n"] += 1
        if hits["n"] < 2:
            payload = json.dumps({"error": "请求超时", "code": "timeout"}).encode()
            self.send_response(504)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
            return
        cues = body.get('cues') or []
        payload = json.dumps({
            "cues": [{"id": c["id"], "text": "译" + str(c["text"])} for c in cues]
        }).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *a):
        pass

srv = HTTPServer(('127.0.0.1', 0), H)
port = srv.server_address[1]
Thread(target=srv.serve_forever, daemon=True).start()
try:
    out = external_translate_cues(
        [{"start": 0, "end": 1, "text": "hi"}],
        mt_external={"url": f"http://127.0.0.1:{port}/translate", "timeoutSec": 5, "batchSize": 8},
        language="ja",
    )
    assert out[0]["text"] == "译hi", out
    assert hits["n"] == 2, hits
finally:
    srv.shutdown()
`;
        const r = spawnSync(enginePython, ['-c', py], {
            encoding: 'utf8',
            timeout: 30000,
        });
        assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    });
});
