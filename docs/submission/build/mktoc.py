import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))

HEADINGS = []
src = open(os.path.join(HERE, 'build.js')).read()
# Preserve document order of H1(...) / H2(...) calls, skipping the helper definitions.
for m in re.finditer(r"\n\s*(H1|H2)\('((?:[^'\\]|\\.)*)'\)", src):
    lvl = 1 if m.group(1) == 'H1' else 2
    title = m.group(2).replace("\\'", "'")
    HEADINGS.append((lvl, title))
# Drop the TOC's own heading.
HEADINGS = [h for h in HEADINGS if h[1] != 'Table of Contents']

txt = subprocess.run(['pdftotext', '-layout', os.path.join(HERE, '..', 'Bit-by-Bit_MyB_Phase2.pdf'), '-'],
                     capture_output=True, text=True).stdout
pages = txt.split('\f')

def norm(s):
    return re.sub(r'\s+', ' ', s).replace('’', "'").replace('—', '-').strip().lower()

out, cursor = [], 2  # skip the cover and the contents page itself
for lvl, title in HEADINGS:
    t = norm(title)
    found = None
    for i in range(cursor, len(pages)):
        for line in pages[i].splitlines():
            if norm(line) == t:
                found = i + 1
                break
        if not found:
            # Headings that wrap onto two lines lose their line break.
            if t in norm(pages[i]):
                found = i + 1
        if found:
            break
    if not found:
        print('!! not located:', title, file=sys.stderr)
        found = cursor + 1
    else:
        cursor = found - 1
    out.append({'title': title, 'page': found, 'level': lvl})

json.dump(out, open(os.path.join(HERE, 'toc.json'), 'w'), indent=1)
print(f'{len(out)} entries, pages {out[0]["page"]}..{out[-1]["page"]}')
