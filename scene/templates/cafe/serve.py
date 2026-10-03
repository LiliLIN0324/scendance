"""Standalone cafe preview; the local builder may save only cafe.glb."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import hashlib
import json
import struct
ROOT = Path(__file__).resolve().parent
PORT = 8780
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js':'text/javascript', '.mjs':'text/javascript', '.glb':'model/gltf-binary'}
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_POST(self):
        if self.path != '/__save-cafe':
            self.send_error(404); return
        if self.headers.get('Origin') != f'http://127.0.0.1:{PORT}':
            self.send_error(403); return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 28 <= size <= 32*1024*1024:
                self.send_error(413); return
            payload=self.rfile.read(size)
            if len(payload)!=size or struct.unpack_from('<III',payload)!=(0x46546c67,2,size):
                raise ValueError('Invalid GLB')
            length,kind=struct.unpack_from('<II',payload,12)
            if kind!=0x4e4f534a: raise ValueError('Missing JSON chunk')
            doc=json.loads(payload[20:20+length])
            if not any(n.get('name')=='Cafe_12x9' for n in doc.get('nodes',[])):
                raise ValueError('Wrong model root')
            target=ROOT/'cafe.glb'; temp=ROOT/'cafe.glb.tmp'
            temp.write_bytes(payload);temp.replace(target)
            data=json.dumps({'saved':True,'bytes':size,'path':'cafe.glb','sha256':hashlib.sha256(payload).hexdigest()}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        except (ValueError,struct.error,OSError):
            self.send_error(422)
if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    print(f'Cafe preview: http://127.0.0.1:{PORT}/',flush=True)
    server.serve_forever()
