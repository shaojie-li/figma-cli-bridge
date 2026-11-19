"""Install the local skill, or build a standalone ZIP with --package."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'skills/figma-cli-bridge'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--package', action='store_true', help='write the ZIP under release/')
args = parser.parse_args()


def add_file(archive, name, data):
    # Fixed timestamps keep the digest stable across clean checkouts.
    entry = zipfile.ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = 0o100644 << 16
    archive.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED)


bridge_files = [
    'package.json', 'package-lock.json', 'scripts/build.mjs', 'scripts/bridge-client.mjs',
    'scripts/export-colors.mjs', 'scripts/export-layout.mjs', 'scripts/export-typography.mjs',
    'scripts/export-tokens.mjs', 'assets/PHOSPHOR-LICENSE', 'assets/luigi-colors.json',
    'assets/check.svg', 'assets/circle-notch.svg', 'plugin/ui.html', 'design/glass-dashboard.mjs',
    'docs/COMPONENT_STATES.md', 'docs/DESIGN_SYSTEM.md', 'docs/NAMING.md', 'docs/USAGE.md',
]
for pattern in ('src/*.mjs', 'plugin/*.mjs', 'design/*.json', 'design/*.css', 'test/*.test.mjs'):
    bridge_files.extend(path.relative_to(root).as_posix() for path in root.glob(pattern))
bridge = io.BytesIO()
with zipfile.ZipFile(bridge, 'w') as archive:
    for name in sorted(bridge_files):
        add_file(archive, name, (root / name).read_bytes())

skill_files = {name: (source / name).read_bytes() for name in
              ('SKILL.md', 'agents/openai.yaml', 'scripts/bootstrap.py', 'references/design.md', 'references/setup.md', 'references/theme.md')}
skill_files['assets/bridge.zip'] = bridge.getvalue()
skill_files['assets/bridge.sha256'] = (hashlib.sha256(bridge.getvalue()).hexdigest() + '\n').encode()

if args.package:
    version = json.loads((root / 'package.json').read_text())['version']
    output = root / 'release' / f'{source.name}-{version}.zip'
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staged = Path(tmp) / output.name
        with zipfile.ZipFile(staged, 'w') as archive:
            for name, data in skill_files.items():
                add_file(archive, f'{source.name}/{name}', data)
        staged.replace(output)
    # A GitHub path install copies only the skill directory. Ship the same runtime there.
    assets = source / 'assets'
    assets.mkdir(exist_ok=True)
    for name in ('bridge.zip', 'bridge.sha256'):
        (assets / name).write_bytes(skill_files['assets/' + name])
    print(output)
else:
    target = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'skills' / source.name
    for name, data in skill_files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(target)
