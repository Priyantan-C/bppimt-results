/* Results > Result Tables list: filter, select, and switch what the website shows. */
( function () {
	'use strict';

	const cfg = window.BPPIMTResultsConfig;
	const root = document.getElementById( 'bppimt-list' );
	if ( ! cfg || ! root ) {
		return;
	}
	const rows = Array.from( root.querySelectorAll( 'tbody tr' ) );
	const all = root.querySelector( '[data-role="all"]' );
	const msg = root.querySelector( '[data-role="msg"]' );
	const filters = Array.from( root.querySelectorAll( '[data-filter]' ) );
	const bulk = Array.from( root.querySelectorAll( '[data-bulk]' ) );
	const box = ( tr ) => tr.querySelector( '[data-role="pick"]' );
	const shown = () => rows.filter( ( tr ) => ! tr.hidden );
	const picked = () => shown().filter( ( tr ) => box( tr ).checked );

	function say( text, kind ) {
		msg.textContent = text || '';
		msg.className = 'bppimt-list__msg' + ( kind ? ' is-' + kind : '' );
	}

	function drawRow( tr ) {
		const state = tr.dataset.state;
		const sw = tr.querySelector( '[data-role="switch"]' );
		const look = tr.querySelector( '[data-role="look"]' );
		if ( state === 'none' ) {
			sw.innerHTML = '<span class="bppimt-pill is-none">Original content</span>';
			look.innerHTML = '';
			return;
		}
		const isNew = state === 'new';
		sw.innerHTML = '<span class="bppimt-pill is-' + state + '">' + ( isNew ? 'New tables' : 'Original content' ) + '</span>' +
			'<button type="button" class="button button-small" data-one="' + ( isNew ? 'original' : 'new' ) + '">' + ( isNew ? 'Switch back' : 'Switch to new tables' ) + '</button>';
		look.innerHTML = isNew
			? '<a class="button button-small" target="_blank" rel="noopener" href="' + tr.dataset.view + '">View on website</a>'
			: '<a class="button button-small" target="_blank" rel="noopener" href="' + tr.dataset.preview + '">Preview new tables</a>';
	}

	function refresh() {
		const vis = shown();
		const sel = picked();
		const can = vis.filter( ( tr ) => ! box( tr ).disabled );
		rows.forEach( ( tr ) => tr.classList.toggle( 'is-picked', ! tr.hidden && box( tr ).checked ) );
		root.querySelector( '[data-role="count"]' ).textContent = 'Showing ' + vis.length + ' of ' + rows.length + ' results';
		root.querySelector( '[data-role="picked"]' ).textContent = sel.length + ' selected';
		all.checked = can.length > 0 && sel.length === can.length;
		all.indeterminate = sel.length > 0 && sel.length < can.length;
		bulk.forEach( ( b ) => {
			b.disabled = ! sel.some( ( tr ) => tr.dataset.state !== b.dataset.bulk );
		} );
	}

	function applyFilters() {
		const want = {};
		filters.forEach( ( f ) => {
			want[ f.dataset.filter ] = f.value;
		} );
		rows.forEach( ( tr ) => {
			const hit = ( ! want.sem || tr.dataset.sem === want.sem ) && ( ! want.year || tr.dataset.year === want.year ) && ( ! want.state || tr.dataset.state === want.state );
			tr.hidden = ! hit;
			if ( ! hit ) {
				box( tr ).checked = false; // a hidden result is never changed by accident
			}
		} );
		refresh();
	}

	function switchTo( list, mode ) {
		const ids = list.filter( ( tr ) => tr.dataset.state !== 'none' ).map( ( tr ) => tr.dataset.id );
		if ( ! ids.length ) {
			return;
		}
		say( 'Switching ' + ids.length + ( ids.length === 1 ? ' result…' : ' results…' ) );
		const fd = new FormData();
		fd.append( 'action', 'bppimt_results_mode_many' );
		fd.append( 'nonce', cfg.nonce );
		fd.append( 'mode', mode );
		fd.append( 'ids', ids.join( ',' ) );
		fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd } )
			.then( ( r ) => r.json() )
			.then( ( j ) => {
				if ( ! j || ! j.success ) {
					throw new Error( ( j && j.data && j.data.message ) || 'The website did not accept the request. Reload the page and try again.' );
				}
				let n = 0;
				rows.forEach( ( tr ) => {
					const d = j.data[ tr.dataset.id ];
					if ( d ) {
						tr.dataset.state = d.state;
						const st = tr.querySelector( '[data-role="status"]' );
						st.textContent = d.text;
						st.className = 'bppimt-state-' + d.state;
						drawRow( tr );
						if ( d.state === mode ) {
							n++;
						}
					}
				} );
				say( n + ( n === 1 ? ' result now shows ' : ' results now show ' ) + ( mode === 'new' ? 'the new tables.' : 'the original content.' ) + ' Purge the page cache if the site uses one.', 'ok' );
				refresh();
			} )
			.catch( ( err ) => say( err.message, 'bad' ) );
	}

	filters.forEach( ( f ) => f.addEventListener( 'change', applyFilters ) );
	all.addEventListener( 'change', () => {
		shown().forEach( ( tr ) => {
			if ( ! box( tr ).disabled ) {
				box( tr ).checked = all.checked;
			}
		} );
		refresh();
	} );
	root.addEventListener( 'change', ( e ) => {
		if ( e.target.matches( '[data-role="pick"]' ) ) {
			refresh();
		}
	} );
	root.addEventListener( 'click', ( e ) => {
		const one = e.target.closest( '[data-one]' );
		if ( one ) {
			switchTo( [ one.closest( 'tr' ) ], one.dataset.one );
			return;
		}
		const b = e.target.closest( '[data-bulk]' );
		if ( b && ! b.disabled ) {
			switchTo( picked(), b.dataset.bulk );
		}
	} );

	rows.forEach( drawRow );
	applyFilters();
} )();
