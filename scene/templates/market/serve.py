"""Preview only this package on localhost:8774; archive a model and three PNG views."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import hashlib
import json
import struct
import tempfile

ROOT = Path(__file__).resolve().parent
PORT = 8774
CAPTURES = {"overview": "renders/overview.png", "top": "renders/top.png", "inside": "renders/inside.png"}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        target = Path(super().translate_path(path)).resolve()
        return str(target) if target.is_relative_to(ROOT) else str(ROOT / "__outside_package__")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def respond(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        request = urlsplit(self.path)
        if request.path not in ("/__save_model", "/__save_capture"):
            self.respond(404, {"error": "Unknown archive endpoint"})
            return
        if self.headers.get("Origin") not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
            self.respond(403, {"error": "Only this local preview may archive files"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.respond(400, {"error": "Invalid length"})
            return
        if not 28 <= length <= 64 * 1024 * 1024:
            self.respond(413, {"error": "Archive must be between 28 bytes and 64 MB"})
            return
        payload = self.rfile.read(length)
        try:
            if len(payload) != length:
                raise ValueError("Incomplete upload")
            if request.path == "/__save_model":
                if struct.unpack_from("<III", payload) != (0x46546C67, 2, length):
                    raise ValueError("Invalid GLB header")
                json_length, json_type = struct.unpack_from("<II", payload, 12)
                if json_type != 0x4E4F534A or json_length + 20 > length:
                    raise ValueError("Missing GLB scene document")
                doc = json.loads(payload[20:20 + json_length])
                if not any(n.get("name") == "Market_Outdoor_30x22" for n in doc.get("nodes", [])):
                    raise ValueError("Wrong template root")
                if any("uri" in item for key in ("images", "buffers") for item in doc.get(key, [])):
                    raise ValueError("The model must embed its geometry and textures")
                relative = "market.glb"
            else:
                view = parse_qs(request.query).get("view", [""])[0]
                if view not in CAPTURES:
                    raise ValueError("Choose overview, top, or inside")
                if payload[:8] != b"\x89PNG\r\n\x1a\n" or payload[12:16] != b"IHDR":
                    raise ValueError("Only PNG captures are accepted")
                width, height = struct.unpack_from(">II", payload, 16)
                if not 1 <= width <= 12000 or not 1 <= height <= 12000:
                    raise ValueError("Invalid capture dimensions")
                relative = CAPTURES[view]
            target = ROOT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=target.name, suffix=".tmp", delete=False) as temporary:
                temporary.write(payload)
                temporary_path = Path(temporary.name)
            temporary_path.replace(target)
        except (ValueError, struct.error, OSError) as error:
            self.respond(422, {"error": str(error)})
            return
        self.respond(200, {"saved": True, "path": relative, "bytes": length, "sha256": hashlib.sha256(payload).hexdigest()})


if __name__ == "__main__":
    print(f"Outdoor market: http://127.0.0.1:{PORT}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
