<?php
/**
 * Updates from GitHub releases.
 *
 * WordPress asks every 12 hours whether plugins have updates. This adds the latest GitHub release of this
 * plugin to that answer, so a new release shows up under Plugins and Dashboard > Updates like any other update,
 * with the usual "update now" button (and automatic updates, if switched on for this plugin).
 *
 * Private repository: add a read-only GitHub token to wp-config.php:
 *     define( 'BPPIMT_RESULTS_GITHUB_TOKEN', 'github_pat_...' );
 * (a fine-grained token with access to this one repository and the permission "Contents: Read-only").
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BPPIMT_RESULTS_REPO', 'Priyantan-C/bppimt-results' );

function bppimt_results_gh_token() {
	return defined( 'BPPIMT_RESULTS_GITHUB_TOKEN' ) ? (string) BPPIMT_RESULTS_GITHUB_TOKEN : '';
}

/** Latest release from GitHub, cached for 12 hours (1 hour after a failed check). */
function bppimt_results_gh_release( $force = false ) {
	$cached = get_site_transient( 'bppimt_results_gh_release' );
	if ( ! $force && false !== $cached ) {
		return $cached ? $cached : null;
	}
	$args = array(
		'timeout' => 10,
		'headers' => array(
			'Accept'     => 'application/vnd.github+json',
			'User-Agent' => 'bppimt-results-updater',
		),
	);
	if ( bppimt_results_gh_token() ) {
		$args['headers']['Authorization'] = 'Bearer ' . bppimt_results_gh_token();
	}
	$res  = wp_remote_get( 'https://api.github.com/repos/' . BPPIMT_RESULTS_REPO . '/releases/latest', $args );
	$body = is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( ! is_array( $body ) || empty( $body['tag_name'] ) ) {
		set_site_transient( 'bppimt_results_gh_release', '', HOUR_IN_SECONDS );
		return null;
	}
	$package = '';
	foreach ( isset( $body['assets'] ) ? (array) $body['assets'] : array() as $asset ) {
		if ( 'bppimt-results.zip' === $asset['name'] ) {
			// Private repositories need the API address of the file; public ones can use the plain download link.
			$package = bppimt_results_gh_token() ? $asset['url'] : $asset['browser_download_url'];
		}
	}
	$release = array(
		'version'   => ltrim( $body['tag_name'], 'vV' ),
		'package'   => $package ? $package : $body['zipball_url'],
		'url'       => $body['html_url'],
		'notes'     => isset( $body['body'] ) ? (string) $body['body'] : '',
		'published' => isset( $body['published_at'] ) ? $body['published_at'] : '',
	);
	set_site_transient( 'bppimt_results_gh_release', $release, 12 * HOUR_IN_SECONDS );
	return $release;
}

/** Tell WordPress about a newer release. */
add_filter(
	'pre_set_site_transient_update_plugins',
	function ( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}
		$file    = plugin_basename( BPPIMT_RESULTS_FILE );
		$release = bppimt_results_gh_release();
		$item    = (object) array(
			'id'          => 'github.com/' . BPPIMT_RESULTS_REPO,
			'slug'        => 'bppimt-results',
			'plugin'      => $file,
			'new_version' => $release ? $release['version'] : BPPIMT_RESULTS_VERSION,
			'url'         => 'https://github.com/' . BPPIMT_RESULTS_REPO,
			'package'     => $release ? $release['package'] : '',
		);
		if ( $release && version_compare( $release['version'], BPPIMT_RESULTS_VERSION, '>' ) ) {
			$transient->response[ $file ] = $item;
		} else {
			unset( $transient->response[ $file ] );
			$transient->no_update[ $file ] = $item; // lets the automatic-updates toggle appear for this plugin
		}
		return $transient;
	}
);

/** "View version details" in the Plugins screen shows the release notes. */
add_filter(
	'plugins_api',
	function ( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || empty( $args->slug ) || 'bppimt-results' !== $args->slug ) {
			return $result;
		}
		$release = bppimt_results_gh_release();
		$notes   = $release ? $release['notes'] : '';
		$html    = '';
		foreach ( preg_split( "/\r?\n/", esc_html( $notes ) ) as $line ) {
			$line = preg_replace( '/\*\*(.+?)\*\*/', '<strong>$1</strong>', $line );
			$line = preg_replace( '/`([^`]+)`/', '<code>$1</code>', $line );
			if ( preg_match( '/^#+\s*(.*)$/', $line, $m ) ) {
				$html .= '<h4>' . $m[1] . '</h4>';
			} elseif ( preg_match( '/^\s*[-*]\s+(.*)$/', $line, $m ) ) {
				$html .= '<li>' . $m[1] . '</li>';
			} elseif ( '' !== trim( $line ) ) {
				$html .= '<p>' . $line . '</p>';
			}
		}
		return (object) array(
			'name'          => 'BPPIMT Results',
			'slug'          => 'bppimt-results',
			'version'       => $release ? $release['version'] : BPPIMT_RESULTS_VERSION,
			'author'        => 'SynerByte Tech LLP',
			'homepage'      => 'https://github.com/' . BPPIMT_RESULTS_REPO,
			'requires'      => '6.0',
			'requires_php'  => '7.4',
			'last_updated'  => $release ? $release['published'] : '',
			'download_link' => $release ? $release['package'] : '',
			'sections'      => array(
				'changelog' => $html ? $html : '<p>See the release notes on GitHub.</p>',
			),
		);
	},
	10,
	3
);

/** Send the token with GitHub downloads, and ask for the file itself (not its description) for release files. */
add_filter(
	'http_request_args',
	function ( $args, $url ) {
		if ( ! bppimt_results_gh_token() || 0 !== strpos( $url, 'https://api.github.com/repos/' . BPPIMT_RESULTS_REPO . '/' ) ) {
			return $args;
		}
		$args['headers']                  = isset( $args['headers'] ) ? (array) $args['headers'] : array();
		$args['headers']['Authorization'] = 'Bearer ' . bppimt_results_gh_token();
		$args['headers']['User-Agent']    = 'bppimt-results-updater';
		if ( false !== strpos( $url, '/releases/assets/' ) ) {
			$args['headers']['Accept'] = 'application/octet-stream';
		}
		return $args;
	},
	10,
	2
);

/** GitHub's own zips unpack into "owner-repo-hash"; put the update back into the plugin's folder. */
add_filter(
	'upgrader_source_selection',
	function ( $source, $remote_source, $upgrader, $hook_extra = array() ) {
		global $wp_filesystem;
		if ( empty( $hook_extra['plugin'] ) || plugin_basename( BPPIMT_RESULTS_FILE ) !== $hook_extra['plugin'] ) {
			return $source;
		}
		$want = trailingslashit( $remote_source ) . 'bppimt-results/';
		if ( trailingslashit( $source ) === $want ) {
			return $source;
		}
		if ( $wp_filesystem && $wp_filesystem->move( untrailingslashit( $source ), untrailingslashit( $want ) ) ) {
			return $want;
		}
		return new WP_Error( 'bppimt_results_update', 'The update could not be unpacked into the bppimt-results folder.' );
	},
	10,
	4
);

/** "Check for updates" link on the Plugins screen, for when you do not want to wait for WordPress's 12 hour check. */
add_filter(
	'plugin_action_links_' . plugin_basename( BPPIMT_RESULTS_FILE ),
	function ( $links ) {
		if ( current_user_can( 'update_plugins' ) ) {
			$links[] = '<a href="' . esc_url( wp_nonce_url( admin_url( 'plugins.php?bppimt_results_check=1' ), 'bppimt_results_check' ) ) . '">Check for updates</a>';
		}
		return $links;
	}
);

add_action(
	'admin_init',
	function () {
		if ( empty( $_GET['bppimt_results_check'] ) || ! current_user_can( 'update_plugins' ) ) {
			return;
		}
		check_admin_referer( 'bppimt_results_check' );
		delete_site_transient( 'bppimt_results_gh_release' );
		$release = bppimt_results_gh_release( true );
		wp_update_plugins(); // recheck now, including this plugin
		$msg = $release ? ( version_compare( $release['version'], BPPIMT_RESULTS_VERSION, '>' ) ? 'new' : 'none' ) : 'fail';
		wp_safe_redirect( admin_url( 'plugins.php?bppimt_results_checked=' . $msg ) );
		exit;
	}
);

add_action(
	'admin_notices',
	function () {
		if ( empty( $_GET['bppimt_results_checked'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return;
		}
		$state = sanitize_key( $_GET['bppimt_results_checked'] ); // phpcs:ignore WordPress.Security.NonceVerification
		$text  = array(
			'new'  => array( 'success', 'BPPIMT Results: a new version is available. Use "update now" below.' ),
			'none' => array( 'info', 'BPPIMT Results is up to date.' ),
			'fail' => array( 'error', 'BPPIMT Results could not reach GitHub. If the repository is private, check BPPIMT_RESULTS_GITHUB_TOKEN in wp-config.php.' ),
		);
		if ( isset( $text[ $state ] ) ) {
			printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr( $text[ $state ][0] ), esc_html( $text[ $state ][1] ) );
		}
	}
);
