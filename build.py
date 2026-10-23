"""Build a dependency-free XPI. Only addon/ files enter the distribution."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).absolute().parent
manifest = json.loads((ROOT / 'addon/manifest.json').read_text(encoding='utf-8'))
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
target = dist / f'zotero-feed-zh-{manifest["version"]}.xpi'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((ROOT / 'addon').rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(ROOT / 'addon').as_posix())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert {'manifest.json', 'bootstrap.js', 'core.js', 'service.js', 'ui.js'} <= set(archive.namelist())
print(target)
print('SHA256:', hashlib.sha256(target.read_bytes()).hexdigest())
