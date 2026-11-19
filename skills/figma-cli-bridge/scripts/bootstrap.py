"""Diagnose or prepare the local Figma bridge. Never print pairing material."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['doctor', 'prepare', 'install-only'])
legacy = Path.home() / 'codingSpace' / 'figma-local-bridge'
share = Path.home() / '.local' / 'share'
default_bridge = share / 'figma-cli-bridge' / 'bridge'
previous_bridge = share / 'figma-local-design' / 'bridge'
if not default_bridge.exists() and (previous_bridge / 'src/cli.mjs').is_file():
    default_bridge = previous_bridge
if (legacy / 'src/cli.mjs').is_file() and (legacy / 'package.json').is_file():
    default_bridge = legacy
parser.add_argument('--bridge', default=os.environ.get('FIGMA_BRIDGE_HOME') or default_bridge)
args = parser.parse_args()
root = Path(args.bridge).expanduser().resolve()
assets = Path(__file__).resolve().parents[1] / 'assets'
local = root / '.local'


def report(state, **extra):
    print(json.dumps(dict(state=state, bridge=str(root), **extra), ensure_ascii=False))
    sys.exit(0 if state in ('ready', 'installed') else 2)


def restore():
    archive = assets / 'bridge.zip'
    if not archive.is_file() or not (assets / 'bridge.sha256').is_file():
        report('bundle_missing')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != (assets / 'bridge.sha256').read_text().strip():
        report('bundle_invalid')
    root.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root.parent) as tmp:
        staging = Path(tmp) / 'bridge'
        with zipfile.ZipFile(archive) as source:
            for item in source.namelist():
                if Path(item).is_absolute() or '..' in Path(item).parts:
                    report('bundle_invalid')
            source.extractall(staging)
        # POSIX rename refuses to replace a nonempty destination.
        staging.rename(root)


def port_open():
    with socket.socket() as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(('127.0.0.1', 38475)) == 0


def status():
    proc = subprocess.run(['node', 'src/cli.mjs', 'status'], cwd=root, capture_output=True, timeout=10)
    return json.loads(proc.stdout) if proc.returncode == 0 else None


def run(*cmd):
    proc = subprocess.run(cmd, cwd=root, stdout=sys.stderr)
    if proc.returncode:
        report('command_failed', command=list(cmd), code=proc.returncode)


def main():
    if args.mode == 'prepare' and any(parent.parent.name == '.local' and
                                      parent.name.startswith('zip-install-') for parent in root.parents):
        report('zip_test_requires_isolation', command='npm run test:zip')
    if os.environ.get('FIGMA_BRIDGE_STATE_DIR') and Path(os.environ['FIGMA_BRIDGE_STATE_DIR']).resolve() != local:
        report('custom_state_directory', expected=str(local))
    if not shutil.which('node') or not shutil.which('npm'):
        report('node_or_npm_missing')
    if int(subprocess.check_output(['node', '-p', 'process.versions.node.split(".")[0]'])) < 22:
        report('node_22_required')
    if not root.exists() or (root.is_dir() and not any(root.iterdir())):
        if args.mode == 'doctor':
            report('bridge_missing')
        restore()
    if not (root / 'package.json').is_file() or json.loads((root / 'package.json').read_text()).get('name') != 'figma-local-bridge':
        report('directory_in_use')
    required = ('src/cli.mjs', 'src/compose-plan.mjs', 'plugin/compose.mjs', 'plugin/page.mjs', 'package-lock.json', 'scripts/build.mjs')
    with zipfile.ZipFile(assets / 'bridge.zip') as bundle:
        expected_version = json.loads(bundle.read('package.json'))['version']
    if json.loads((root / 'package.json').read_text())['version'] != expected_version:
        report('bridge_upgrade_required', expectedVersion=expected_version)
    if not all((root / f).is_file() for f in required):
        report('bridge_upgrade_required')
    if not all((root / 'node_modules' / p / 'package.json').is_file() for p in ('ws','esbuild')):
        if args.mode == 'doctor':
            report('dependencies_missing')
        run('npm', 'ci', '--include=dev', '--ignore-scripts')
    if args.mode == 'install-only':
        report('installed')
    if not port_open():
        if args.mode == 'doctor':
            report('service_stopped')
        local.mkdir(mode=0o700, exist_ok=True)
        with (local / 'service.log').open('ab') as log:
            child = subprocess.Popen(['node', 'src/cli.mjs', 'serve'], cwd=root, stdin=subprocess.DEVNULL,
                                     stdout=log, stderr=log, start_new_session=True)
        for _ in range(40):
            if child.poll() is not None:
                report('service_start_failed', log=str(local / 'service.log'))
            if port_open():
                break
            time.sleep(0.1)
    live = status()
    if live is None:
        report('port_occupied_or_auth_failed')
    if 'theme.document' not in live.get('features', []):
        report('service_upgrade_required')
    creds = json.loads((local / 'credentials.json').read_text())
    if time.time()*1000 >= creds['expiresAt']:
        report('pairing_expired')
    dist = root / 'dist'
    outputs = [dist / name for name in ('manifest.json','code.js','ui.html')]
    inputs = [p for folder in ('src','plugin','design','assets') for p in (root / folder).glob('*') if p.is_file()]
    inputs.append(root / 'scripts/build.mjs')
    if (not all(p.is_file() for p in outputs) or min(p.stat().st_mtime for p in outputs) < max(p.stat().st_mtime for p in inputs)
            or creds['plugin'] not in outputs[-1].read_text()):
        if args.mode == 'doctor':
            report('build_required')
        run('npm', 'run', 'build')
    info = dict(manifest=str(outputs[0]), sessions=live['sessions'], trusted=live['trustedDocument'], bound=live['bound'])
    sessions = live['sessions']
    if not sessions:
        report('plugin_not_connected', **info)
    if len(sessions) != 1:
        report('ambiguous_sessions', **info)
    session = sessions[0]
    trusted = live['trustedDocument']
    if session['document']['name'] != 'CLI Bridge · Sandbox' or (trusted and trusted['documentId'] != session['document']['id']):
        report('target_mismatch', **info)
    if session.get('client', {}).get('version') != json.loads((root / 'package.json').read_text())['version']:
        report('plugin_reload_required', **info)
    if live['bound'] != session['id']:
        report('bind_required', **info)
    pending = [j for j in live['jobs'] if j.get('documentId') == session['document']['id'] and j['status'] in ('unknown','running','queued')]
    if pending:
        report('jobs_pending', jobs=pending, **info)
    report('ready', **info)


try:
    main()
except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as exc:
    report('setup_failed', detail=type(exc).__name__ + ': ' + str(exc))
