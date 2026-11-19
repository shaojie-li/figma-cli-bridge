"""Update an installed skill and its managed runtime from a public GitHub release."""
import contextlib
import fcntl
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

REPO = 'shaojie-li/figma-cli-bridge'
LATEST = f'https://api.github.com/repos/{REPO}/releases/latest'
NAME = 'figma-cli-bridge'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'figma-cli-bridge-updater'})
    with urllib.request.urlopen(request, timeout=8) as response:
        return response.read()


def archive(data):
    with zipfile.ZipFile(io.BytesIO(data)) as source:
        files = {}
        for item in source.infolist():
            name = item.filename
            parts = name.split('/')
            if (any(p in ('', '.', '..', '.local', '.git', 'dist', 'node_modules') for p in parts)
                    or '\\' in name or name in files or item.external_attr >> 28 == 10):
                raise ValueError('unexpected package path')
            files[name] = source.read(item)
    return files


def runtime(bundle, checksum):
    if hashlib.sha256(bundle).hexdigest() != checksum.decode().strip():
        raise ValueError('bridge checksum mismatch')
    files = archive(bundle)
    manifest = json.loads(files['package.json'])
    if manifest['name'] != 'figma-local-bridge' or 'src/cli.mjs' not in files:
        raise ValueError('invalid runtime')
    return manifest['version'], files


def version(value):
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ValueError('invalid release version')
    return tuple(map(int, value.split('.')))


def source_file(base, name):
    path = base / name
    if path.resolve() != path or (path.exists() and not path.is_file()):
        raise ValueError('unexpected local path')
    return path


def install(skill, root, files, old, new, status, port_open):
    # Only release-owned files move. Pairing, bindings, builds and job history stay in place.
    changes = {}
    installed = (root / 'package.json').is_file()
    if root.exists() and not installed and any(root.iterdir()):
        raise ValueError('bridge directory in use')
    if installed:
        for name in old.keys() | new.keys():
            path = source_file(root, name)
            present = path.read_bytes() if path.exists() else None
            if present != new.get(name):
                if present != old.get(name):
                    raise ValueError('bridge has local edits')
                changes[path] = new.get(name)
    for name, data in files.items():
        path = source_file(skill, name)
        if not path.exists() or path.read_bytes() != data:
            changes[path] = data

    with contextlib.ExitStack() as stack:
        def staging(base):
            return Path(stack.enter_context(tempfile.TemporaryDirectory(dir=base)))
        staged_skill = staging(skill.parent)
        staged_root = staging(root.parent) if installed else None
        prepared = {}
        for index, (path, data) in enumerate(changes.items()):
            directory = staged_skill if skill in path.parents else staged_root
            staged = directory / str(index)
            if data is not None:
                staged.write_bytes(data)
            prepared[path] = (staged if data is not None else None, directory / f'old-{index}')

        def dependency_lock(contents):
            lock = json.loads(contents['package-lock.json'])
            lock.pop('version', None)
            lock['packages'][''].pop('version', None)
            return lock

        deps_changed = installed and dependency_lock(old) != dependency_lock(new)
        if deps_changed:
            for name in ('package.json', 'package-lock.json'):
                (staged_root / name).write_bytes(new[name])
            subprocess.run(['npm', 'ci', '--include=dev', '--ignore-scripts'], cwd=staged_root,
                           stdout=sys.stderr, check=True)
            prepared[root / 'node_modules'] = (staged_root / 'node_modules', staged_root / 'old-modules')

        pending = ('unknown', 'running', 'queued')
        jobs = root / '.local/jobs.json'
        if installed and jobs.exists() and any(j['status'] in pending for j in json.loads(jobs.read_bytes()).values()):
            raise ValueError('bridge has unfinished jobs')
        if installed and port_open():
            live = status(root)
            if live is None or any(j['status'] in pending for j in live['jobs']):
                raise ValueError('bridge busy or owned by another installation')
            if deps_changed or any(root / p in changes for p in old.keys() | new.keys() if p.startswith('src/')):
                pid = json.loads((root / '.local/connection.json').read_bytes())['pid']
                cwd = subprocess.check_output(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], text=True)
                cmd = subprocess.check_output(['ps', '-p', str(pid), '-o', 'command='], text=True)
                if f'n{root}' not in cwd.splitlines() or 'src/cli.mjs serve' not in cmd:
                    raise ValueError('could not verify running bridge')
                os.kill(pid, signal.SIGTERM)
                for _ in range(50):
                    if not port_open():
                        break
                    time.sleep(.1)
                else:
                    raise ValueError('bridge still running')

        applied = []
        try:
            for path, (staged, backup) in prepared.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                if path.exists():
                    path.replace(backup)
                applied.append((path, staged, backup))
                if staged is not None:
                    staged.replace(path)
        except BaseException:
            for path, staged, backup in reversed(applied):
                if staged is not None and path.exists():
                    path.replace(staged)
                if backup.exists():
                    backup.replace(path)
            raise


def update(skill, root, status, port_open, download=fetch):
    skill, root = skill.resolve(), root.resolve()
    with (skill.parent / '.figma-cli-bridge-update.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        release = json.loads(download(LATEST))
        tag = release['tag_name']
        if release['draft'] or release['prerelease'] or not tag.startswith('v'):
            raise ValueError('expected a stable release')
        target = tag[1:]
        bundle = (skill / 'assets/bridge.zip').read_bytes()
        with zipfile.ZipFile(io.BytesIO(bundle)) as source:
            current = json.loads(source.read('package.json'))['version']
        if version(target) <= version(current):
            return False
        name = f'{NAME}-{target}.zip'
        url = f'https://github.com/{REPO}/releases/download/{tag}/{name}'
        asset = next((a for a in release['assets'] if a['name'] == name and a['browser_download_url'] == url), None)
        if not asset:
            raise ValueError('release ZIP unavailable')
        data = download(url)
        if 'sha256:' + hashlib.sha256(data).hexdigest() != asset.get('digest'):
            raise ValueError('release checksum mismatch')
        prefix = NAME + '/'
        entries = archive(data)
        if not all(key.startswith(prefix) for key in entries):
            raise ValueError('invalid skill package')
        files = {key[len(prefix):]: value for key, value in entries.items()}
        for required in ('SKILL.md', 'scripts/bootstrap.py', 'scripts/updates.py'):
            if not files.get(required):
                raise ValueError('incomplete skill')
        bundled, new = runtime(files['assets/bridge.zip'], files['assets/bridge.sha256'])
        if bundled != target:
            raise ValueError('release version mismatch')
        _, old = runtime(bundle, (skill / 'assets/bridge.sha256').read_bytes())
        install(skill, root, files, old, new, status, port_open)
        print(f'Updated Figma CLI Bridge {current} -> {target}', file=sys.stderr)
        return True


def check(skill, root, status, port_open):
    try:
        return update(skill, root, status, port_open)
    except (urllib.error.URLError, TimeoutError, http.client.HTTPException) as exc:
        detail = 'GitHub unavailable' + (f' (HTTP {exc.code})' if isinstance(exc, urllib.error.HTTPError) else '')
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as exc:
        detail = str(exc)
    print(f'Update skipped: {detail}. Continuing with the installed version.', file=sys.stderr)
    return False
