"""Prepare an explicit version bump or report whether a main push should publish."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def version(value):
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value):
        raise ValueError(f'Expected a stable major.minor.patch version, got {value!r}')
    return tuple(map(int, value.split('.')))


def check_push(root, before):
    manifest = json.loads((root / 'package.json').read_text())
    current = version(manifest['version'])
    release = False
    if before != '0' * 40:
        previous = subprocess.check_output(['git', 'show', f'{before}:package.json'], cwd=root)
        release = current > version(json.loads(previous)['version'])
    print('version=' + manifest['version'])
    print('release=' + str(release).lower())


def bump(root, target):
    manifest_path = root / 'package.json'
    lock_path = root / 'package-lock.json'
    manifest = json.loads(manifest_path.read_text())
    lock = json.loads(lock_path.read_text())
    old = manifest['version']
    current = version(old)
    if target in ('major', 'minor', 'patch'):
        index = ('major', 'minor', 'patch').index(target)
        parts = [*current[:index], current[index] + 1, *([0] * (2 - index))]
        target = '.'.join(map(str, parts))
    if version(target) <= current:
        raise ValueError(f'New version must be higher than {old}')
    if lock['version'] != old or lock['packages']['']['version'] != old:
        raise ValueError('Root lockfile version differs from package.json')

    manifest['version'] = lock['version'] = lock['packages']['']['version'] = target
    edits = {path: json.dumps(data, indent=2, ensure_ascii=False) + '\n'
             for path, data in [(manifest_path, manifest), (lock_path, lock)]}
    for name in ('plugin/ui.html', 'plugin/ui-client.mjs', 'docs/INSTALL.en.md'):
        path = root / name
        updated, count = re.subn(r'(?<![0-9.])' + re.escape(old) + r'(?![0-9]|\.[0-9])',
                                 target, path.read_text())
        if not count:
            raise ValueError(f'{name} does not mention {old}')
        edits[path] = updated

    assets = root / 'skills/figma-cli-bridge/assets'
    archive = root / 'release' / f'figma-cli-bridge-{target}.zip'
    paths = [*edits, assets / 'bridge.zip', assets / 'bridge.sha256', archive]
    originals = {path: path.read_bytes() if path.exists() else None for path in paths}
    try:
        for path, text in edits.items():
            path.write_text(text)
        subprocess.run([sys.executable, 'scripts/install-global-skill.py', '--package'],
                       cwd=root, check=True)
    except (OSError, subprocess.CalledProcessError, KeyboardInterrupt):
        for path, original in originals.items():
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original)
        raise
    print(f'Prepared {old} -> {target}. Review and commit the release changes in the PR.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('before', nargs='?', help='Previous main SHA from the push event')
    action.add_argument('--bump', metavar='VERSION', help='patch, minor, major, or an exact higher version')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.bump:
        bump(root, args.bump)
    else:
        check_push(root, args.before)
