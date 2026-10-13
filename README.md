# BPPIMT Results

WordPress plugin for the semester results on bppimt.ac.in. It stores each result as structured tables, shows every
result in one design, lets editors correct tables in a grid, and imports the university's Excel file directly.

- Attaches to the existing `result` post type and Academic Year taxonomy.
- Requires WordPress 6.0+ and PHP 7.4+. No build step and no external libraries.

## Install

1. Download `bppimt-results.zip` from the latest release (Releases on the right).
2. In WordPress: Plugins > Add New > Upload Plugin.
3. Private repository: add a read-only token to `wp-config.php` so the site can see updates (see below).

Stored tables live in post meta and are not affected by updating or deactivating the plugin.

## Updates

Sites check this repository's latest release every 12 hours and offer it like any other plugin update
(Plugins, Dashboard > Updates, "update now"; automatic updates can be switched on per site). The Plugins screen
also has a "Check for updates" link that checks straight away.

**Making a release:** raise the version in three places, add a `## x.y.z` section to `CHANGELOG.md`, push to `main`:

- `bppimt-results.php`: the `Version:` line and `BPPIMT_RESULTS_VERSION`
- `readme.txt`: `Stable tag:`

The `Release` workflow then tags `vx.y.z`, publishes the release with that changelog section as notes, and
attaches `bppimt-results.zip`. Pushes that do not change the version do not make a release.

**Private repository:** each site needs a fine-grained GitHub token with access to this repository only and the
permission *Contents: Read-only*, added to `wp-config.php`:

```php
define( 'BPPIMT_RESULTS_GITHUB_TOKEN', 'github_pat_...' );
```

Without it the site cannot see private releases (the Plugins screen says so after "Check for updates").

## Everyday use

See `readme.txt`. In short: Results > Result Tables lists every result, with filters, a preview, and a switch
between the original page content and the new tables. "Upload result Excel" takes the university file as it arrives.

## Where things are

| Path | What it is |
|---|---|
| `bppimt-results.php` | Plugin header and version |
| `includes/data.php` | Storage, saved versions, regular and review results (`bppimt_results_kinds()`), **the course list** (`bppimt_results_courses()`) |
| `includes/render.php` | Public page markup, `the_content` filter, `[bppimt_result]` shortcode |
| `includes/admin.php` | Result Tables page, AJAX endpoints, bulk import page |
| `includes/listing.php` | `[bppimt_results_list]`: the listing on the Results page |
| `assets/normalize.js` | **The cleaning rules** applied to an uploaded Excel file |
| `assets/xlsx-reader.js` | Reads .xlsx in the browser |
| `assets/admin.js`, `admin.css` | The grid editor |
| `assets/list.js` | Filters and switching on the Result Tables list |
| `assets/front.js`, `front.css` | Tabs, search, sticky heading row, site styling |
| `assets/download.js` | "Download Excel", built in the visitor's browser |
| `assets/import.js` | Tools > Import Result Tables |
| `assets/listing.js`, `listing.css` | Year filter and cards for the listing |
| `includes/updater.php` | Updates from GitHub releases |
| `.github/workflows/release.yml` | Makes a release when the version changes on `main` |
| `tools/` | Offline scripts, not part of the installed plugin (see below) |

## Common changes

- **New course:** add a line to `bppimt_results_courses()` in `includes/data.php` (short name, 3 digit course code
  from the roll number, full names as the university writes them). The order of that list is the tab order.
- **New heading typo from the university:** `HEADER_FIXES` in `assets/normalize.js`.
- **Colours:** the tables read the theme palette (`--accent-2`, `--purple`, `--accent-3` ...). Override the
  `--bppimt-*` variables on `.bppimt-results` to change only the tables.

## tools/

- `tools/split_results.py`: standalone cleaner for a university Excel file. A fallback if the upload ever misbehaves.
- `tools/convert-old-results/`: the scripts used in October 2026 to convert the 48 pasted results and 8 PDFs into
  the import file. They are excluded from GitHub's "Download ZIP" (see `.gitattributes`).

## Student data

**Never commit result files.** Excel files, the import `.json` bundle and PDFs contain student names, roll numbers
and grades. `.gitignore` blocks the usual file types; keep that data out of issues and pull requests as well.
