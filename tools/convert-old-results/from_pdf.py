import json, os, re, sys
import pdfplumber
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core

PDFS, OUT = sys.argv[1], sys.argv[2]
FULL = ["Bachelor of Technology in Computer Science & Engineering",
        "Bachelor of Technology in Information Technology",
        "Bachelor of Technology in Electronics & Communication Engineering",
        "Bachelor of Technology in Electronics & Communication Engine",
        "Bachelor of Technology in Electrical Engineering",
        "Master of Computer Application", "Master of Computer Applications",
        "Master of Technology in Data Science"]
HEADS = ["SEMETER RESULT", "OVERALL RESULT", "TOTAL MAR POINTS", "COURSENAME", "College Name", "Semester"]
sig = lambda s: "".join(sorted(re.sub(r"[^A-Za-z]", "", s).lower()))
SIG = {sig(x): x for x in FULL + HEADS}


def fix(cell):
    """Join wrapped lines; un-scramble cells whose wrapped lines were printed on top of each other."""
    v = core.clean((cell or "").replace("\n", " "))
    return SIG.get(sig(v), v) if len(v) > 8 else v


def rolls_by_position(pg):
    """Independent count: digits sitting in the first table column, grouped line by line."""
    out = set()
    for t in pg.find_tables():
        cells = [c for c in (r.cells[0] for r in t.rows) if c]
        if not cells:
            continue
        x1 = max(c[2] for c in cells)
        rows = {}
        for ch in pg.chars:
            if ch["text"].isdigit() and ch["x1"] <= x1 + 1:
                rows.setdefault(round(ch["top"] / 3), []).append((ch["x0"], ch["text"]))
        for chars in rows.values():
            val = "".join(c for _, c in sorted(chars))
            if re.fullmatch(r"\d{11}", val):
                out.add(val)
    return out


def read(path, notes):
    blocks, cur, degree, text_rolls, geo_rolls = [], None, None, set(), set()
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            text = pg.extract_text() or ""
            text_rolls.update(re.findall(r"(?m)^(\d{11})\b", text))
            geo_rolls.update(rolls_by_position(pg))
            page_start = len(blocks[-1][1]) if blocks else 0
            m = re.search(r"Degree\s+(.+)", text)
            if m:
                degree = m.group(1).strip()
            for table in pg.extract_tables():
                for row in table:
                    row = [fix(c) for c in row]
                    if core.is_blank(row):
                        continue
                    if core.is_header(row):
                        # a heading that spilled into the next cell ("PCC-CS39" + "2")
                        for i in range(1, len(row)):
                            m2 = re.match(r"^(\d{1,2})\s+(\S.*)$", row[i])
                            if m2 and re.search(r"\d$", row[i - 1]):
                                row[i - 1] += m2.group(1); row[i] = m2.group(2)
                        for i in range(len(row) - 1, 0, -1):
                            if 0 < len(row[i]) <= 2 and row[i - 1] and re.search(r"\d$", row[i - 1]):
                                row[i - 1] += row[i]; row[i] = ""
                        if degree and "COURSENAME" not in row:
                            row = row + ["COURSENAME"]
                            cur = (row, [], degree)
                        else:
                            cur = (row, [], None)
                        blocks.append(cur)
                    elif cur is None:
                        notes.append(f"REVIEW row before any heading: {row[:2]}")
                    elif not re.fullmatch(r"\d{11}", row[0]):
                        notes.append(f"REVIEW row without a roll number: {row[:3]}")
                    else:
                        cur[1].append(row + [cur[2]] if cur[2] else row)
            if cur is not None:
                have = {r[0] for b in blocks for r in b[1]}
                lines = text.split("\n")
                for li, line in enumerate(lines):
                    m3 = re.match(r"^(\d{11})\s+((?:\S+\(\S*\)|F|I|X|AB)(?:\s+\S+)+)$", line)
                    if not m3 or m3.group(1) in have:
                        continue
                    vals = m3.group(2).split()
                    slots = [i for i, h in enumerate(cur[0]) if h and i >= 2 and h != "COURSENAME"]
                    name = " ".join(x for x in (lines[li - 1] if li else "", lines[li + 1] if li + 1 < len(lines) else "")
                                    if x and not re.match(r"^(\d{11}|Page )", x))
                    if len(vals) != len(slots) or not name:
                        notes.append(f"REVIEW roll {m3.group(1)}: row broken across pages could not be rebuilt")
                        continue
                    row = [""] * len(cur[0])
                    row[0], row[1] = m3.group(1), name
                    for i, v in zip(slots, vals):
                        row[i] = v
                    if cur[2]:
                        row[cur[0].index("COURSENAME")] = cur[2]
                    prev = re.match(r"^(\d{11})", lines[li - 2] if li >= 2 else "")
                    pos = next((k + 1 for k, r in enumerate(cur[1]) if prev and r[0] == prev.group(1)), len(cur[1]))
                    cur[1].insert(pos, row)
                    notes.append(f"INFO roll {m3.group(1)} ({name}) was split across a page break and rebuilt from the page text")
    got = {r[0] for b in blocks for r in b[1]}
    text_rolls |= geo_rolls
    if text_rolls - got:
        notes.append(f"REVIEW {len(text_rolls - got)} roll numbers in the PDF text are missing from the tables: {sorted(text_rolls - got)[:5]}")
    return [(b[0], b[1]) for b in blocks], len(text_rolls)


report = json.load(open(os.path.join(OUT, "_report.json")))
report = [r for r in report if r["year"] != "2019-20"]
for sem in range(1, 9):
    slug = f"{core.ORD[sem]}-semester-results-2019-20"
    notes = []
    blocks, n_text = read(os.path.join(PDFS, f"s{sem}.pdf"), notes)
    src_rows = sum(len(b[1]) for b in blocks)
    data = core.normalise(blocks, sem, notes)
    core.shared_heading_check(data, sem, notes)
    out_rows = sum(len(g["rows"]) for gs in data.values() for g in gs)
    json.dump({"slug": slug, "title": f"{core.ORD[sem]} Semester Results 2019-20", "year": "2019-20", "semester": sem,
               "courses": [{"course": c, "tables": [{"headings": g["headings"],
                            "rows": [[r.get(h, "") for h in g["headings"]] for r in g["rows"]]} for g in gs]}
                           for c, gs in data.items()]},
              open(os.path.join(OUT, slug + ".json"), "w"), ensure_ascii=False)
    report.append({"slug": slug, "year": "2019-20", "sem": sem, "src_tables": len(blocks), "src_rows": n_text,
                   "out_rows": out_rows, "courses": {c: [len(g["rows"]) for g in gs] for c, gs in data.items()},
                   "notes": notes, "pdf": True})
    print(f"S{sem}: rolls in PDF text {n_text} | table rows {src_rows} | out {out_rows} | {{c: [len(g['rows']) for g in gs]}}".replace("{c: [len(g['rows']) for g in gs]}", str({c: [len(g['rows']) for g in gs] for c, gs in data.items()})))
    for c, gs in data.items():
        for g in gs:
            print("     ", c, len(g["rows"]), g["headings"][4:])
    for n in sorted(set(notes)):
        if "table without" not in n: print("      !!", n[:200])
json.dump(report, open(os.path.join(OUT, "_report.json"), "w"), indent=1)
