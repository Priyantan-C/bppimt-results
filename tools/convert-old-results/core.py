"""Shared rules for bringing every BPPIMT result into one format."""
import re

COURSES = {  "628": "M.Tech IoT",  # university course code (digits 4-6 of the roll number) -> short name
    "001": "B.Tech CSE", "002": "B.Tech IT", "003": "B.Tech ECE", "016": "B.Tech EE",
    "710": "MCA", "617": "M.Tech DS",
}
NAME_TO_SHORT = {
    "bachelor of technology in computer science engineering": "B.Tech CSE",
    "bachelor of technology in information technology": "B.Tech IT",
    "bachelor of technology in electronics communication engineering": "B.Tech ECE",
    "bachelor of technology in electrical engineering": "B.Tech EE",
    "master of computer application": "MCA", "master of computer applications": "MCA",
    "master of technology in data science": "M.Tech DS",
    "master of technology in internet of things": "M.Tech IoT",
    "cse": "B.Tech CSE", "it": "B.Tech IT", "ece": "B.Tech ECE", "ee": "B.Tech EE",
    "mca": "MCA", "mds": "M.Tech DS",
    "b tech cse": "B.Tech CSE", "b tech it": "B.Tech IT", "b tech ece": "B.Tech ECE",
    "b tech ee": "B.Tech EE", "m tech ds": "M.Tech DS", "m tech iot": "M.Tech IoT",
}
HEADER_FIXES = {"COURSENAME": "COURSE NAME", "SEMETER RESULT": "SEMESTER RESULT",
                "ROLL NO.": "ROLL NO", "ROLLNO": "ROLL NO"}
LEAD = ["ROLL NO", "NAME", "SEMESTER", "COURSE NAME"]
DROP = {"COLLEGE NAME", "COURSE CODE"}
TAIL_RE = re.compile(r"^(SGPA\d*|YGPA|DGPA|CGPA|SEMESTER RESULT|OVERALL RESULT|TOTAL MAR POINTS)$")
ORD = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th"}


def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", str(t or "").lower()).strip()


def clean(v):
    v = re.sub(r"\s+", " ", str(v if v is not None else "").replace("\xa0", " ")).strip()
    if v in ("()", ""):
        return ""
    if re.fullmatch(r"[—–-]+", v):      # WordPress turned "---" into a long dash
        return "---"
    return v


def heading(h):
    h = clean(h).upper()
    return HEADER_FIXES.get(h, h)


def short_course(name):
    n = norm(name)
    if n in NAME_TO_SHORT:
        return NAME_TO_SHORT[n]
    hits = {v for k, v in NAME_TO_SHORT.items() if len(n) >= 20 and k.startswith(n)}
    return hits.pop() if len(hits) == 1 else None


def course_from_roll(roll):
    roll = str(roll).strip()
    return COURSES.get(roll[3:6]) if re.fullmatch(r"\d{11}", roll) else None


def is_header(cells):
    c = {norm(x).replace(" ", "") for x in cells}
    return "rollno" in c and "name" in c


def is_blank(cells):
    return all(clean(x) == "" for x in cells)


def normalise(blocks, sem_no, notes):
    """blocks: list of (header cells, list of rows). Returns ordered {course: [group]}
    where group = {"headings": [...], "rows": [[...]]}."""
    sem = f"{ORD[sem_no]} Sem"
    out = {}
    for header, rows in blocks:
        heads = [heading(h) for h in header]
        width = len(heads)
        fixed = []
        for r in rows:
            r = [clean(x) for x in r]
            while len(r) > width and r[-1] == "":
                r.pop()
            surplus = len(r) - width
            if surplus > 0:                       # stray empty cell inside the row
                for i in range(len(r) - 1, 1, -1):
                    if surplus and r[i] == "":
                        del r[i]; surplus -= 1
                if surplus:
                    notes.append(f"REVIEW roll {r[0]}: row has more values than headings")
                    r = r[:width]
            if len(r) < width:
                if any(heads[len(r):]):
                    notes.append(f"REVIEW roll {r[0]}: row is {width - len(r)} value(s) short of its headings")
                r = r + [""] * (width - len(r))
            fixed.append(r)
        rows = fixed
        if not rows:
            continue
        idx = {h: i for i, h in enumerate(heads) if h}
        if "ROLL NO" not in idx:
            notes.append(f"table without ROLL NO heading skipped ({len(rows)} rows)")
            continue
        # columns to carry: headed, not dropped, not lead; unheaded only if they hold data
        cols = []
        seen = {}
        for i, h in enumerate(heads):
            if h in DROP or h in LEAD:
                continue
            if not h:
                if all(r[i] in ("", "0") for r in rows):
                    continue
                notes.append(f"WRONGHEAD {heads[i - 1] or 'column'}: data sits under a blank heading")
                h = f"COLUMN {i + 1}"
            seen[h] = seen.get(h, 0) + 1
            cols.append((h if seen[h] == 1 else f"{h} ({seen[h]})", i))
        block_course = None
        if "COURSE NAME" not in idx:              # no course column: the table's majority decides
            votes = {}
            for r in rows:
                c = course_from_roll(r[idx["ROLL NO"]])
                if c:
                    votes[c] = votes.get(c, 0) + 1
            if votes:
                block_course = max(votes, key=votes.get)
                notes.append(f"INFO table without a course column assigned to {block_course} from roll numbers ({len(rows)} rows)")
        for r in rows:
            roll = r[idx["ROLL NO"]]
            named = r[idx["COURSE NAME"]] if "COURSE NAME" in idx else ""
            by_name = short_course(named) if named else None
            if named and not by_name:
                notes.append(f"REVIEW roll {roll}: course name '{named}' not recognised")
            course = by_name or block_course or course_from_roll(roll)
            if not course:
                notes.append(f"REVIEW roll {roll}: course could not be worked out, row left out")
                continue
            if "SEMESTER" in idx and r[idx["SEMESTER"]]:
                sv = norm(r[idx["SEMESTER"]])
                want = {norm(sem), norm(sem).replace("sem", "semester")}
                words = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eight"]
                if not (sv in want or sv.startswith(words[sem_no])):
                    notes.append(f"REVIEW roll {roll}: semester column says '{r[idx['SEMESTER']]}' on a {sem} page")
            rec = {"ROLL NO": roll, "NAME": r[idx["NAME"]] if "NAME" in idx else "",
                   "SEMESTER": sem, "COURSE NAME": course}
            rec.update({h: r[i] for h, i in cols})
            names = [h for h, _ in cols]
            groups = out.setdefault(course, [])
            subj = {h for h in names if not TAIL_RE.match(h)}
            best, score = None, 0.0
            for g in groups:
                gs = {h for h in g["headings"] if not TAIL_RE.match(h) and h not in LEAD}
                sc = len(subj & gs) / max(len(subj | gs), 1)
                if names in g["sets"]:
                    sc = 2
                if sc > score:
                    best, score = g, sc
            if best is None or score < 0.5:
                best = {"headings": list(LEAD), "sets": [], "rows": []}
                groups.append(best)
            if names not in best["sets"]:
                best["sets"].append(names)
                merge(best["headings"], names)
            best["rows"].append(rec)
    return out


def merge(merged, new):
    """Insert unseen headings just before the next heading already present; tail columns stay last."""
    for pos, name in enumerate(new):
        if name in merged:
            continue
        after = next((n for n in new[pos + 1:] if n in merged), None)
        if after is None and not TAIL_RE.match(name):
            after = next((n for n in merged if TAIL_RE.match(n)), None)
        merged.insert(merged.index(after) if after else len(merged), name)


def subjects(headings):
    return [h for h in headings if h not in LEAD and not TAIL_RE.match(h)]


def shared_heading_check(data, sem_no, notes):
    """Different courses carrying identical subject headings usually means a heading was pasted wrongly."""
    ok_pairs = [{"B.Tech CSE", "B.Tech IT"}] + ([{"B.Tech ECE", "B.Tech EE"}] if sem_no <= 2 else [])
    seen = {}
    for course, groups in data.items():
        for g in groups:
            key = tuple(subjects(g["headings"]))
            if not key:
                continue
            for other in seen.get(key, []):
                if other != course and {other, course} not in ok_pairs:
                    notes.append(f"WRONGHEAD {course} and {other} carry identical subject headings ({key[0]} ...)")
            seen.setdefault(key, []).append(course)
