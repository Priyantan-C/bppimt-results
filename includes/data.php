<?php
/**
 * Storage and shared settings.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Post type that holds the results. Change with the `bppimt_results_post_type` filter. */
function bppimt_results_post_type() {
	return apply_filters( 'bppimt_results_post_type', 'result' );
}

/**
 * Courses the importer knows. `code` is digits 4 to 6 of the university roll number.
 * Add a course here (or through the `bppimt_results_courses` filter) when the college starts a new one.
 */
function bppimt_results_courses() {
	return apply_filters(
		'bppimt_results_courses',
		array(
			array( 'short' => 'B.Tech CSE', 'code' => '001', 'names' => array( 'Bachelor of Technology in Computer Science & Engineering', 'CSE' ) ),
			array( 'short' => 'B.Tech IT', 'code' => '002', 'names' => array( 'Bachelor of Technology in Information Technology', 'IT' ) ),
			array( 'short' => 'B.Tech ECE', 'code' => '003', 'names' => array( 'Bachelor of Technology in Electronics & Communication Engineering', 'ECE' ) ),
			array( 'short' => 'B.Tech EE', 'code' => '016', 'names' => array( 'Bachelor of Technology in Electrical Engineering', 'EE' ) ),
			array( 'short' => 'MCA', 'code' => '710', 'names' => array( 'Master of Computer Application', 'Master of Computer Applications' ) ),
			array( 'short' => 'M.Tech DS', 'code' => '617', 'names' => array( 'Master of Technology in Data Science', 'MDS' ) ),
			array( 'short' => 'M.Tech IoT', 'code' => '628', 'names' => array( 'Master of Technology in Internet of Things' ) ),
		)
	);
}

/** Clean one cell or label: plain text, single spaces, sensible length. */
function bppimt_results_clean_text( $value, $max = 200 ) {
	if ( is_array( $value ) || is_object( $value ) ) {
		return '';
	}
	$value = wp_strip_all_tags( (string) $value, true );
	$value = trim( preg_replace( '/\s+/u', ' ', $value ) );
	if ( function_exists( 'mb_substr' ) ) {
		return mb_substr( $value, 0, $max );
	}
	return substr( $value, 0, $max );
}

/**
 * Validate and clean result data coming from the browser.
 *
 * @param mixed $raw Decoded JSON.
 * @return array|WP_Error
 */
function bppimt_results_sanitize( $raw ) {
	if ( ! is_array( $raw ) || empty( $raw['tables'] ) || ! is_array( $raw['tables'] ) ) {
		return new WP_Error( 'bppimt_empty', 'There are no tables to save.' );
	}
	if ( count( $raw['tables'] ) > 60 ) {
		return new WP_Error( 'bppimt_big', 'Too many tables in one result (the limit is 60).' );
	}
	$tables = array();
	foreach ( $raw['tables'] as $t ) {
		if ( ! is_array( $t ) || empty( $t['headings'] ) || ! is_array( $t['headings'] ) ) {
			continue;
		}
		$headings = array();
		foreach ( array_slice( array_values( $t['headings'] ), 0, 80 ) as $h ) {
			$headings[] = bppimt_results_clean_text( $h, 60 );
		}
		$width = count( $headings );
		$rows  = array();
		$list  = isset( $t['rows'] ) && is_array( $t['rows'] ) ? $t['rows'] : array();
		foreach ( array_slice( $list, 0, 3000 ) as $r ) {
			if ( ! is_array( $r ) ) {
				continue;
			}
			$row   = array();
			$r     = array_values( $r );
			$blank = true;
			for ( $i = 0; $i < $width; $i++ ) {
				$cell = isset( $r[ $i ] ) ? bppimt_results_clean_text( $r[ $i ] ) : '';
				if ( '' !== $cell ) {
					$blank = false;
				}
				$row[] = $cell;
			}
			if ( ! $blank ) {
				$rows[] = $row;
			}
		}
		$course = bppimt_results_clean_text( isset( $t['course'] ) ? $t['course'] : '', 60 );
		$label  = bppimt_results_clean_text( isset( $t['label'] ) ? $t['label'] : '', 80 );
		if ( '' === $course ) {
			$course = '' !== $label ? $label : 'Result';
		}
		$tables[] = array(
			'course'   => $course,
			'label'    => '' !== $label ? $label : $course,
			'headings' => $headings,
			'rows'     => $rows,
		);
	}
	if ( ! $tables ) {
		return new WP_Error( 'bppimt_empty', 'There are no tables to save.' );
	}
	return array(
		'version'  => 1,
		'semester' => isset( $raw['semester'] ) ? max( 0, min( 12, (int) $raw['semester'] ) ) : 0,
		'tables'   => $tables,
	);
}

/** Stored result data for a post, or null. */
function bppimt_results_get( $post_id ) {
	$json = get_post_meta( $post_id, BPPIMT_RESULTS_META, true );
	if ( ! $json ) {
		return null;
	}
	$data = json_decode( $json, true );
	return ( is_array( $data ) && ! empty( $data['tables'] ) ) ? $data : null;
}

/** 'new' (plugin tables) or 'original' (the post's own content). */
function bppimt_results_mode( $post_id ) {
	return 'new' === get_post_meta( $post_id, BPPIMT_RESULTS_MODE, true ) ? 'new' : 'original';
}

function bppimt_results_counts( $data ) {
	$rows = 0;
	foreach ( $data['tables'] as $t ) {
		$rows += count( $t['rows'] );
	}
	return array( count( $data['tables'] ), $rows );
}

/**
 * Save result data, keeping the previous versions so an edit can be undone.
 *
 * @return bool True when something changed.
 */
function bppimt_results_save( $post_id, array $data, $source = 'edit' ) {
	$json = wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	$old  = get_post_meta( $post_id, BPPIMT_RESULTS_META, true );
	if ( $old === $json ) {
		return false;
	}
	if ( $old ) {
		$info  = get_post_meta( $post_id, BPPIMT_RESULTS_META . '_info', true );
		$entry = array(
			'time'   => isset( $info['time'] ) ? (int) $info['time'] : time(),
			'user'   => isset( $info['user'] ) ? (int) $info['user'] : 0,
			'source' => isset( $info['source'] ) ? $info['source'] : 'edit',
			'data'   => $old,
		);
		add_post_meta( $post_id, BPPIMT_RESULTS_HISTORY, wp_slash( wp_json_encode( $entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) );
		$ids = bppimt_results_history_ids( $post_id );
		while ( count( $ids ) > BPPIMT_RESULTS_KEEP ) {
			delete_metadata_by_mid( 'post', array_shift( $ids ) );
		}
	}
	update_post_meta( $post_id, BPPIMT_RESULTS_META, wp_slash( $json ) );
	update_post_meta(
		$post_id,
		BPPIMT_RESULTS_META . '_info',
		array(
			'time'   => time(),
			'user'   => get_current_user_id(),
			'source' => sanitize_key( $source ),
		)
	);
	return true;
}

/** Meta ids of saved earlier versions, oldest first. */
function bppimt_results_history_ids( $post_id ) {
	global $wpdb;
	return array_map(
		'intval',
		$wpdb->get_col( $wpdb->prepare( "SELECT meta_id FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s ORDER BY meta_id ASC", $post_id, BPPIMT_RESULTS_HISTORY ) )
	);
}

/** Earlier versions, newest first, without the heavy data. */
function bppimt_results_history( $post_id ) {
	$out = array();
	foreach ( array_reverse( bppimt_results_history_ids( $post_id ) ) as $mid ) {
		$meta  = get_metadata_by_mid( 'post', $mid );
		$entry = $meta ? json_decode( $meta->meta_value, true ) : null;
		if ( ! is_array( $entry ) || empty( $entry['data'] ) ) {
			continue;
		}
		$data = json_decode( $entry['data'], true );
		if ( ! is_array( $data ) || empty( $data['tables'] ) ) {
			continue;
		}
		list( $tables, $rows ) = bppimt_results_counts( $data );
		$user  = ! empty( $entry['user'] ) ? get_userdata( $entry['user'] ) : null;
		$out[] = array(
			'id'    => $mid,
			'label' => sprintf( '%s, %s (%d tables, %d rows)', wp_date( 'j M Y, g:i a', (int) $entry['time'] ), $user ? $user->display_name : 'import', $tables, $rows ),
		);
	}
	return $out;
}
