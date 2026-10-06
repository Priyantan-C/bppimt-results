/* Tools > Import Result Tables: load many results from one import file. */
( function () {
	'use strict';

	const cfg = window.BPPIMTResultsConfig;
	const fileInput = document.getElementById( 'bppimt-import-file' );
	if ( ! cfg || ! fileInput ) {
		return;
	}
	const summary = document.getElementById( 'bppimt-import-summary' );
	const options = document.getElementById( 'bppimt-import-options' );
	const list = document.getElementById( 'bppimt-import-list' );
	const progress = document.getElementById( 'bppimt-import-progress' );
	const runBtn = document.getElementById( 'bppimt-import-run' );
	let results = [];
	let found = {};

	const esc = ( s ) => String( s == null ? '' : s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );

	function post( action, fields ) {
		const fd = new FormData();
		fd.append( 'action', 'bppimt_results_' + action );
		fd.append( 'nonce', cfg.nonce );
		Object.keys( fields || {} ).forEach( ( k ) => fd.append( k, fields[ k ] ) );
		return fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd } )
			.then( ( r ) => r.text() )
			.then( ( t ) => {
				let j = null;
				try {
					j = JSON.parse( t );
				} catch ( e ) {}
				if ( ! j || ! j.success ) {
					throw new Error( ( j && j.data && j.data.message ) || 'The website did not accept the request.' );
				}
				return j.data;
			} );
	}

	const students = ( r ) => r.tables.reduce( ( n, t ) => n + t.rows.length, 0 );

	function draw( state ) {
		state = state || {};
		let html = '<table class="widefat striped"><thead><tr><th>Result in the file</th><th>Tables</th><th>Students</th><th>Page on this website</th><th>Status</th></tr></thead><tbody>';
		results.forEach( ( r ) => {
			const f = found[ r.slug ];
			let status = state[ r.slug ];
			if ( ! status ) {
				status = ! f ? '<span class="is-bad">No matching page. Skipped.</span>' : f.hasData ? '<span class="is-warn">Already has tables</span>' : '<span>Ready to import</span>';
			}
			html += '<tr><td>' + esc( r.title ) + '</td><td>' + r.tables.length + '</td><td>' + students( r ) + '</td><td>' +
				( f ? '<a href="' + esc( f.edit ) + '" target="_blank" rel="noopener">' + esc( f.title ) + '</a> · <a href="' + esc( f.view + ( f.view.indexOf( '?' ) < 0 ? '?' : '&' ) + 'bppimt_preview=1' ) + '" target="_blank" rel="noopener">preview</a>' : '' ) +
				'</td><td>' + status + '</td></tr>';
		} );
		list.innerHTML = html + '</tbody></table>';
	}

	fileInput.addEventListener( 'change', async () => {
		const file = fileInput.files[ 0 ];
		if ( ! file ) {
			return;
		}
		options.hidden = true;
		list.innerHTML = '';
		summary.innerHTML = '<p>Reading the file…</p>';
		try {
			const bundle = JSON.parse( await file.text() );
			results = ( bundle && bundle.results ) || [];
			results = results.filter( ( r ) => r && r.slug && Array.isArray( r.tables ) && r.tables.length );
			if ( ! results.length ) {
				throw new Error( 'This file does not contain any results.' );
			}
			found = await post( 'lookup', { items: JSON.stringify( results.map( ( r ) => ( { slug: r.slug, title: r.title } ) ) ) } );
			const matched = results.filter( ( r ) => found[ r.slug ] ).length;
			summary.innerHTML = '<p><strong>' + results.length + ' results</strong> in the file, with ' + results.reduce( ( n, r ) => n + students( r ), 0 ) + ' student rows. ' + matched + ' match a page on this website.</p>';
			options.hidden = false;
			draw();
		} catch ( err ) {
			summary.innerHTML = '<p class="is-bad"><strong>' + esc( err.message ) + '</strong></p>';
		}
	} );

	runBtn.addEventListener( 'click', async () => {
		const overwrite = document.getElementById( 'bppimt-import-overwrite' ).checked;
		const mode = document.querySelector( 'input[name="bppimt-import-mode"]:checked' ).value;
		const state = {};
		let done = 0;
		let failed = 0;
		let skipped = 0;
		runBtn.disabled = true;
		for ( const r of results ) {
			const f = found[ r.slug ];
			if ( ! f ) {
				skipped++;
				continue;
			}
			if ( f.hasData && ! overwrite ) {
				state[ r.slug ] = '<span class="is-warn">Already has tables. Left as it is.</span>';
				skipped++;
				continue;
			}
			progress.textContent = 'Importing ' + r.title + '…';
			try {
				// eslint-disable-next-line no-await-in-loop
				await post( 'save', { post_id: f.id, data: JSON.stringify( { semester: r.semester || 0, tables: r.tables } ), source: 'bulk', mode } );
				f.hasData = true;
				state[ r.slug ] = '<span class="is-ok">Imported' + ( mode === 'new' ? ', website shows the new tables' : ', website still shows the original content' ) + '</span>';
				done++;
			} catch ( err ) {
				state[ r.slug ] = '<span class="is-bad">Failed: ' + esc( err.message ) + '</span>';
				failed++;
			}
			draw( state );
		}
		progress.textContent = 'Finished. ' + done + ' imported, ' + skipped + ' skipped, ' + failed + ' failed.';
		runBtn.disabled = false;
	} );

	document.querySelectorAll( '[data-bppimt-mode-all]' ).forEach( ( btn ) => {
		btn.addEventListener( 'click', () => {
			const mode = btn.dataset.bppimtModeAll;
			const text = mode === 'new' ? 'Show the new tables on every result that has them?' : 'Show the original page content on every result?';
			if ( ! window.confirm( text ) ) {
				return;
			}
			const out = document.getElementById( 'bppimt-mode-all-status' );
			out.textContent = 'Working…';
			post( 'mode_all', { mode } )
				.then( ( d ) => {
					out.textContent = d.changed + ' results now show ' + ( d.mode === 'new' ? 'the new tables.' : 'the original content.' );
				} )
				.catch( ( err ) => {
					out.textContent = err.message;
				} );
		} );
	} );
} )();
