"""Package this scene only; run after exporting and refreshing validation."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'template.json').read_text())
model = ROOT / manifest['model']['path']
assert model.stat().st_size == manifest['model']['bytes']
assert hashlib.sha256(model.read_bytes()).hexdigest() == manifest['model']['sha256']
required = ['README.md', 'ASSET-SOURCES.md', 'index.html', 'serve.py', 'model.js', 'assets/catalogue.json', 'validation/model-validation.json', 'validation/gltf-validation.json', 'validation/browser-validation.json', *manifest['preview']['images']]
for name in required:
    assert (ROOT / name).is_file(), name
target = ROOT / 'office-scene-template-v1.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path.suffix not in ['.zip', '.pyc', '.tmp'] and '__pycache__' not in path.parts:
            archive.write(path, Path('office') / path.relative_to(ROOT))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    print(f'{target}\n{len(archive.namelist())} files; {target.stat().st_size} bytes')
