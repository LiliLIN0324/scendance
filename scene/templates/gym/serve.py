"""Local-only preview server and narrowly scoped scene snapshot writer."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parent
PORT = 8770

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != '/__save-gym':
            self.send_error(404); return
        if self.headers.get('Origin') != f'http://127.0.0.1:{PORT}':
            self.send_error(403); return
        length = int(self.headers.get('Content-Length', '0'))
        if not 28 <= length <= 64 * 1024 * 1024:
            self.send_error(413); return
        payload = self.rfile.read(length)
        if len(payload) != length or struct.unpack_from('<III', payload) != (0x46546c67, 2, length):
            self.send_error(422, 'Invalid GLB'); return
        (ROOT / 'gym.glb').write_bytes(payload)
        result = json.dumps({'saved': True, 'path': 'gym.glb', 'bytes': length, 'sha256': hashlib.sha256(payload).hexdigest()}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(result)))
        self.end_headers(); self.wfile.write(result)

if __name__ == '__main__':
    print(f'Gym scene preview: http://127.0.0.1:{PORT}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
