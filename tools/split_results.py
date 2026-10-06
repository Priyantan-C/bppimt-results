#!/usr/bin/env python3
"""
BPPIMT result sheet cleaner.

For every result workbook it:
  1. removes the "College Name" and "Course Code" columns
  2. shortens the course name (e.g. "Bachelor of Technology in Electronics &
     Communication Engine" becomes "B.Tech ECE")
  3. removes the gap columns (no heading, and only blank / "()" / 0 values);
     columns with a heading are always kept
  4. shortens the semester ("Fourth Semester" becomes "4th Sem")
  5. upper-cases all headings and fixes heading typos
  6. writes each course to its own sheet. If a course appears in more than
     one block (e.g. MCA students with different electives) the blocks are
     merged into one sheet, with one column per subject.

Usage
  python split_results.py                     every .xlsx in this folder
  python split_results.py 2ND_SEM_RESULT.xlsx one or more files
  python split_results.py D:\\Results          a whole folder

Output is saved next to the original, and originals are never changed:
  <name>_web.xlsx   the cleaned workbook, one sheet per course
  <name>_web.html   open in a browser to copy each course's table into WordPress
Needs: pip install openpyxl
"""
import html
import re
import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# ----------------------------------------------------------------- settings
# Columns removed by heading (case and spacing do not matter).
DROP_COLUMNS = ["College Name", "Course Code"]

# Full names. Matching ignores case/punctuation and tolerates the truncated
# names the university export produces ("...Communication Engine").
COURSE_SHORT_NAMES = {
    "Bachelor of Technology in Computer Science & Engineering": "B.Tech CSE",
    "Bachelor of Technology in Information Technology": "B.Tech IT",
    "Bachelor of Technology in Electronics & Communication Engineering": "B.Tech ECE",
    "Bachelor of Technology in Electrical Engineering": "B.Tech EE",
    "Master of Computer Application": "MCA",
    "Master of Technology in Data Science": "M.Tech DS",
}
# Used to build a short name for any course not listed above.
DEGREE_SHORT = {
    "bachelor of technology": "B.Tech",
    "master of technology": "M.Tech",
    "bachelor of computer application": "BCA",
    "master of computer application": "MCA",
    "bachelor of business administration": "BBA",
    "master of business administration": "MBA",
}
# Heading corrections, applied after headings are upper-cased.
HEADER_FIXES = {
    "COURSENAME": "COURSE NAME",
    "SEMETER RESULT": "SEMESTER RESULT",
}
# Values in the SEMESTER column: "Fourth Semester" becomes "4th Sem".
SEMESTER_SHORT = {
    "first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th", "fifth": "5th",
    "sixth": "6th", "seventh": "7th", "eighth": "8th", "ninth": "9th", "tenth": "10th",
    # the export also uses plain numbers ("Eight Semester")
    "one": "1st", "two": "2nd", "three": "3rd", "four": "4th", "five": "5th",
    "six": "6th", "seven": "7th", "eight": "8th", "nine": "9th", "ten": "10th",
    "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th",
    "6": "6th", "7": "7th", "8": "8th", "9": "9th", "10": "10th",
    "1st": "1st", "2nd": "2nd", "3rd": "3rd", "4th": "4th", "5th": "5th",
    "6th": "6th", "7th": "7th", "8th": "8th", "9th": "9th", "10th": "10th",
}
OUTPUT_SUFFIX = "_web"
EMPTY_VALUES = {"", "()", "0", "0.0", "-"}
# ---------------------------------------------------------------------------


def norm(text):
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def squash(text):
    return norm(text).replace(" ", "")


def is_empty(value):
    return value is None or str(value).strip() in EMPTY_VALUES


def clean_heading(h):
    h = " ".join(str(h or "").split()).upper()
    return HEADER_FIXES.get(h, h)


_SHORT = {norm(k): v for k, v in COURSE_SHORT_NAMES.items()}


def short_course(name, warnings):
    n = norm(name)
    if n in _SHORT:
        return _SHORT[n]
    # truncated export: the name is a prefix of exactly one known course
    hits = {v for k, v in _SHORT.items() if len(n) >= 15 and k.startswith(n)}
    if len(hits) == 1:
        return hits.pop()
    # fallback: degree abbreviation + initials of the branch
    for degree, short in DEGREE_SHORT.items():
        if n.startswith(degree):
            branch = n[len(degree):].split()
            initials = "".join(w[0].upper() for w in branch if w not in ("in", "and", "of"))
            guess = f"{short} {initials}".strip()
            break
    else:
        guess = str(name).strip()
    warnings.append(f'unknown course "{name}" shortened to "{guess}" '
                    f"(add it to COURSE_SHORT_NAMES to control this)")
    return guess


def short_semester(value, warnings):
    words = [w for w in norm(value).split() if w not in ("semester", "sem")]
    if len(words) == 1 and words[0] in SEMESTER_SHORT:
        return f"{SEMESTER_SHORT[words[0]]} Sem"
    if value is not None and str(value).strip():
        warnings.append(f'semester value "{value}" not recognised, left as it is')
    return value


def is_header_row(row):
    cells = {squash(v) for v in row}
    return "rollno" in cells and "coursename" in cells


def read_blocks(ws):
    """Split the sheet into (header, rows) blocks; the export repeats the header per course."""
    blocks, current = [], None
    for row in ws.iter_rows(values_only=True):
        row = list(row)
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        if is_header_row(row):
            current = {"header": row, "rows": []}
            blocks.append(current)
        elif current is not None:
            current["rows"].append(row)
    return [b for b in blocks if b["rows"]]


def block_columns(header, rows):
    """Columns of one block that survive, as (heading, index). Returns (columns, removed count)."""
    drop = {squash(c) for c in DROP_COLUMNS}
    cols, seen, removed = [], {}, 0
    for i, h in enumerate(header):
        has_heading = h is not None and str(h).strip() != ""
        if has_heading and squash(h) in drop:
            removed += 1
            continue
        if not has_heading:
            if all(is_empty(r[i]) for r in rows):
                removed += 1              # the gap
                continue
            name = f"COLUMN {get_column_letter(i + 1)}"   # data without a heading: keep it
        else:
            name = clean_heading(h)
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = f"{name} ({seen[name]})"
        cols.append((name, i))
    return cols, removed


def merge_headings(merged, new):
    """Add headings from a later block, each placed just before the next heading already known."""
    for pos, name in enumerate(new):
        if name in merged:
            continue
        after = next((n for n in new[pos + 1:] if n in merged), None)
        merged.insert(merged.index(after) if after else len(merged), name)


def process(path):
    warnings = []
    src = load_workbook(path, data_only=True)
    courses = {}   # short name -> {"headings": [...], "rows": [dict], "removed": n, "blocks": n}
    for ws in src.worksheets:
        for block in read_blocks(ws):
            header = block["header"]
            rows = [r + [None] * (len(header) - len(r)) for r in block["rows"]]
            c_course = next(i for i, h in enumerate(header) if squash(h) == "coursename")
            c_sem = next((i for i, h in enumerate(header) if squash(h) == "semester"), None)
            cols, removed = block_columns(header, rows)
            names = [n for n, _ in cols]
            for r in rows:
                short = short_course(r[c_course], warnings)
                r[c_course] = short
                if c_sem is not None:
                    r[c_sem] = short_semester(r[c_sem], warnings)
                c = courses.setdefault(short, {"headings": [], "rows": [], "removed": removed,
                                               "sets": []})
                if names not in c["sets"]:
                    c["sets"].append(names)
                    merge_headings(c["headings"], names)
                c["rows"].append({n: r[i] for n, i in cols})
    if not courses:
        raise ValueError("no header row with ROLL NO / COURSENAME found")

    out = Workbook()
    out.remove(out.active)
    summary, used, sheets = [], set(), []
    for short, c in courses.items():
        title = re.sub(r"[\[\]:*?/\\]", "", short)[:31]
        base, n = title, 2
        while title.lower() in used:
            title = f"{base[:27]} ({n})"
            n += 1
        used.add(title.lower())
        ws = out.create_sheet(title)
        table = [[cell_value(r.get(h)) for h in c["headings"]] for r in c["rows"]]
        ws.append(c["headings"])
        for line in table:
            ws.append(line)
        style(ws)
        sheets.append((title, c["headings"], table))
        note = ""
        if len(c["sets"]) > 1:
            extra = [h for h in c["headings"] if not all(h in s for s in c["sets"])]
            note = f"{len(c['sets'])} blocks merged, not taken by everyone: {', '.join(extra)}"
        summary.append((title, len(c["rows"]), c["removed"], note))

    dest = path.with_name(path.stem + OUTPUT_SUFFIX + ".xlsx")
    out.save(dest)
    dest.with_suffix(".html").write_text(build_html(path.stem, sheets), encoding="utf-8")
    return dest, summary, sorted(set(warnings))


def table_html(headings, table):
    """Plain table markup with no styling, so the website theme decides how it looks."""
    esc = lambda v: html.escape("" if v is None else str(v))
    lines = ["<table>", "<thead>",
             "<tr>" + "".join(f"<th>{esc(h)}</th>" for h in headings) + "</tr>",
             "</thead>", "<tbody>"]
    lines += ["<tr>" + "".join(f"<td>{esc(v)}</td>" for v in row) + "</tr>" for row in table]
    return "\n".join(lines + ["</tbody>", "</table>"])


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  body { font: 14px/1.4 system-ui, Segoe UI, Arial, sans-serif; margin: 0; color: #1b2430; background: #f4f6f9; }
  header { position: sticky; top: 0; z-index: 2; background: #1f3864; color: #fff; padding: 12px 20px; }
  header h1 { font-size: 17px; margin: 0 0 8px; }
  header p { margin: 0 0 10px; opacity: .85; font-size: 13px; }
  .tabs button, .bar button { font: inherit; cursor: pointer; border-radius: 6px; padding: 6px 12px; }
  .tabs button { border: 1px solid rgba(255,255,255,.4); background: transparent; color: #fff; margin: 0 6px 6px 0; }
  .tabs button.on { background: #fff; color: #1f3864; font-weight: 600; }
  section { display: none; padding: 16px 20px 40px; }
  section.on { display: block; }
  .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
  .bar button { border: 0; background: #1f3864; color: #fff; font-weight: 600; }
  .bar button.alt { background: #fff; color: #1f3864; border: 1px solid #1f3864; }
  .bar span { color: #1a7f37; font-weight: 600; }
  .wrap { overflow: auto; background: #fff; border: 1px solid #d5dae2; border-radius: 6px; }
  .wrap table { border-collapse: collapse; white-space: nowrap; }
  .wrap th, .wrap td { border: 1px solid #d5dae2; padding: 4px 9px; text-align: center; }
  .wrap th { background: #e9edf5; }
  .wrap td:nth-child(2) { text-align: left; }
</style></head><body>
<header>
  <h1>__TITLE__</h1>
  <p>Pick a course, click "Copy table", then paste into the WordPress editor. If your editor wants code, use "Copy HTML code" and paste into a Custom HTML block.</p>
  <div class="tabs">__TABS__</div>
</header>
__SECTIONS__
<script>
  var tabs = document.querySelectorAll('.tabs button'), secs = document.querySelectorAll('section');
  function show(i) {
    tabs.forEach(function (t, n) { t.classList.toggle('on', n === i); });
    secs.forEach(function (s, n) { s.classList.toggle('on', n === i); });
  }
  tabs.forEach(function (t, i) { t.onclick = function () { show(i); }; });
  function done(sec, msg) {
    var note = sec.querySelector('.bar span');
    note.textContent = msg;
    setTimeout(function () { note.textContent = ''; }, 2500);
  }
  function fallback(sec, asCode, msg) {
    var sel = window.getSelection(), range = document.createRange(), box = null;
    if (asCode) {
      box = document.createElement('textarea');
      box.value = sec.querySelector('table').outerHTML;
      document.body.appendChild(box);
      box.select();
    } else {
      range.selectNode(sec.querySelector('table'));
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('copy');
    sel.removeAllRanges();
    if (box) box.remove();
    done(sec, msg);
  }
  function copyTable(btn, asCode) {
    var sec = btn.closest('section'), code = sec.querySelector('table').outerHTML;
    var msg = asCode ? 'HTML code copied' : 'Table copied';
    try {
      var job = asCode ? navigator.clipboard.writeText(code)
        : navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([code], { type: 'text/html' }),
            'text/plain': new Blob([sec.querySelector('table').innerText], { type: 'text/plain' })
          })]);
      job.then(function () { done(sec, msg); }, function () { fallback(sec, asCode, msg); });
    } catch (e) { fallback(sec, asCode, msg); }
  }
  show(0);
</script>
</body></html>
"""


def build_html(name, sheets):
    title = html.escape(name.replace("_", " ") + " : tables for the website")
    tabs = "".join(f"<button>{html.escape(t)} ({len(rows)})</button>" for t, _, rows in sheets)
    sections = "\n".join(
        '<section><div class="bar">'
        '<button onclick="copyTable(this, false)">Copy table</button>'
        '<button class="alt" onclick="copyTable(this, true)">Copy HTML code</button>'
        f'<span></span></div><div class="wrap">\n{table_html(h, rows)}\n</div></section>'
        for _, h, rows in sheets)
    return PAGE.replace("__TITLE__", title).replace("__TABS__", tabs).replace("__SECTIONS__", sections)


def cell_value(v):
    if isinstance(v, str):
        v = v.strip()
        return None if v == "()" else v
    return v


def style(ws):
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    head_fill = PatternFill("solid", fgColor="1F3864")
    for col in ws.iter_cols():
        width = 0
        for cell in col:
            cell.border = border
            cell.number_format = "@" if isinstance(cell.value, str) else "General"
            cell.alignment = Alignment(horizontal="left" if cell.column == 2 else "center",
                                       vertical="center")
            width = max(width, len(str(cell.value or "")))
        head = col[0]
        head.font = Font(bold=True, color="FFFFFF")
        head.fill = head_fill
        head.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(head.column)].width = min(max(width + 3, 9), 45)
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "C2"


def collect(args):
    here = Path(__file__).resolve().parent
    targets = [Path(a) for a in args] or [here]
    files = []
    for t in targets:
        files += sorted(t.glob("*.xlsx")) if t.is_dir() else [t]
    return [f for f in files if not f.stem.endswith(OUTPUT_SUFFIX) and not f.name.startswith("~$")]


def main():
    files = collect(sys.argv[1:])
    if not files:
        print("No .xlsx files found.")
        return
    for f in files:
        try:
            dest, summary, warnings = process(f)
        except Exception as e:  # keep going with the other files
            print(f"\n{f.name}: FAILED ({e})")
            continue
        print(f"\n{f.name} -> {dest.name} and {dest.with_suffix('.html').name}")
        for title, n, removed, note in summary:
            print(f"  {title:<14} {n:>4} students, {removed:>2} columns removed"
                  + (f"   [{note}]" if note else ""))
        for w in warnings:
            print(f"  NOTE: {w}")


if __name__ == "__main__":
    main()
