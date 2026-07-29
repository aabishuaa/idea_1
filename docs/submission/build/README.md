# Phase 2 submission — build

The submission document (`../Bit-by-Bit_MyB_Phase2.docx`) is generated, not
hand-edited, so figures, tables and the contents page stay in sync.

```bash
npm install docx          # only dependency
node build.js             # writes ../Bit-by-Bit_MyB_Phase2.docx
```

## Files

| File | What it is |
| --- | --- |
| `build.js` | The whole document: prose, tables, figures, styling. |
| `toc.json` | Page numbers for the contents page. |
| `mktoc.py` | Regenerates `toc.json` from a rendered PDF. |
| `../figures/*.svg` | Diagram sources. The `.png` beside each one is what the document embeds. |

## The contents page

It is static text, not a Word `TOC` field — a field renders blank until someone
presses F9, and a blank contents page in a submitted document is not a risk
worth taking. The cost is that page numbers must be regenerated when the
document changes:

```bash
node build.js                                   # 1. build
soffice --headless --convert-to pdf \
  --outdir .. ../Bit-by-Bit_MyB_Phase2.docx     # 2. render
python3 mktoc.py                                # 3. re-read page numbers
node build.js                                   # 4. rebuild with them
```

`mktoc.py` skips the first two pages when searching, so re-running it against a
document that already has a filled contents page is safe. The contents page must
stay one page long for the numbers to hold — it currently uses about two thirds
of one.

## Regenerating a figure

Diagrams are hand-written SVG rendered through headless Chromium (LibreOffice
cannot load SVG directly):

```bash
printf '%s\n' '<html><head><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>' > f.html
cat ../figures/architecture.svg >> f.html
printf '%s\n' '</body></html>' >> f.html
chromium --headless --no-sandbox --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1400,1098 --screenshot=../figures/architecture.png file://$PWD/f.html
```

The viewport comes up roughly 97 px shorter than the requested window height, so
ask for that much more than the SVG needs. If you change a figure's pixel
dimensions, update the `meta` map in `build.js` — it holds each image's
aspect ratio.
