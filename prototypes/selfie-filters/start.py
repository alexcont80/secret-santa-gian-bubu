"""Prepare the pinned runtime, then serve the standalone camera on localhost."""
import argparse
import base64
import hashlib
import io
import os
import tarfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
PACKAGE = 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz'
INTEGRITY = 'TuhKH+credq4zLksGbYrnvJ1aLIWMc5r0UHwzxzql4BHECJwIAoBR61ZrqwGOW6ZmSBIzU1t4VtKj8hbxFaKeA=='
MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
HASHES = {
    'vision_bundle.mjs': '40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c',
    'wasm/vision_wasm_internal.js': '4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb',
    'wasm/vision_wasm_internal.wasm': 'f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7',
    'wasm/vision_wasm_nosimd_internal.js': '927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f',
    'wasm/vision_wasm_nosimd_internal.wasm': '3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4',
    'face_landmarker.task': '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
}
def download(url):
    with urlopen(url, timeout=90) as response:
        return response.read()
def install(name, data):
    if hashlib.sha256(data).hexdigest() != HASHES[name]:
        raise ValueError('Checksum non valido: ' + name)
    path = ROOT/'runtime'/name
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(data)
    os.replace(tmp.name, path)
    path.chmod(0o644)
def prepare():
    missing = [name for name, digest in HASHES.items() if not (ROOT/'runtime'/name).is_file()
               or hashlib.sha256((ROOT/'runtime'/name).read_bytes()).hexdigest() != digest]
    modules = [name for name in missing if name != 'face_landmarker.task']
    if modules:
        data = download(PACKAGE)
        if base64.b64encode(hashlib.sha512(data).digest()).decode() != INTEGRITY:
            raise ValueError('Checksum del pacchetto MediaPipe non valido')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for name in modules:
                install(name, archive.extractfile('package/'+name).read())
    if 'face_landmarker.task' in missing:
        install('face_landmarker.task', download(MODEL))

if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--prepare-only', action='store_true')
    args.add_argument('--port', type=int, default=8765)
    options = args.parse_args()
    prepare()
    if not options.prepare_only:
        class Handler(SimpleHTTPRequestHandler):
            extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs':'text/javascript', '.wasm':'application/wasm'}
            def end_headers(self):
                self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; img-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
                self.send_header('Permissions-Policy', 'camera=(self), microphone=()')
                super().end_headers()
        server = ThreadingHTTPServer(('127.0.0.1', options.port), partial(Handler, directory=str(ROOT)))
        print(f'Apri http://localhost:{server.server_port}', flush=True)
        server.serve_forever()
