"""Local scene library preview. Only the lawn snapshot can be written by the builder."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parent
PORT = 8773

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != '/__save-lawn':
            self.send_error(404); return
        if self.headers.get('Origin') != f'http://127.0.0.1:{PORT}':
            self.send_error(403); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400); return
        if not 28 <= length <= 32 * 1024 * 1024:
            self.send_error(413); return
        payload = self.rfile.read(length)
        try:
            if len(payload) != length or struct.unpack_from('<III', payload) != (0x46546c67, 2, length):
                raise ValueError('Invalid GLB header')
            json_length, json_type = struct.unpack_from('<II', payload, 12)
            if json_type != 0x4e4f534a:
                raise ValueError('Missing JSON')
            doc = json.loads(payload[20:20+json_length])
            if not any(n.get('name') == 'Lawn_Gathering_28x20' for n in doc.get('nodes', [])):
                raise ValueError('Wrong template')
        except (ValueError, struct.error):
            self.send_error(422); return
        target = ROOT / 'lawn.glb'
        temp = target.with_suffix('.glb.tmp')
        temp.write_bytes(payload)
        temp.replace(target)
        result = json.dumps({'saved': True, 'path': 'lawn.glb', 'bytes': length, 'sha256': hashlib.sha256(payload).hexdigest()}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(result)))
        self.end_headers()
        self.wfile.write(result)

if __name__ == '__main__':
    print(f'Scene library: http://127.0.0.1:{PORT}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
