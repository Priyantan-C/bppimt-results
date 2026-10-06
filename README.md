# BPPIMT Results

WordPress plugin for the semester results on bppimt.ac.in. It stores each result as structured tables, shows every
result in one design, lets editors correct tables in a grid, and imports the university's Excel file directly.

- Attaches to the existing `result` post type and Academic Year taxonomy.
- Requires WordPress 6.0+ and PHP 7.4+. No build step and no external libraries.

## Install or update

1. Download this repository as a zip (Code > Download ZIP), or zip the folder as `bppimt-results`.
2. In WordPress: Plugins > Add New > Upload Plugin. When updating, choose "Replace current with uploaded".
3. Purge the page cache and the Autoptimize cache.

Stored tables live in post meta and are not affected by updating or deactivating the plugin.

## Everyday use

See `readme.txt`. In short: Results > Result Tables lists every result, with filters, a preview, and a switch
between the original page content and the new tables. "Upload result Excel" takes the university file as it arrives.

## Where things are

| Path | What it is |
|---|---|
| `bppimt-results.php` | Plugin header and version |
| `includes/data.php` | Storage, saved versions, **the course list** (`bppimt_results_courses()`) |
| `includes/render.php` | Public page markup, `the_content` filter, `[bppimt_result]` shortcode |
| `includes/admin.php` | Result Tables page, AJAX endpoints, bulk import page |
| `assets/normalize.js` | **The cleaning rules** applied to an uploaded Excel file |
| `assets/xlsx-reader.js` | Reads .xlsx in the browser |
| `assets/admin.js`, `admin.css` | The grid editor |
| `assets/list.js` | Filters and switching on the Result Tables list |
| `assets/front.js`, `front.css` | Tabs, search, sticky heading row, site styling |
| `assets/download.js` | "Download Excel", built in the visitor's browser |
| `assets/import.js` | Tools > Import Result Tables |
| `tools/` | Offline scripts, not part of the installed plugin (see below) |

## Common changes

- **New course:** add a line to `bppimt_results_courses()` in `includes/data.php` (short name, 3 digit course code
  from the roll number, full names as the university writes them). The order of that list is the tab order.
- **New heading typo from the university:** `HEADER_FIXES` in `assets/normalize.js`.
- **Colours:** the tables read the theme palette (`--accent-2`, `--purple`, `--accent-3` ...). Override the
  `--bppimt-*` variables on `.bppimt-results` to change only the tables.
- **Releasing:** bump the version in `bppimt-results.php` and `readme.txt`, add a line to `CHANGELOG.md`, tag it.

## tools/

- `tools/split_results.py`: standalone cleaner for a university Excel file. A fallback if the upload ever misbehaves.
- `tools/convert-old-results/`: the scripts used in October 2026 to convert the 48 pasted results and 8 PDFs into
  the import file. They are excluded from GitHub's "Download ZIP" (see `.gitattributes`).

## Student data

**Never commit result files.** Excel files, the import `.json` bundle and PDFs contain student names, roll numbers
and grades. `.gitignore` blocks the usual file types; keep that data out of issues and pull requests as well.
