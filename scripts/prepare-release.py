"""Resolve a stable release version and stamp the disposable CI checkout."""
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pattern = re.compile(r'v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')


def tags(*args):
    refs = subprocess.check_output(['git', 'tag', *args], cwd=root, text=True).splitlines()
    return [tuple(map(int, match.groups())) for ref in refs if (match := pattern.fullmatch(ref))]


def resolve():
    declared = json.loads((root / 'package.json').read_text())['version']
    base = pattern.fullmatch('v' + declared)
    if not base:
        raise ValueError('Expected a stable major.minor.patch version')
    exact = tags('--points-at', 'HEAD')
    if len(exact) > 1:
        raise ValueError('Multiple version tags point to this commit')
    if exact:
        return declared, '.'.join(map(str, exact[0]))
    previous = max(tags(), default=(0, 0, 0))
    version = max(tuple(map(int, base.groups())), (previous[0], previous[1], previous[2] + 1))
    return declared, '.'.join(map(str, version))


def stamp(old, new):
    if old == new:
        return
    for name in ('package.json', 'package-lock.json', 'plugin/ui.html', 'plugin/ui-client.mjs', 'docs/INSTALL.en.md'):
        path = root / name
        text = path.read_text()
        if name.startswith('package'):
            data = json.loads(text)
            data['version'] = new
            if name == 'package-lock.json':
                data['packages']['']['version'] = new
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        else:
            if old not in text:
                raise ValueError(f'{name} does not mention the declared version')
            path.write_text(text.replace(old, new))


if __name__ == '__main__':
    declared, version = resolve()
    stamp(declared, version)
    print(version)
