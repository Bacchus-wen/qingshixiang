"""Find code swallowed by a // comment (python3 tools/lint-comments.py [files...]; default: src/**/*.js).

Twice in this project a `//` comment pasted into the middle of a line silently turned the rest of the line into
comment text (the street lamp's position; the beam's intensity, which then stayed 0 for three review rounds). The
file still parses, so nothing complains. This flags comments whose text looks like code: an assignment or a call
followed by a semicolon, or a statement keyword with ; or {. Read each hit; most are prose with parentheses.
Exit status 1 when something is found.
"""
import glob
import re
import sys

files = sys.argv[1:] or sorted(glob.glob('src/**/*.js', recursive=True))
CODE = [
    re.compile(r'[A-Za-z_\]\)]\s*(=|\+=|-=)\s*[^=>].*;'),   # x = ...;
    re.compile(r'\)\s*;\s*[A-Za-z_]'),                       # f(); next
    re.compile(r'\b(if|const|let|this|return)\b[^.]*[;{]'),  # if (...) {  /  const a = ...;
    re.compile(r'\.value\s*='),                               # u.k.value = ...
]
hits = 0
for f in files:
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        line = line.replace('://', '')  # URLs
        i = line.find('//')
        if i < 0 or line[:i].count("'") % 2 or line[:i].count('`') % 2:  # inside a string
            continue
        code, c = line[:i], line[i + 2:]
        if not code.strip():  # a whole-line comment: only flag the strongest signal
            if CODE[3].search(c):
                print(f'{f}:{n}: {c.strip()[:160]}'); hits += 1
            continue
        if any(p.search(c) for p in CODE):
            print(f'{f}:{n}: {c.strip()[:160]}'); hits += 1
print(f'{hits} suspicious comment(s) in {len(files)} files')
sys.exit(1 if hits else 0)
