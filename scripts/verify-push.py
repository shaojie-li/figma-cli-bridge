"""Check outgoing messages and smoke-test the packaged source at each pushed tip."""
from pathlib import Path
import subprocess
import sys
import tempfile


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def verify_release(tip):
    with tempfile.TemporaryDirectory(prefix='cli-bridge-push-') as tmp:
        archive = Path(tmp) / 'source.tar'
        subprocess.run(['git', 'archive', '-o', str(archive), tip], check=True)
        subprocess.run(['tar', '-xf', str(archive), '-C', tmp], check=True)
        # The ZIP installer installs its own dependencies and uses an ephemeral port.
        subprocess.run([sys.executable, 'scripts/install-global-skill.py', '--package'], cwd=tmp, check=True)
        subprocess.run([sys.executable, 'scripts/verify-zip-install.py'], cwd=tmp, check=True)


def main():
    tips = set()
    checked = set()
    for line in sys.stdin:
        _, local_oid, _, remote_oid = line.split()
        if not local_oid.strip('0'):
            continue
        tip = git('rev-parse', local_oid + '^{commit}')
        args = [tip, '--not', '--remotes=' + sys.argv[1]]
        if remote_oid.strip('0'):
            args.append(remote_oid)
        for commit in git('rev-list', *args).splitlines():
            if commit in checked:
                continue
            message = git('show', '-s', '--format=%B', commit)
            result = subprocess.run([sys.executable, 'scripts/check-commit-message.py'], input=message, text=True)
            if result.returncode:
                sys.exit('Invalid message in commit ' + commit)
            checked.add(commit)
        tips.add(tip)
    for tip in sorted(tips):
        verify_release(tip)


if __name__ == '__main__':
    main()
