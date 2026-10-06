=== BPPIMT Results ===
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 1.0.5

Stores semester results as tables, shows every result in one design, and imports the university Excel file directly.

== Everyday use ==

New result:
1. Results > Add New. Enter the title (for example "2nd Semester Results 2026-27"), pick the Academic Year, save.
2. In the "Result tables" box click "Upload result Excel" and choose the file exactly as the university sends it.
3. Check the tables, read any warnings shown above them, click "Save tables".

Correcting a result:
Results > Result Tables > Edit tables. Click a cell, type, press Enter. Click "Save tables".
The last 5 saved versions are kept under "Earlier versions".

== What the upload does ==

* Removes the College Name and Course Code columns and the empty gap columns.
* Shortens course names (B.Tech CSE ...) and the semester (4th Sem).
* Upper-cases headings and fixes COURSENAME / SEMETER RESULT.
* One table per course, courses always in the same order. Students with different electives are merged
  into one table; students on a mostly different subject list get a second table.
* Students stay in the order of the file.

== Download for visitors ==

Every result page has a "Download Excel" button. The file (one sheet per course) is built in the visitor's
own browser from the page that is already loaded, so downloads make no extra requests to the server.
To remove the button: add_filter( 'bppimt_results_allow_download', '__return_false' );

== Old results ==

Tools > Import Result Tables loads many results from an import file.
Every result has a "Website shows" switch: the original page content, or the new tables.
The original content is never deleted, so a result can be switched back at any time.

== Notes for the developer ==

* Post type: filter `bppimt_results_post_type` (default `result`).
* Courses and their order: filter `bppimt_results_courses`, or edit bppimt_results_courses() in includes/data.php.
* If the theme template does not pass the content through `the_content`, place the shortcode [bppimt_result] in the template.
* Colours: the tables read the theme's palette variables (--accent-2, --purple, --accent-3, --base-2 ...). To change one only for the tables, override the --bppimt-* variables on `.bppimt-results`.
* Data is stored in post meta `_bppimt_result_data` (JSON). Deactivating the plugin brings back the original content.
