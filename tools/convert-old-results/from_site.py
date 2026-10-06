import glob, json, os, re, sys
from bs4 import BeautifulSoup
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core

SITE = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
report = []
for f in sorted(glob.glob(os.path.join(SITE, "*-semester-results-*.html"))):
    slug = os.path.basename(f)[:-5]
    soup = BeautifulSoup(open(f, encoding="utf-8", errors="replace").read(), "lxml")
    title = soup.find("h1").get_text(strip=True)
    year = re.search(r"(\d{4}-\d{2})", slug).group(1)
    sem_no = int(re.match(r"(\d)", slug.replace("86th", "8th")).group(1))
    art = soup.find("article")
    tables = art.find_all("table")
    if not tables:
        continue
    notes, blocks, src_rows = [], [], 0
    for t in tables:
        cur = None
        for tr in t.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if core.is_blank(cells):
                continue
            if core.is_header(cells):
                cur = (cells, []); blocks.append(cur)
            elif cur is None:
                notes.append(f"row before any heading: {cells[:3]}")
            else:
                cur[1].append(cells); src_rows += 1
    data = core.normalise(blocks, sem_no, notes)
    core.shared_heading_check(data, sem_no, notes)
    out_rows = sum(len(g["rows"]) for gs in data.values() for g in gs)
    rolls = [r["ROLL NO"] for gs in data.values() for g in gs for r in g["rows"]]
    dups = sorted({x for x in rolls if rolls.count(x) > 1})
    if dups:
        notes.append(f"{len(dups)} roll numbers appear more than once: {', '.join(dups[:6])}")
    json.dump({"slug": slug, "title": title, "year": year, "semester": sem_no,
               "courses": [{"course": c, "tables": [{"headings": g["headings"],
                            "rows": [[r.get(h, "") for h in g["headings"]] for r in g["rows"]]} for g in gs]}
                           for c, gs in data.items()]},
              open(os.path.join(OUT, slug + ".json"), "w"), ensure_ascii=False)
    report.append({"slug": slug, "year": year, "sem": sem_no, "src_tables": len(tables), "src_rows": src_rows,
                   "out_rows": out_rows, "courses": {c: [len(g["rows"]) for g in gs] for c, gs in data.items()},
                   "notes": notes})
json.dump(report, open(os.path.join(OUT, "_report.json"), "w"), indent=1)
from collections import Counter
bad = 0
for r in sorted(report, key=lambda r: (r["year"], r["sem"])):
    flag = "" if r["src_rows"] == r["out_rows"] else "  <-- ROW MISMATCH"
    kinds = Counter(re.sub(r"roll \d+", "roll #", n) for n in r["notes"] if not n.startswith("INFO"))
    multi = {c: v for c, v in r["courses"].items() if len(v) > 1}
    if kinds or flag: bad += 1
    print(f"{r['year']} S{r['sem']} tables {r['src_tables']:>2} -> {sum(len(v) for v in r['courses'].values()):>2} | rows {r['src_rows']:>3} -> {r['out_rows']:>3}{flag} | split: {multi}")
    for k, v in kinds.items():
        print(f"        {v}x {k[:170]}")
print("posts needing review:", bad, "of", len(report), "| total rows", sum(r["out_rows"] for r in report))
