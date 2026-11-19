"""Report whether this main push raised the declared release version."""
import json
import re
import subprocess
import sys
from pathlib import Path


def version(manifest):
    value = manifest['version']
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value):
        raise ValueError(f'Expected a stable major.minor.patch version, got {value!r}')
    return tuple(map(int, value.split('.')))


def main(before):
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'package.json').read_text())
    current = version(manifest)
    release = False
    if before != '0' * 40:
        previous = subprocess.check_output(['git', 'show', f'{before}:package.json'], cwd=root)
        release = current > version(json.loads(previous))
    print('version=' + manifest['version'])
    print('release=' + str(release).lower())


if __name__ == '__main__':
    main(sys.argv[1])
