"""Smoke-test the packaged skill in a disposable installation."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path, nargs='?')
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text())['version']
archive = args.archive or root / 'release' / f'figma-cli-bridge-{version}.zip'


def interrupted(signum, frame):
    raise SystemExit(128 + signum)


def run(command, cwd, env):
    process = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
    try:
        status = process.wait(timeout=180)
        if status:
            raise subprocess.CalledProcessError(status, command)
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


signal.signal(signal.SIGTERM, interrupted)
with tempfile.TemporaryDirectory(prefix='figma-zip-check-') as directory:
    workspace = Path(directory)
    bridge = workspace / 'bridge'
    with zipfile.ZipFile(archive) as package:
        package.extractall(workspace / 'skills')
    bootstrap = workspace / 'skills/figma-cli-bridge/scripts/bootstrap.py'
    env = {**os.environ, 'FIGMA_BRIDGE_STATE_DIR': str(bridge / '.local')}
    run([sys.executable, str(bootstrap), 'install-only', '--bridge', str(bridge)], workspace, env)
    run(['node', '--input-type=module', '--eval', """
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startServer} from './src/server.mjs';

const service = await startServer({dir: '.local', port: 0});
try {
  const connection = JSON.parse(fs.readFileSync('.local/connection.json'));
  assert.equal(connection.port, service.port);
  assert.equal(connection.pid, process.pid);
  const runNode = promisify(execFile);
  const status = JSON.parse((await runNode(process.execPath, ['src/cli.mjs', 'status'])).stdout);
  assert.ok(status.features.includes('theme.document'));
  await runNode(process.execPath, ['scripts/build.mjs']);
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json'));
  assert.equal(manifest.name, 'CLI Bridge');
  assert.ok(fs.statSync('dist/' + manifest.main).size);
  assert.ok(fs.readFileSync('dist/' + manifest.ui, 'utf8').includes(service.credentials.plugin));
  const fixtureId = '123456789'; // Test input, never a release ID.
  await runNode(process.execPath, ['scripts/build.mjs', '--community'], {env:{...process.env, FIGMA_PLUGIN_ID:fixtureId}});
  const directory = 'release/community-plugin';
  const published = JSON.parse(fs.readFileSync(directory + '/manifest.json'));
  assert.equal(published.id, fixtureId);
  assert.deepEqual(published.networkAccess.allowedDomains, ['ws://localhost:38475']);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['code.js','manifest.json','ui.html']);
  for (const file of fs.readdirSync(directory)) {
    const content = fs.readFileSync(directory + '/' + file, 'utf8');
    for (const key of ['plugin','control']) assert.equal(content.includes(service.credentials[key]), false);
  }
} finally {
  await service.close();
}
"""], bridge, env)
print('ZIP 安装、隔离服务认证和插件构建通过，临时环境已清理。')
