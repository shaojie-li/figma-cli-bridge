"""Check the repository's English Conventional Commit policy."""
import re
import sys
import unicodedata

TYPES = 'feat fix docs style refactor perf test build ci chore revert'.split()
SCOPES = 'plugin cli skill bridge design docs test build repo deps'.split()
HEADER = re.compile(r'(?P<kind>[a-z]+)(?:\((?P<scope>[a-z]+)\))?!?: (?P<subject>\S.*)')
AUTO_HEADER = re.compile(r"""(?:Merge (?:branch|branches|tag|remote-tracking branch|pull request) .+|Revert ".+")""")


def check(message):
    lines = message.splitlines()
    title = lines[0] if lines else ''
    if any(ch.isalpha() and 'LATIN' not in unicodedata.name(ch, '') for ch in message):
        return 'Write the subject, body and trailers in English.'
    if len(title) > 100:
        return 'Keep the header within 100 characters.'
    if AUTO_HEADER.fullmatch(title):
        return
    match = HEADER.fullmatch(title)
    if not match or match['kind'] not in TYPES or not re.search('[A-Za-z]', match['subject']):
        return 'Use an English Conventional Commit, e.g. fix(plugin): restore the connection.'
    if match['scope'] and match['scope'] not in SCOPES:
        return 'Allowed scopes: ' + ', '.join(SCOPES)


if __name__ == '__main__':
    error = check(sys.stdin.read())
    if error:
        sys.exit(error)
