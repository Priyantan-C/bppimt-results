<?php
/**
 * Results listing for the main Results page: [bppimt_results_list].
 * Lists every published result (old or new) by academic year, newest first, semesters in order.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Academic year taxonomy used by the result pages. */
function bppimt_results_year_taxonomy() {
	return apply_filters( 'bppimt_results_year_taxonomy', 'academic-year' );
}

/**
 * All published results as [ year => [ [id, title, url, sem, review], ... ] ], newest year first,
 * semesters in order. Cached, and refreshed whenever a result is saved, retitled or changes year.
 */
function bppimt_results_listing_items() {
	$cached = get_transient( 'bppimt_results_listing' );
	if ( is_array( $cached ) ) {
		return $cached;
	}
	$tax   = bppimt_results_year_taxonomy();
	$posts = get_posts(
		array(
			'post_type'        => bppimt_results_post_type(),
			'post_status'      => 'publish',
			'posts_per_page'   => -1,
			'orderby'          => 'title',
			'order'            => 'ASC',
			'suppress_filters' => false,
		)
	);
	$years = array();
	foreach ( $posts as $p ) {
		$year  = '';
		$terms = taxonomy_exists( $tax ) ? get_the_terms( $p->ID, $tax ) : false;
		if ( $terms && ! is_wp_error( $terms ) ) {
			$year = $terms[0]->name;
		}
		if ( ! $year && preg_match( '/(\d{4}-\d{2})/', $p->post_title, $m ) ) {
			$year = $m[1];
		}
		$year = $year ? $year : 'Other';
		// The semester comes from the title; the stored tables are only opened when the title does not say.
		if ( preg_match( '/^\s*([1-9]|10)(?:st|nd|rd|th)\s+sem/i', $p->post_title, $m ) ) {
			$sem = (int) $m[1];
		} else {
			$data = bppimt_results_get( $p->ID );
			$sem  = $data && ! empty( $data['semester'] ) ? (int) $data['semester'] : 99;
		}
		$years[ $year ][] = array(
			'id'     => $p->ID,
			'title'  => get_the_title( $p ),
			'url'    => get_permalink( $p ),
			'sem'    => $sem,
			'review' => 'new' === bppimt_results_mode( $p->ID ) && '' !== (string) get_post_meta( $p->ID, bppimt_results_key( 'review' ), true ),
		);
	}
	uksort(
		$years,
		function ( $a, $b ) {
			if ( 'Other' === $a || 'Other' === $b ) {
				return 'Other' === $a ? 1 : -1;
			}
			return strnatcmp( $b, $a ); // newest academic year first
		}
	);
	foreach ( $years as &$list ) {
		usort(
			$list,
			function ( $a, $b ) {
				return $a['sem'] === $b['sem'] ? strnatcasecmp( $a['title'], $b['title'] ) : $a['sem'] - $b['sem'];
			}
		);
	}
	unset( $list );
	set_transient( 'bppimt_results_listing', $years, 12 * HOUR_IN_SECONDS );
	return $years;
}

function bppimt_results_listing_flush() {
	delete_transient( 'bppimt_results_listing' );
}
add_action(
	'init',
	function () {
		add_action( 'save_post_' . bppimt_results_post_type(), 'bppimt_results_listing_flush' );
		add_action( 'set_object_terms', 'bppimt_results_listing_flush' );
		add_action( 'deleted_post', 'bppimt_results_listing_flush' );
		add_action( 'trashed_post', 'bppimt_results_listing_flush' );
		add_action( 'bppimt_results_changed', 'bppimt_results_listing_flush' );
		add_action( 'edited_term', 'bppimt_results_listing_flush' );
	}
);

/**
 * [bppimt_results_list show="latest|all" label="Academic Years"]
 * show="latest" (default) opens on the newest academic year; visitors can pick another year or "Show all".
 * A link like /students/results/?result_year=2024-25 opens that year directly.
 */
add_shortcode(
	'bppimt_results_list',
	function ( $atts ) {
		$atts  = shortcode_atts(
			array(
				'show'  => 'latest',
				'label' => 'Academic Years',
			),
			$atts
		);
		$years = bppimt_results_listing_items();
		if ( ! $years ) {
			return '<p>No results have been published yet.</p>';
		}
		wp_enqueue_style( 'bppimt-results-listing', plugins_url( 'assets/listing.css', BPPIMT_RESULTS_FILE ), array(), BPPIMT_RESULTS_VERSION );
		wp_enqueue_script( 'bppimt-results-listing', plugins_url( 'assets/listing.js', BPPIMT_RESULTS_FILE ), array(), BPPIMT_RESULTS_VERSION, true );

		$names = array_keys( $years );
		$asked = isset( $_GET['result_year'] ) ? sanitize_text_field( wp_unslash( $_GET['result_year'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- a public filter, nothing is changed.
		if ( 'all' === $asked || ( ! $asked && 'all' === $atts['show'] ) ) {
			$current = 'all';
		} elseif ( $asked && isset( $years[ $asked ] ) ) {
			$current = $asked;
		} else {
			$current = $names[0];
		}

		$out  = '<div class="bppimt-list" data-bppimt-list>';
		$out .= '<nav class="bppimt-list__bar" aria-label="' . esc_attr( $atts['label'] ) . '">';
		$out .= '<span class="bppimt-list__label">' . esc_html( $atts['label'] ) . '</span>';
		$out .= '<ul class="bppimt-list__years">';
		foreach ( $names as $y ) {
			$out .= sprintf(
				'<li><a class="bppimt-list__year" href="%s" data-year="%s"%s>%s</a></li>',
				esc_url( add_query_arg( 'result_year', $y ) ),
				esc_attr( $y ),
				$current === $y ? ' aria-current="true"' : '',
				esc_html( $y )
			);
		}
		$out .= sprintf(
			'<li><a class="bppimt-list__year" href="%s" data-year="all"%s>Show all</a></li>',
			esc_url( add_query_arg( 'result_year', 'all' ) ),
			'all' === $current ? ' aria-current="true"' : ''
		);
		$out .= '</ul></nav>';

		foreach ( $years as $y => $items ) {
			$out .= sprintf( '<section class="bppimt-list__group" data-group="%s"%s>', esc_attr( $y ), ( 'all' === $current || $current === $y ) ? '' : ' hidden' );
			$out .= '<h2 class="bppimt-list__heading">' . esc_html( 'Other' === $y ? 'Other results' : 'Academic Year ' . $y ) . '</h2>';
			$out .= '<ul class="bppimt-list__grid">';
			foreach ( $items as $it ) {
				$ord   = array( 1 => 'st', 2 => 'nd', 3 => 'rd' );
				$sem   = $it['sem'] < 99 ? $it['sem'] : 0;
				$title = trim( preg_replace( '/\s*\d{4}-\d{2}\s*$/', '', $it['title'] ) ); // the year is shown on its own line
				$out  .= sprintf(
					'<li class="bppimt-list__item"><a class="bppimt-list__card" href="%1$s">%2$s<span class="bppimt-list__body"><h3 class="bppimt-list__title">%3$s</h3><span class="bppimt-list__meta">%4$s</span>%5$s</span><svg class="bppimt-list__arrow" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>',
					esc_url( $it['url'] ),
					$sem ? sprintf( '<span class="bppimt-list__sem" aria-hidden="true"><span class="bppimt-list__num">%d<sup>%s</sup></span><span class="bppimt-list__semword">Sem</span></span>', $sem, isset( $ord[ $sem ] ) ? $ord[ $sem ] : 'th' ) : '',
					esc_html( '' !== $title ? $title : $it['title'] ),
					esc_html( 'Other' === $y ? '' : 'Academic Year ' . $y ),
					$it['review'] ? '<span class="bppimt-list__tag">Review result available</span>' : ''
				);
			}
			$out .= '</ul></section>';
		}
		return $out . '</div>';
	}
);
