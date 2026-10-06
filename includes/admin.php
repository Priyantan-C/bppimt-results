<?php
/**
 * Editing screen, Excel upload, bulk import and the AJAX endpoints behind them.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** URL of the table editor for one result. */
function bppimt_results_editor_url( $post_id ) {
	return add_query_arg(
		array(
			'post_type' => bppimt_results_post_type(),
			'page'      => 'bppimt-result-tables',
			'post'      => (int) $post_id,
		),
		admin_url( 'edit.php' )
	);
}

function bppimt_results_status_text( $post_id ) {
	$data = bppimt_results_get( $post_id );
	if ( ! $data ) {
		return array( 'none', 'No result tables stored. The website shows the page content.' );
	}
	list( $tables, $rows ) = bppimt_results_counts( $data );
	$counts                = sprintf( '%d tables, %d students.', $tables, $rows );
	if ( 'new' === bppimt_results_mode( $post_id ) ) {
		return array( 'new', 'The website shows the result tables. ' . $counts );
	}
	return array( 'original', 'Tables are stored, but the website still shows the original page content. ' . $counts );
}

/* The grid needs the full width of the screen, so it lives on its own page. The box on the edit screen links to it. */
add_action(
	'add_meta_boxes',
	function () {
		add_meta_box( 'bppimt-results-box', 'Result tables', 'bppimt_results_meta_box', bppimt_results_post_type(), 'side', 'high' );
	}
);

function bppimt_results_meta_box( $post ) {
	if ( 'auto-draft' === $post->post_status ) {
		echo '<p>Give the result a title and save it as a draft first. Then come back here to upload the Excel file.</p>';
		return;
	}
	list( $state, $text ) = bppimt_results_status_text( $post->ID );
	echo '<p>' . esc_html( $text ) . '</p>';
	printf( '<p><a class="button button-primary" href="%s">%s</a></p>', esc_url( bppimt_results_editor_url( $post->ID ) ), 'none' === $state ? 'Upload result Excel' : 'Edit result tables' );
	if ( 'original' === $state ) {
		printf( '<p><a href="%s" target="_blank" rel="noopener">Preview the new tables</a></p>', esc_url( add_query_arg( 'bppimt_preview', '1', get_permalink( $post->ID ) ) ) );
	}
}

add_action(
	'admin_menu',
	function () {
		$pt = bppimt_results_post_type();
		add_submenu_page( 'edit.php?post_type=' . $pt, 'Result Tables', 'Result Tables', 'edit_posts', 'bppimt-result-tables', 'bppimt_results_editor_page' );
	}
);

function bppimt_results_editor_page() {
	$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0; // phpcs:ignore WordPress.Security.NonceVerification
	$post    = $post_id ? get_post( $post_id ) : null;
	echo '<div class="wrap bppimt-page">';
	if ( $post && bppimt_results_post_type() === $post->post_type ) {
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			echo '<h1>Result Tables</h1><p>You are not allowed to edit this result.</p></div>';
			return;
		}
		printf( '<h1 class="wp-heading-inline">%s</h1>', esc_html( get_the_title( $post ) ) );
		printf(
			'<p class="bppimt-page__links"><a href="%s">← All results</a> · <a href="%s">Edit the page (title, academic year)</a> · <a href="%s" target="_blank" rel="noopener">View on the website</a></p>',
			esc_url( menu_page_url( 'bppimt-result-tables', false ) ),
			esc_url( get_edit_post_link( $post_id ) ),
			esc_url( get_permalink( $post_id ) )
		);
		echo '<div id="bppimt-results-app" data-post="' . (int) $post_id . '"><p>Loading the result tables…</p></div>';
		echo '<noscript><p>The result table editor needs JavaScript.</p></noscript></div>';
		return;
	}

	// No result chosen: list them all.
	echo '<h1>Result Tables</h1><p>Choose a result to upload its Excel file or to correct its tables. To add a new result, first create its page under Results &gt; Add New, then open it here.</p>';
	$posts = get_posts(
		array(
			'post_type'      => bppimt_results_post_type(),
			'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future' ),
			'posts_per_page' => -1,
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);
	usort(
		$posts,
		function ( $a, $b ) {
			$ya = preg_match( '/(\d{4})-\d{2}/', $a->post_title, $m ) ? $m[1] : '0';
			$yb = preg_match( '/(\d{4})-\d{2}/', $b->post_title, $m ) ? $m[1] : '0';
			return $ya === $yb ? strnatcasecmp( $a->post_title, $b->post_title ) : strcmp( $yb, $ya );
		}
	);
	$rows  = array();
	$years = array();
	$sems  = array();
	foreach ( $posts as $p ) {
		if ( ! current_user_can( 'edit_post', $p->ID ) ) {
			continue;
		}
		$data = bppimt_results_get( $p->ID );
		$sem  = $data && ! empty( $data['semester'] ) ? (int) $data['semester'] : ( preg_match( '/^\s*(\d)(?:st|nd|rd|th)\b/i', $p->post_title, $m ) ? (int) $m[1] : 0 );
		$year = preg_match( '/(\d{4}-\d{2})/', $p->post_title, $m ) ? $m[1] : '';
		if ( $year ) {
			$years[ $year ] = true;
		}
		if ( $sem ) {
			$sems[ $sem ] = true;
		}
		$rows[] = array( $p, $sem, $year );
	}
	krsort( $years );
	ksort( $sems );
	$ord = array( 1 => '1st', 2 => '2nd', 3 => '3rd', 4 => '4th', 5 => '5th', 6 => '6th', 7 => '7th', 8 => '8th', 9 => '9th', 10 => '10th' );

	echo '<div class="bppimt-list" id="bppimt-list">';
	echo '<div class="bppimt-list__bar">';
	echo '<label>Semester <select data-filter="sem"><option value="">All</option>';
	foreach ( array_keys( $sems ) as $n ) {
		printf( '<option value="%d">%s Sem</option>', (int) $n, esc_html( isset( $ord[ $n ] ) ? $ord[ $n ] : $n ) );
	}
	echo '</select></label>';
	echo '<label>Academic year <select data-filter="year"><option value="">All</option>';
	foreach ( array_keys( $years ) as $y ) {
		printf( '<option value="%1$s">%1$s</option>', esc_attr( $y ) );
	}
	echo '</select></label>';
	echo '<label>Website shows <select data-filter="state"><option value="">Any</option><option value="original">Original content</option><option value="new">New tables</option><option value="none">No tables stored</option></select></label>';
	echo '<span class="bppimt-list__count" data-role="count"></span>';
	echo '</div>';
	echo '<div class="bppimt-list__bar bppimt-list__bar--act">';
	echo '<strong data-role="picked">0 selected</strong>';
	echo '<button type="button" class="button button-primary" data-bulk="new" disabled>Show new tables on selected</button>';
	echo '<button type="button" class="button" data-bulk="original" disabled>Show original content on selected</button>';
	echo '<span class="bppimt-list__msg" data-role="msg" aria-live="polite"></span>';
	echo '</div>';
	echo '<table class="widefat striped"><thead><tr><td class="check-column"><input type="checkbox" data-role="all" aria-label="Select all results shown"></td><th>Result</th><th>Status</th><th>Website shows</th><th></th></tr></thead><tbody>';
	foreach ( $rows as $row ) {
		list( $p, $sem, $year ) = $row;
		list( $state, $text )   = bppimt_results_status_text( $p->ID );
		printf(
			'<tr data-id="%d" data-sem="%d" data-year="%s" data-state="%s" data-preview="%s" data-view="%s">',
			(int) $p->ID,
			(int) $sem,
			esc_attr( $year ),
			esc_attr( $state ),
			esc_url( add_query_arg( 'bppimt_preview', '1', get_permalink( $p->ID ) ) ),
			esc_url( get_permalink( $p->ID ) )
		);
		printf( '<th class="check-column"><input type="checkbox" data-role="pick" %s aria-label="Select %s"></th>', 'none' === $state ? 'disabled' : '', esc_attr( get_the_title( $p ) ) );
		printf( '<td><strong>%s</strong>%s</td>', esc_html( get_the_title( $p ) ), 'publish' === $p->post_status ? '' : ' <em>(' . esc_html( $p->post_status ) . ')</em>' );
		printf( '<td data-role="status" class="bppimt-state-%s">%s</td>', esc_attr( $state ), esc_html( $text ) );
		echo '<td data-role="switch"></td>';
		printf( '<td class="bppimt-list__links"><a class="button button-small" href="%s">%s</a> <span data-role="look"></span></td></tr>', esc_url( bppimt_results_editor_url( $p->ID ) ), 'none' === $state ? 'Upload Excel' : 'Edit tables' );
	}
	echo '</tbody></table></div></div>';
}

/* "Result tables" link under each result in the list. */
add_filter(
	'post_row_actions',
	function ( $actions, $post ) {
		if ( bppimt_results_post_type() === $post->post_type && current_user_can( 'edit_post', $post->ID ) ) {
			$actions['bppimt_tables'] = sprintf( '<a href="%s">Result tables</a>', esc_url( bppimt_results_editor_url( $post->ID ) ) );
		}
		return $actions;
	},
	10,
	2
);

/* "Edit result tables" in the toolbar when viewing a result on the website. */
add_action(
	'admin_bar_menu',
	function ( $bar ) {
		if ( is_admin() || ! is_singular( bppimt_results_post_type() ) ) {
			return;
		}
		$id = get_queried_object_id();
		if ( $id && current_user_can( 'edit_post', $id ) ) {
			$bar->add_node(
				array(
					'id'    => 'bppimt-result-tables',
					'title' => 'Edit result tables',
					'href'  => bppimt_results_editor_url( $id ),
				)
			);
		}
	},
	81
);

function bppimt_results_admin_config( $post_id = 0 ) {
	return array(
		'ajaxUrl' => admin_url( 'admin-ajax.php' ),
		'nonce'   => wp_create_nonce( 'bppimt_results' ),
		'postId'  => (int) $post_id,
		'title'   => $post_id ? get_the_title( $post_id ) : '',
		'view'    => $post_id ? get_permalink( $post_id ) : '',
		'courses' => array_values( bppimt_results_courses() ),
	);
}

add_action(
	'admin_enqueue_scripts',
	function ( $hook ) {
		$base   = plugins_url( 'assets/', BPPIMT_RESULTS_FILE );
		$v      = BPPIMT_RESULTS_VERSION;
		$page   = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		if ( 'bppimt-result-tables' === $page ) {
			$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0; // phpcs:ignore WordPress.Security.NonceVerification
			wp_enqueue_style( 'bppimt-results-admin', $base . 'admin.css', array(), $v );
			if ( ! $post_id ) {
				wp_enqueue_script( 'bppimt-results-list', $base . 'list.js', array(), $v, true );
				wp_localize_script( 'bppimt-results-list', 'BPPIMTResultsConfig', bppimt_results_admin_config() );
			}
			if ( $post_id && current_user_can( 'edit_post', $post_id ) ) {
				wp_enqueue_script( 'bppimt-results-xlsx', $base . 'xlsx-reader.js', array(), $v, true );
				wp_enqueue_script( 'bppimt-results-normalize', $base . 'normalize.js', array(), $v, true );
				wp_enqueue_script( 'bppimt-results-admin', $base . 'admin.js', array( 'bppimt-results-xlsx', 'bppimt-results-normalize' ), $v, true );
				wp_localize_script( 'bppimt-results-admin', 'BPPIMTResultsConfig', bppimt_results_admin_config( $post_id ) );
			}
		}
		if ( 'tools_page_bppimt-results-import' === $hook ) {
			wp_enqueue_style( 'bppimt-results-admin', $base . 'admin.css', array(), $v );
			wp_enqueue_script( 'bppimt-results-import', $base . 'import.js', array(), $v, true );
			wp_localize_script( 'bppimt-results-import', 'BPPIMTResultsConfig', bppimt_results_admin_config() );
		}
	}
);

/* ------------------------------------------------------------------ AJAX */

/** Common checks. Returns the post id or sends an error. */
function bppimt_results_ajax_post() {
	check_ajax_referer( 'bppimt_results', 'nonce' );
	$post_id = isset( $_POST['post_id'] ) ? (int) $_POST['post_id'] : 0;
	$post    = $post_id ? get_post( $post_id ) : null;
	if ( ! $post || bppimt_results_post_type() !== $post->post_type ) {
		wp_send_json_error( array( 'message' => 'That result could not be found.' ), 404 );
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		wp_send_json_error( array( 'message' => 'You are not allowed to edit this result.' ), 403 );
	}
	return $post_id;
}

function bppimt_results_state( $post_id ) {
	$info = get_post_meta( $post_id, BPPIMT_RESULTS_META . '_info', true );
	$user = ! empty( $info['user'] ) ? get_userdata( $info['user'] ) : null;
	return array(
		'data'    => bppimt_results_get( $post_id ),
		'mode'    => bppimt_results_mode( $post_id ),
		'history' => bppimt_results_history( $post_id ),
		'saved'   => ! empty( $info['time'] ) ? sprintf( 'Last saved %s%s', wp_date( 'j M Y, g:i a', (int) $info['time'] ), $user ? ' by ' . $user->display_name : '' ) : '',
	);
}

add_action(
	'wp_ajax_bppimt_results_load',
	function () {
		wp_send_json_success( bppimt_results_state( bppimt_results_ajax_post() ) );
	}
);

add_action(
	'wp_ajax_bppimt_results_save',
	function () {
		$post_id = bppimt_results_ajax_post();
		$raw     = isset( $_POST['data'] ) ? json_decode( wp_unslash( $_POST['data'] ), true ) : null; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- cleaned cell by cell in bppimt_results_sanitize().
		$data    = bppimt_results_sanitize( $raw );
		if ( is_wp_error( $data ) ) {
			wp_send_json_error( array( 'message' => $data->get_error_message() ), 400 );
		}
		$source = isset( $_POST['source'] ) ? sanitize_key( $_POST['source'] ) : 'edit';
		bppimt_results_save( $post_id, $data, $source );
		if ( isset( $_POST['mode'] ) && in_array( $_POST['mode'], array( 'new', 'original' ), true ) ) {
			update_post_meta( $post_id, BPPIMT_RESULTS_MODE, sanitize_key( $_POST['mode'] ) );
		}
		if ( ! get_post_meta( $post_id, BPPIMT_RESULTS_MODE, true ) ) {
			// A new result has nothing else to show, so its tables go live with the page. Older pages keep their content until switched.
			$has_content = '' !== trim( wp_strip_all_tags( get_post_field( 'post_content', $post_id ) ) );
			update_post_meta( $post_id, BPPIMT_RESULTS_MODE, $has_content ? 'original' : 'new' );
		}
		clean_post_cache( $post_id );
		wp_send_json_success( bppimt_results_state( $post_id ) );
	}
);

add_action(
	'wp_ajax_bppimt_results_mode',
	function () {
		$post_id = bppimt_results_ajax_post();
		$mode    = isset( $_POST['mode'] ) && 'new' === $_POST['mode'] ? 'new' : 'original';
		if ( 'new' === $mode && ! bppimt_results_get( $post_id ) ) {
			wp_send_json_error( array( 'message' => 'Save the tables first, then switch the website over to them.' ), 400 );
		}
		update_post_meta( $post_id, BPPIMT_RESULTS_MODE, $mode );
		clean_post_cache( $post_id );
		wp_send_json_success( bppimt_results_state( $post_id ) );
	}
);

add_action(
	'wp_ajax_bppimt_results_version',
	function () {
		$post_id = bppimt_results_ajax_post();
		$mid     = isset( $_POST['version'] ) ? (int) $_POST['version'] : 0;
		$meta    = $mid ? get_metadata_by_mid( 'post', $mid ) : null;
		if ( ! $meta || (int) $meta->post_id !== $post_id || BPPIMT_RESULTS_HISTORY !== $meta->meta_key ) {
			wp_send_json_error( array( 'message' => 'That earlier version is no longer available.' ), 404 );
		}
		$entry = json_decode( $meta->meta_value, true );
		$data  = is_array( $entry ) && ! empty( $entry['data'] ) ? json_decode( $entry['data'], true ) : null;
		if ( ! $data ) {
			wp_send_json_error( array( 'message' => 'That earlier version could not be read.' ), 500 );
		}
		wp_send_json_success( array( 'data' => $data ) );
	}
);

/** Switch the chosen results to the new tables or back to the original content. */
add_action(
	'wp_ajax_bppimt_results_mode_many',
	function () {
		check_ajax_referer( 'bppimt_results', 'nonce' );
		$mode = isset( $_POST['mode'] ) && 'new' === $_POST['mode'] ? 'new' : 'original';
		$ids  = isset( $_POST['ids'] ) ? array_filter( array_map( 'intval', explode( ',', sanitize_text_field( wp_unslash( $_POST['ids'] ) ) ) ) ) : array();
		$out  = array();
		foreach ( array_slice( $ids, 0, 500 ) as $id ) {
			$post = get_post( $id );
			if ( ! $post || bppimt_results_post_type() !== $post->post_type || ! current_user_can( 'edit_post', $id ) ) {
				continue;
			}
			if ( bppimt_results_get( $id ) ) {
				update_post_meta( $id, BPPIMT_RESULTS_MODE, $mode );
				clean_post_cache( $id );
				do_action( 'bppimt_results_changed', $id );
			}
			list( $state, $text ) = bppimt_results_status_text( $id );
			$out[ $id ]           = array(
				'state' => $state,
				'text'  => $text,
			);
		}
		wp_send_json_success( $out );
	}
);

/** Bulk import: find the posts for a list of slugs. */
add_action(
	'wp_ajax_bppimt_results_lookup',
	function () {
		check_ajax_referer( 'bppimt_results', 'nonce' );
		if ( ! current_user_can( 'edit_others_posts' ) ) {
			wp_send_json_error( array( 'message' => 'You are not allowed to import results.' ), 403 );
		}
		$items = isset( $_POST['items'] ) ? json_decode( wp_unslash( $_POST['items'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$out   = array();
		foreach ( (array) $items as $item ) {
			$slug = isset( $item['slug'] ) ? sanitize_title( $item['slug'] ) : '';
			$post = $slug ? get_page_by_path( $slug, OBJECT, bppimt_results_post_type() ) : null;
			if ( ! $post && ! empty( $item['title'] ) ) {
				$found = get_posts(
					array(
						'post_type'      => bppimt_results_post_type(),
						'title'          => sanitize_text_field( $item['title'] ),
						'post_status'    => 'any',
						'posts_per_page' => 2,
					)
				);
				$post  = 1 === count( $found ) ? $found[0] : null;
			}
			$out[ $slug ] = $post ? array(
				'id'      => $post->ID,
				'title'   => get_the_title( $post ),
				'status'  => $post->post_status,
				'hasData' => (bool) bppimt_results_get( $post->ID ),
				'mode'    => bppimt_results_mode( $post->ID ),
				'edit'    => get_edit_post_link( $post->ID, 'raw' ),
				'view'    => get_permalink( $post ),
			) : null;
		}
		wp_send_json_success( $out );
	}
);

/** Bulk switch: show the new tables, or the original content, on every result that has tables. */
add_action(
	'wp_ajax_bppimt_results_mode_all',
	function () {
		check_ajax_referer( 'bppimt_results', 'nonce' );
		if ( ! current_user_can( 'edit_others_posts' ) ) {
			wp_send_json_error( array( 'message' => 'You are not allowed to change every result.' ), 403 );
		}
		$mode = isset( $_POST['mode'] ) && 'new' === $_POST['mode'] ? 'new' : 'original';
		$ids  = get_posts(
			array(
				'post_type'      => bppimt_results_post_type(),
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'meta_key'       => BPPIMT_RESULTS_META, // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_compare'   => 'EXISTS',
			)
		);
		foreach ( $ids as $id ) {
			update_post_meta( $id, BPPIMT_RESULTS_MODE, $mode );
			clean_post_cache( $id );
		}
		wp_send_json_success( array( 'changed' => count( $ids ), 'mode' => $mode ) );
	}
);

/* ----------------------------------------------------------- Tools page */

add_action(
	'admin_menu',
	function () {
		add_management_page( 'Import Result Tables', 'Import Result Tables', 'edit_others_posts', 'bppimt-results-import', 'bppimt_results_import_page' );
	}
);

function bppimt_results_import_page() {
	?>
	<div class="wrap bppimt-import">
		<h1>Import Result Tables</h1>
		<p>Load many results at once from an import file (a <code>.json</code> bundle). Each result is matched to its existing page, and the tables are stored with that page. Nothing on the website changes until a result is switched to the new tables.</p>
		<div class="bppimt-import__card">
			<h2>1. Choose the import file</h2>
			<input type="file" id="bppimt-import-file" accept=".json,application/json">
			<div id="bppimt-import-summary"></div>
		</div>
		<div class="bppimt-import__card" id="bppimt-import-options" hidden>
			<h2>2. Import</h2>
			<p><label><input type="checkbox" id="bppimt-import-overwrite"> Replace tables on results that already have them</label></p>
			<p><strong>After importing, the website should show:</strong><br>
				<label><input type="radio" name="bppimt-import-mode" value="original" checked> The original content, for now (safest: check a few results with the preview link first)</label><br>
				<label><input type="radio" name="bppimt-import-mode" value="new"> The new tables straight away</label></p>
			<p><button type="button" class="button button-primary" id="bppimt-import-run">Import</button> <span id="bppimt-import-progress"></span></p>
		</div>
		<div id="bppimt-import-list"></div>
		<div class="bppimt-import__card">
			<h2>Switch every result at once</h2>
			<p>Applies to every result that has tables stored. You can switch back at any time; the original content is never deleted.</p>
			<p><button type="button" class="button" data-bppimt-mode-all="new">Show the new tables on all results</button>
			<button type="button" class="button" data-bppimt-mode-all="original">Show the original content on all results</button>
			<span id="bppimt-mode-all-status"></span></p>
		</div>
	</div>
	<?php
}

/* -------------------------------------------------- Column in the list */

add_action(
	'init',
	function () {
		$pt = bppimt_results_post_type();
		add_filter( "manage_{$pt}_posts_columns", 'bppimt_results_column' );
		add_action( "manage_{$pt}_posts_custom_column", 'bppimt_results_column_value', 10, 2 );
	},
	20
);

function bppimt_results_column( $columns ) {
	$columns['bppimt_results'] = 'Result tables';
	return $columns;
}

function bppimt_results_column_value( $column, $post_id ) {
	if ( 'bppimt_results' !== $column ) {
		return;
	}
	list( $state, $text ) = bppimt_results_status_text( $post_id );
	$new                  = 'new' === $state;
	printf( '<span style="color:%s">%s</span>', $new ? '#007017' : '#996800', esc_html( $text ) );
	if ( 'none' === $state ) {
		return;
	}
	if ( ! $new ) {
		printf( '<br><a href="%s" target="_blank" rel="noopener">Preview new tables</a>', esc_url( add_query_arg( 'bppimt_preview', '1', get_permalink( $post_id ) ) ) );
	}
}
