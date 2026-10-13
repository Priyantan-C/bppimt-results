# Changelog

## 1.2.0 (2026-10-13)
- Results listing: `[bppimt_results_list]` replaces the Greenshift query/filter on the Results page. Newest academic
  year first, semesters in order, opens on the latest year with an Academic Years filter and "Show all" (grouped by
  year). `?result_year=2024-25` opens a year directly. Lists every published result, old or new; drafts are left out.
  A "Review result available" tag appears on results that have a live review result.
- Cards: semester tile, title, academic year, arrow; shape taken from the site's existing cards.
- Colours now fall back through the WordPress colour presets (`--wp--preset--color--*`) as well as the theme's own
  palette variables, so the styling adapts to other sites.

## 1.1.0 (2026-10-13)
- Review results: each semester page can hold a review result next to the regular one. The editor has a
  Regular result / Review result switch with its own upload, grid, saved versions and a "Remove review result"
  button. The public page shows a Regular result / Review result switch only when a review result exists;
  a link ending in `#review` opens the review result directly. The regular result is never changed.
- Fix: "Download Excel" did nothing since 1.0.5 (it read the pinned copy of the heading row instead of the table).

## 1.0.5 (2026-10-06)
- Heading row is pinned by the browser (no script while scrolling), fixing the stutter.
- Turns off the page builder's own scroll box around the result on pages showing the new tables.

## 1.0.4 (2026-10-06)
- Tables expand to their full length; no inner vertical scrollbar.

## 1.0.3 (2026-10-06)
- Result Tables list: filters by semester, academic year and state; checkboxes; bulk and one-click switching.

## 1.0.2 (2026-10-06)
- Styling follows the BPPIMT site (theme palette, Inter and Noto Serif, flat filter-style course bar).
- "Download Excel" for visitors, built in the browser with no server load.

## 1.0.1 (2026-10-06)
- "Preview new tables" button on the Result Tables list.

## 1.0.0 (2026-10-06)
- First version: storage, uniform display, grid editor, Excel upload, bulk import, saved versions.
