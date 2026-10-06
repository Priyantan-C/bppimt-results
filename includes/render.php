<?php
/**
 * Website display: one template for every result.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Should this request show the plugin tables for this post? */
function bppimt_results_should_show( $post ) {
	if ( ! $post || bppimt_results_post_type() !== $post->post_type ) {
		return false;
	}
	if ( ! bppimt_results_get( $post->ID ) ) {
		return false;
	}
	if ( 'new' === bppimt_results_mode( $post->ID ) ) {
		return true;
	}
	// Editors can preview the new tables before switching a result over.
	return isset( $_GET['bppimt_preview'] ) && current_user_can( 'edit_post', $post->ID ); // phpcs:ignore WordPress.Security.NonceVerification
}

function bppimt_results_assets() {
	wp_enqueue_style( 'bppimt-results', plugins_url( 'assets/front.css', BPPIMT_RESULTS_FILE ), array(), BPPIMT_RESULTS_VERSION );
	wp_enqueue_script( 'bppimt-results', plugins_url( 'assets/front.js', BPPIMT_RESULTS_FILE ), array(), BPPIMT_RESULTS_VERSION, true );
	if ( apply_filters( 'bppimt_results_allow_download', true ) ) {
		wp_enqueue_script( 'bppimt-results-download', plugins_url( 'assets/download.js', BPPIMT_RESULTS_FILE ), array(), BPPIMT_RESULTS_VERSION, true );
	}
}

add_action(
	'wp_enqueue_scripts',
	function () {
		if ( is_singular( bppimt_results_post_type() ) && bppimt_results_should_show( get_queried_object() ) ) {
			bppimt_results_assets();
		}
	}
);

/** Replace the post's own content with the uniform tables. Runs late so WordPress does not reformat the markup. */
add_filter(
	'the_content',
	function ( $content ) {
		if ( is_admin() || is_feed() || ! is_singular( bppimt_results_post_type() ) ) {
			return $content;
		}
		$post = get_post();
		if ( ! $post || (int) get_queried_object_id() !== (int) $post->ID || ! bppimt_results_should_show( $post ) ) {
			return $content;
		}
		return bppimt_results_render( $post->ID );
	},
	20
);

/** [bppimt_result] or [bppimt_result id="123"] for use on any other page. */
add_shortcode(
	'bppimt_result',
	function ( $atts ) {
		$atts = shortcode_atts( array( 'id' => 0 ), $atts );
		$id   = (int) $atts['id'] ? (int) $atts['id'] : get_the_ID();
		return $id ? bppimt_results_render( $id ) : '';
	}
);

/**
 * Build the HTML for one result.
 */
function bppimt_results_render( $post_id ) {
	$data = bppimt_results_get( $post_id );
	if ( ! $data ) {
		return '';
	}
	bppimt_results_assets();

	// Group tables by course, keeping the stored order.
	$courses = array();
	foreach ( $data['tables'] as $t ) {
		$courses[ $t['course'] ][] = $t;
	}
	$uid = 'bppimt-r' . (int) $post_id;
	$out = '<div class="bppimt-results" data-bppimt-results>';
	$out .= '<div class="bppimt-results__bar">';
	$out .= '<div class="bppimt-results__tabs" role="tablist" aria-label="Courses">';
	$i    = 0;
	foreach ( $courses as $course => $tables ) {
		$count = 0;
		foreach ( $tables as $t ) {
			$count += count( $t['rows'] );
		}
		$out .= sprintf(
			'<button type="button" class="bppimt-results__tab" role="tab" id="%1$s-tab-%2$d" aria-controls="%1$s-panel-%2$d" aria-selected="%3$s" data-tab="%2$d">%4$s <span class="bppimt-results__count">%5$d</span></button>',
			esc_attr( $uid ),
			$i,
			0 === $i ? 'true' : 'false',
			esc_html( $course ),
			$count
		);
		$i++;
	}
	$out .= '</div>';
	$out .= '<div class="bppimt-results__tools">';
	$out .= '<label class="bppimt-results__search"><span class="screen-reader-text">Search by roll number or name</span>';
	$out .= '<input type="search" placeholder="Search roll number or name" autocomplete="off" inputmode="search"></label>';
	if ( apply_filters( 'bppimt_results_allow_download', true ) ) {
		// The file is built in the visitor's browser from this page, so a download costs the server nothing.
		$out .= '<button type="button" class="bppimt-results__download" data-filename="' . esc_attr( sanitize_title( get_the_title( $post_id ) ) ) . '" title="Download all courses as one Excel file">Download Excel</button>';
	}
	$out .= '</div></div>';
	$out .= '<p class="bppimt-results__status" aria-live="polite" hidden></p>';

	$i = 0;
	foreach ( $courses as $course => $tables ) {
		$out .= sprintf( '<section class="bppimt-results__panel" role="tabpanel" id="%1$s-panel-%2$d" aria-labelledby="%1$s-tab-%2$d" data-panel="%2$d">', esc_attr( $uid ), $i );
		$out .= '<h3 class="bppimt-results__course">' . esc_html( $course ) . '</h3>';
		foreach ( $tables as $t ) {
			$out .= '<div class="bppimt-results__block" data-label="' . esc_attr( $t['label'] ) . '">';
			if ( count( $tables ) > 1 || $t['label'] !== $course ) {
				$out .= sprintf( '<h4 class="bppimt-results__label">%s <span>%d %s</span></h4>', esc_html( $t['label'] ), count( $t['rows'] ), 1 === count( $t['rows'] ) ? 'student' : 'students' );
			}
			$out .= '<div class="bppimt-results__scroll" tabindex="0" role="region" aria-label="' . esc_attr( $t['label'] ) . ' result table">';
			$out .= '<table class="bppimt-results__table"><thead><tr>';
			foreach ( $t['headings'] as $h ) {
				$out .= '<th scope="col">' . esc_html( $h ) . '</th>';
			}
			$out .= '</tr></thead><tbody>';
			foreach ( $t['rows'] as $r ) {
				$out .= '<tr>';
				foreach ( $r as $k => $cell ) {
					$out .= ( 0 === $k ? '<th scope="row">' . esc_html( $cell ) . '</th>' : '<td>' . esc_html( $cell ) . '</td>' );
				}
				$out .= '</tr>';
			}
			$out .= '</tbody></table></div></div>';
		}
		$out .= '</section>';
		$i++;
	}
	$out .= '<p class="bppimt-results__empty" hidden>No student matches that search.</p>';
	$out .= '</div>';
	return $out;
}
