"""Local scene library preview. Only the conference snapshot can be written by the builder."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parent
PORT = 8776

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path == '/__save-preview':
            if self.headers.get('Origin') != f'http://127.0.0.1:{PORT}':
                self.send_error(403); return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 33 <= length <= 24 * 1024 * 1024:
                    self.send_error(413); return
                payload = self.rfile.read(length)
                if len(payload) != length or payload[:8] != b'\x89PNG\r\n\x1a\n' or payload[12:16] != b'IHDR':
                    self.send_error(422); return
                width, height = struct.unpack_from('>II', payload, 16)
                if not 1 <= width <= 16384 or not 1 <= height <= 16384:
                    self.send_error(422); return
                target = ROOT / 'exports' / 'current-view.png'
                target.parent.mkdir(exist_ok=True)
                temp = target.with_suffix('.png.tmp')
                temp.write_bytes(payload)
                temp.replace(target)
                result = json.dumps({'saved': True, 'path': 'exports/current-view.png', 'bytes': length, 'sha256': hashlib.sha256(payload).hexdigest()}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(result)))
                self.end_headers()
                self.wfile.write(result)
            except (ValueError, struct.error, OSError):
                self.send_error(422)
            return
        if self.path != '/__save-conference':
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
            if not any(n.get('name') == 'Conference_24x18' for n in doc.get('nodes', [])):
                raise ValueError('Wrong template')
        except (ValueError, struct.error):
            self.send_error(422); return
        target = ROOT / 'conference.glb'
        temp = target.with_suffix('.glb.tmp')
        temp.write_bytes(payload)
        temp.replace(target)
        result = json.dumps({'saved': True, 'path': 'conference.glb', 'bytes': length, 'sha256': hashlib.sha256(payload).hexdigest()}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(result)))
        self.end_headers()
        self.wfile.write(result)

if __name__ == '__main__':
    print(f'Scene library: http://127.0.0.1:{PORT}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
