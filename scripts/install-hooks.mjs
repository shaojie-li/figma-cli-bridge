import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// A source clone (including a linked worktree) has its own .git entry.
if (existsSync('.git') && existsSync('.githooks/commit-msg')) {
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
