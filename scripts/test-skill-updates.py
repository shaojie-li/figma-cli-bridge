"""Exercise release checks and upgrades with no external tools or network."""
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skills/figma-cli-bridge/scripts'))
import updates


def pack(files):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as z:
        for name, value in files.items():
            z.writestr(name, value)
    return data.getvalue()


def package(version):
    runtime = {'package.json': json.dumps(dict(name='figma-local-bridge', version=version)).encode(),
               'src/cli.mjs': b'bridge', 'package-lock.json': b'{"packages":{"":{}}}'}
    bundle = pack(runtime)
    files = {'assets/bridge.zip': bundle, 'assets/bridge.sha256': hashlib.sha256(bundle).hexdigest().encode(),
             'SKILL.md': version.encode(), 'scripts/bootstrap.py': b'start', 'scripts/updates.py': b'update'}
    return runtime, files


def write(directory, files):
    for name, data in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


class UpdateTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.skill = Path(temp.name).resolve() / 'skills/figma-cli-bridge'
        self.root = self.skill.parent.parent / 'bridge'
        runtime, skill = package('1.0.9')
        write(self.skill, skill)
        write(self.root, runtime)
        write(self.root, {'.local/binding.json': b'kept'})
        _, skill = package('1.0.10')
        self.zip = pack({'figma-cli-bridge/' + k: v for k, v in skill.items()})
        name = 'figma-cli-bridge-1.0.10.zip'
        self.url = f'https://github.com/{updates.REPO}/releases/download/v1.0.10/{name}'
        self.release = dict(tag_name='v1.0.10', draft=False, prerelease=False, assets=[
            dict(name=name, browser_download_url=self.url, digest='sha256:' + hashlib.sha256(self.zip).hexdigest())])
        self.requests = []

    def download(self, url):
        self.requests.append(url)
        return {updates.LATEST: json.dumps(self.release).encode(), self.url: self.zip}[url]

    def run_update(self):
        with patch.dict(os.environ, PATH=''):
            return updates.update(self.skill, self.root, lambda _: None, lambda: False, self.download)

    def test_upgrade_then_skip_equal_and_older(self):
        self.assertTrue(self.run_update())
        self.assertEqual(json.loads((self.root / 'package.json').read_bytes())['version'], '1.0.10')
        self.assertEqual((self.skill / 'SKILL.md').read_bytes(), b'1.0.10')
        self.assertEqual((self.root / '.local/binding.json').read_bytes(), b'kept')
        self.assertFalse(self.run_update())
        self.release['tag_name'] = 'v1.0.2'
        self.assertFalse(self.run_update())
        self.assertEqual(self.requests, [updates.LATEST, self.url, updates.LATEST, updates.LATEST])

    def test_busy_checksum_and_local_edits(self):
        self.zip += b'corruption'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_update()
        self.zip = self.zip[:-10]
        write(self.root, {'.local/jobs.json': b'{"id":{"status":"running"}}'})
        with self.assertRaisesRegex(ValueError, 'unfinished'):
            self.run_update()
        write(self.root, {'.local/jobs.json': b'{}', 'src/cli.mjs': b'user edit'})
        with self.assertRaisesRegex(ValueError, 'local edits'):
            self.run_update()
        self.assertEqual((self.skill / 'SKILL.md').read_bytes(), b'1.0.9')

    def test_offline(self):
        with patch.object(updates, 'update', side_effect=urllib.error.URLError('offline')):
            self.assertFalse(updates.check(self.skill, self.root, None, None))
        self.assertEqual((self.skill / 'SKILL.md').read_bytes(), b'1.0.9')


if __name__ == '__main__':
    unittest.main()
