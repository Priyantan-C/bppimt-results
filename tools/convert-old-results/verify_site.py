"""Cell-level check: every value on the live page must appear, in order, in the unified row."""
import glob, json, os, re, sys
from bs4 import BeautifulSoup
import core
SITE, OUT = sys.argv[1], sys.argv[2]
bad = tot = 0
for f in sorted(glob.glob(os.path.join(SITE, "*-semester-results-*.html"))):
    slug = os.path.basename(f)[:-5]
    jp = os.path.join(OUT, slug + ".json")
    soup = BeautifulSoup(open(f, encoding="utf-8", errors="replace").read(), "lxml")
    tables = soup.find("article").find_all("table")
    if not tables: continue
    d = json.load(open(jp))
    outrows = {}
    for c in d["courses"]:
        for t in c["tables"]:
            for r in t["rows"]:
                outrows.setdefault(r[0], []).append([v for v in r[:2] + r[4:] if v != ""])
    for t in tables:
        hdr = None
        for tr in t.find_all("tr"):
            cells = [core.clean(c.get_text(" ", strip=True)) for c in tr.find_all(["th", "td"])]
            if core.is_blank(cells): continue
            if core.is_header(cells): hdr = [core.heading(h) for h in cells]; continue
            if hdr is None: continue
            skip = {i for i, h in enumerate(hdr) if h in ("COLLEGE NAME", "COURSE CODE", "SEMESTER", "COURSE NAME")}
            src = [v for i, v in enumerate(cells) if v != "" and i not in skip]
            tot += 1
            cands = outrows.get(cells[0], [])
            if src in cands: cands.remove(src)
            else:
                bad += 1
                if bad <= 8: print("DIFF", slug, "\n  src", src, "\n  out", cands[:1])
print("rows compared", tot, "| rows that differ", bad)
