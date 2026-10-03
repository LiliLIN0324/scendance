"""Standalone museum preview. Python 3 standard library. Bind localhost:8775."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import hashlib
import json
import struct
ROOT = Path(__file__).resolve().parent
PORT = 8775
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs':'text/javascript', '.glb': 'model/gltf-binary'}
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
    def do_POST(self):
        if self.path != '/__save-museum': self.send_error(404); return
        if self.headers.get('Origin') not in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'): self.send_error(403); return
        try: length=int(self.headers.get('Content-Length','0'))
        except ValueError: self.send_error(400); return
        if not 28 <= length <= 48*1024*1024: self.send_error(413); return
        payload=self.rfile.read(length)
        try:
            if len(payload)!=length or struct.unpack_from('<III',payload)!=(0x46546c67,2,length): raise ValueError('Invalid GLB')
            size,kind=struct.unpack_from('<II',payload,12)
            if kind!=0x4e4f534a: raise ValueError('Missing JSON')
            data=json.loads(payload[20:20+size])
            if not any(n.get('name')=='Museum_BetweenSpecies_20x14' for n in data.get('nodes',[])): raise ValueError('Wrong scene')
        except (ValueError,struct.error): self.send_error(422); return
        target=ROOT/'museum.glb';temp=target.with_suffix('.glb.tmp');temp.write_bytes(payload);temp.replace(target)
        response=json.dumps({'saved':True,'path':'museum.glb','bytes':length,'sha256':hashlib.sha256(payload).hexdigest()}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(response)));self.end_headers();self.wfile.write(response)
if __name__=='__main__':
    print(f'Museum preview: http://127.0.0.1:{PORT}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
