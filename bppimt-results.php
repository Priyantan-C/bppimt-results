<?php
/**
 * Plugin Name:       MAKAUT Result Parser
 * Description:       Stores semester results as structured tables, shows every result in one uniform design, lets editors fix tables in a grid, and imports the university Excel file directly.
 * Version:           1.3.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            SynerByte Tech LLP
 * License:           GPL-2.0-or-later
 * Text Domain:       bppimt-results
 * Update URI:        https://github.com/Priyantan-C/bppimt-results
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BPPIMT_RESULTS_VERSION', '1.3.1' );
define( 'BPPIMT_RESULTS_FILE', __FILE__ );
define( 'BPPIMT_RESULTS_META', '_bppimt_result_data' );
define( 'BPPIMT_RESULTS_MODE', '_bppimt_result_display' );
define( 'BPPIMT_RESULTS_HISTORY', '_bppimt_result_history' );
define( 'BPPIMT_RESULTS_KEEP', 5 );

require_once __DIR__ . '/includes/data.php';
require_once __DIR__ . '/includes/render.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/listing.php';
require_once __DIR__ . '/includes/updater.php';
