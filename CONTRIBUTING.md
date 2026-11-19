# Contributing to Figma CLI Bridge

## Enable Git hooks

From a Git clone, run:

```sh
npm ci
```

Both `npm ci` and `npm install` enable the tracked hooks in this clone, including for commits made by Codex. If your npm configuration disables lifecycle scripts, run `npm run prepare` explicitly.

## Write commit messages in English

Use `type(scope): subject`. The scope is optional. Use an imperative verb in the subject and keep the header within 100 characters. Write the body and trailers in English as well. Use `!` or a `BREAKING CHANGE:` footer for a breaking change.

- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Scopes: plugin, cli, skill, bridge, design, docs, test, build, repo, deps.
- Examples: `fix(plugin): restore pairing after reconnect`, `docs: explain installation from GitHub`.
- Standard English merge and revert headers are accepted. The check catches non-Latin letters, including Chinese characters. Reviewers check meaning and grammar.

Before a commit, Git checks the staged diff for whitespace errors and runs the Node test suite. The commit message hook checks the proposed message. Before a push, Git checks outgoing commit messages and packages and smoke-tests each pushed commit tip in a temporary directory. Fetch the remote before pushing if it contains commits missing from your clone. The ZIP smoke test needs Python 3, Node.js 22+, npm and access to the locked dependencies.

GitHub Actions runs the same message check on branch pushes and pull requests. A topic branch with an invalid message receives a failed check. To update `main`, open a pull request and use rebase merge after **English commit messages** passes. Rebase retains the validated messages. Fix a failed check by rewording the offending commits on your topic branch.
