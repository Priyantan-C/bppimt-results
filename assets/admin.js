/* Result table editor on the edit screen: upload the university Excel, fix cells in a grid, save. */
( function () {
	'use strict';

	const cfg = window.BPPIMTResultsConfig;
	const app = document.getElementById( 'bppimt-results-app' );
	const R = window.BPPIMTResults;
	if ( ! cfg || ! app || ! R ) {
		return;
	}

	const LEAD = R.LEAD;
	const TAIL = /^(SGPA\d*|YGPA|DGPA|CGPA|SEMESTER RESULT|OVERALL RESULT|TOTAL MAR POINTS)$/;
	const state = { tables: [], semester: 0, mode: 'original', history: [], saved: '', active: 0, dirty: false, hasSaved: false, notes: [], source: 'edit', busy: false };

	const esc = ( s ) => String( s == null ? '' : s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );
	const $ = ( sel ) => app.querySelector( sel );

	function post( action, fields ) {
		const fd = new FormData();
		fd.append( 'action', 'bppimt_results_' + action );
		fd.append( 'nonce', cfg.nonce );
		fd.append( 'post_id', cfg.postId );
		Object.keys( fields || {} ).forEach( ( k ) => fd.append( k, fields[ k ] ) );
		return fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd } )
			.then( ( r ) => r.text() )
			.then( ( t ) => {
				let j = null;
				try {
					j = JSON.parse( t );
				} catch ( e ) {}
				if ( ! j || ! j.success ) {
					throw new Error( ( j && j.data && j.data.message ) || 'The website did not accept the request. Reload the page and try again.' );
				}
				return j.data;
			} );
	}

	/* ------------------------------------------------------------ layout */

	app.innerHTML =
		'<div class="bppimt-ed">' +
		'<div class="bppimt-ed__top">' +
		'<div class="bppimt-ed__actions">' +
		'<button type="button" class="button" data-act="upload">Upload result Excel</button>' +
		'<input type="file" accept=".xlsx" hidden data-role="file">' +
		'<button type="button" class="button button-primary" data-act="save" disabled>Save tables</button>' +
		'<span class="bppimt-ed__status" data-role="status" aria-live="polite"></span>' +
		'</div>' +
		'<div class="bppimt-ed__site">' +
		'<label>Website shows <select data-role="mode"><option value="original">the original page content</option><option value="new">the new result tables</option></select></label>' +
		'<a href="' + esc( cfg.view + ( cfg.view.indexOf( '?' ) < 0 ? '?' : '&' ) + 'bppimt_preview=1' ) + '" target="_blank" rel="noopener" data-role="preview">Preview new tables</a>' +
		'</div>' +
		'</div>' +
		'<div class="bppimt-ed__notes" data-role="notes"></div>' +
		'<div class="bppimt-ed__empty" data-role="empty" hidden><p><strong>No result tables yet.</strong></p><p>Click <em>Upload result Excel</em> and choose the file exactly as the university sends it. The college name, course code and empty columns are removed, course and semester names are shortened, and each course gets its own table. You can then check and correct the tables here before saving.</p></div>' +
		'<div data-role="editor" hidden>' +
		'<div class="bppimt-ed__tabs" data-role="tabs" role="tablist"></div>' +
		'<div class="bppimt-ed__tablebar">' +
		'<label>Course <input type="text" data-role="course" list="bppimt-course-list" size="14"></label>' +
		'<datalist id="bppimt-course-list">' + cfg.courses.map( ( c ) => '<option value="' + esc( c.short ) + '">' ).join( '' ) + '</datalist>' +
		'<label>Table title <input type="text" data-role="label" size="22"></label>' +
		'<span class="bppimt-ed__spacer"></span>' +
		'<button type="button" class="button button-small" data-act="add-row">Add student row</button>' +
		'<button type="button" class="button button-small" data-act="add-col">Add column</button>' +
		'<button type="button" class="button button-small button-link-delete" data-act="del-table">Delete this table</button>' +
		'</div>' +
		'<div class="bppimt-ed__grid" data-role="grid"></div>' +
		'<p class="description">Click a cell to change it. Enter moves down, Tab moves right. You can paste a block of cells copied from Excel. Use the × on a column heading or row number to delete it. Changes reach the website only after you click <strong>Save tables</strong>.</p>' +
		'</div>' +
		'<div class="bppimt-ed__foot" data-role="foot" hidden><label>Earlier versions <select data-role="history"></select></label> <button type="button" class="button button-small" data-act="load-version">Load this version</button></div>' +
		'</div>';

	const grid = $( '[data-role="grid"]' );

	/* ------------------------------------------------------------ render */

	function setStatus( text, kind ) {
		const el = $( '[data-role="status"]' );
		el.textContent = text || '';
		el.className = 'bppimt-ed__status' + ( kind ? ' is-' + kind : '' );
	}

	function refreshStatus() {
		$( '[data-act="save"]' ).disabled = ! state.dirty || state.busy || ! state.tables.length;
		if ( state.busy ) {
			return;
		}
		if ( state.dirty ) {
			setStatus( 'Unsaved changes', 'warn' );
		} else {
			setStatus( state.saved || '', 'ok' );
		}
	}

	function markDirty() {
		state.dirty = true;
		refreshStatus();
		renderTabs();
	}

	function renderNotes() {
		const box = $( '[data-role="notes"]' );
		box.innerHTML = state.notes
			.map( ( n ) => '<div class="bppimt-ed__note is-' + esc( n.level ) + '">' + esc( n.text ) + '</div>' )
			.join( '' );
	}

	function renderTabs() {
		$( '[data-role="tabs"]' ).innerHTML =
			state.tables
				.map( ( t, i ) => '<button type="button" role="tab" class="bppimt-ed__tab' + ( i === state.active ? ' is-active' : '' ) + '" aria-selected="' + ( i === state.active ) + '" data-tab="' + i + '">' + esc( t.label || t.course ) + ' <span>' + t.rows.length + '</span></button>' )
				.join( '' ) + '<button type="button" class="bppimt-ed__tab is-add" data-act="add-table">+ Add table</button>';
	}

	function renderGrid() {
		const t = state.tables[ state.active ];
		if ( ! t ) {
			grid.innerHTML = '';
			return;
		}
		$( '[data-role="course"]' ).value = t.course;
		$( '[data-role="label"]' ).value = t.label;
		let html = '<table class="bppimt-grid"><thead><tr><th class="bppimt-grid__corner">#</th>';
		t.headings.forEach( ( h, c ) => {
			const fixed = LEAD.includes( h ) && c < LEAD.length;
			html += '<th data-hc="' + c + '"><span class="bppimt-grid__h' + ( fixed ? ' is-fixed' : '' ) + '" data-c="' + c + '"' + ( fixed ? '' : ' title="Click to rename"' ) + '>' + esc( h ) + '</span>' + ( fixed ? '' : '<button type="button" class="bppimt-grid__x" data-delcol="' + c + '" title="Delete this column" aria-label="Delete column ' + esc( h ) + '">×</button>' ) + '</th>';
		} );
		html += '</tr></thead><tbody>';
		t.rows.forEach( ( row, r ) => {
			html += '<tr><th class="bppimt-grid__n"><span>' + ( r + 1 ) + '</span><button type="button" class="bppimt-grid__x" data-delrow="' + r + '" title="Delete this student row" aria-label="Delete row ' + ( r + 1 ) + '">×</button></th>';
			for ( let c = 0; c < t.headings.length; c++ ) {
				html += '<td data-r="' + r + '" data-c="' + c + '">' + esc( row[ c ] ) + '</td>';
			}
			html += '</tr>';
		} );
		html += '</tbody></table>';
		grid.innerHTML = html;
	}

	function render() {
		const has = state.tables.length > 0;
		if ( state.active >= state.tables.length ) {
			state.active = Math.max( 0, state.tables.length - 1 );
		}
		$( '[data-role="empty"]' ).hidden = has;
		$( '[data-role="editor"]' ).hidden = ! has;
		$( '[data-role="mode"]' ).value = state.mode;
		$( '[data-role="preview"]' ).hidden = ! state.hasSaved;
		const hist = $( '[data-role="history"]' );
		hist.innerHTML = state.history.map( ( h ) => '<option value="' + h.id + '">' + esc( h.label ) + '</option>' ).join( '' );
		$( '[data-role="foot"]' ).hidden = ! state.history.length;
		renderNotes();
		renderTabs();
		renderGrid();
		refreshStatus();
	}

	function applyServer( data ) {
		state.mode = data.mode;
		state.history = data.history || [];
		state.saved = data.saved || '';
		state.hasSaved = !! data.data;
		if ( data.data ) {
			state.tables = data.data.tables;
			state.semester = data.data.semester || 0;
		}
	}

	/* ----------------------------------------------------------- editing */

	let editing = null;

	function startEdit( el ) {
		if ( ! el || editing === el ) {
			return;
		}
		stopEdit( true );
		editing = el;
		el.dataset.before = el.textContent;
		try {
			el.contentEditable = 'plaintext-only';
		} catch ( e ) {
			el.contentEditable = 'true';
		}
		if ( el.contentEditable !== 'plaintext-only' ) {
			el.contentEditable = 'true';
		}
		el.classList.add( 'is-editing' );
		el.focus();
		const range = document.createRange();
		range.selectNodeContents( el );
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange( range );
	}

	function stopEdit( commit ) {
		const el = editing;
		if ( ! el ) {
			return;
		}
		editing = null;
		const t = state.tables[ state.active ];
		const before = el.dataset.before || '';
		let value = commit ? el.textContent.replace( / /g, ' ' ).replace( /\s+/g, ' ' ).trim() : before;
		const c = +el.dataset.c;
		el.contentEditable = 'false';
		el.classList.remove( 'is-editing' );
		if ( el.tagName === 'SPAN' ) {
			value = value.toUpperCase();
			if ( ! value || ( value !== before && t.headings.includes( value ) ) ) {
				value = before; // a heading cannot be empty or repeat another one
			}
			if ( t && value !== before ) {
				t.headings[ c ] = value;
				markDirty();
			}
		} else if ( t && value !== before ) {
			t.rows[ +el.dataset.r ][ c ] = value;
			markDirty();
		}
		el.textContent = value;
	}

	function cellAt( r, c ) {
		return grid.querySelector( 'td[data-r="' + r + '"][data-c="' + c + '"]' );
	}

	grid.addEventListener( 'click', ( e ) => {
		const t = state.tables[ state.active ];
		const delRow = e.target.closest( '[data-delrow]' );
		const delCol = e.target.closest( '[data-delcol]' );
		if ( delRow ) {
			stopEdit( true );
			const r = +delRow.dataset.delrow;
			const who = [ t.rows[ r ][ 0 ], t.rows[ r ][ 1 ] ].filter( Boolean ).join( ', ' ) || 'this empty row';
			if ( window.confirm( 'Delete the row for ' + who + '?' ) ) {
				t.rows.splice( r, 1 );
				markDirty();
				renderGrid();
			}
			return;
		}
		if ( delCol ) {
			stopEdit( true );
			const c = +delCol.dataset.delcol;
			if ( window.confirm( 'Delete the column "' + t.headings[ c ] + '" and all its values from this table?' ) ) {
				t.headings.splice( c, 1 );
				t.rows.forEach( ( row ) => row.splice( c, 1 ) );
				markDirty();
				renderGrid();
			}
			return;
		}
		const cell = e.target.closest( 'td[data-r], .bppimt-grid__h:not(.is-fixed)' );
		if ( cell ) {
			startEdit( cell );
		}
	} );

	grid.addEventListener( 'focusout', ( e ) => {
		if ( editing && e.target === editing ) {
			stopEdit( true );
		}
	} );

	grid.addEventListener( 'keydown', ( e ) => {
		if ( ! editing ) {
			return;
		}
		const el = editing;
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			stopEdit( false );
			return;
		}
		if ( el.tagName === 'SPAN' ) {
			if ( e.key === 'Enter' || e.key === 'Tab' ) {
				e.preventDefault();
				stopEdit( true );
			}
			return;
		}
		const r = +el.dataset.r;
		const c = +el.dataset.c;
		let next = null;
		if ( e.key === 'Enter' || e.key === 'ArrowDown' ) {
			next = [ r + 1, c ];
		} else if ( e.key === 'ArrowUp' ) {
			next = [ r - 1, c ];
		} else if ( e.key === 'Tab' ) {
			next = e.shiftKey ? [ r, c - 1 ] : [ r, c + 1 ];
		}
		if ( next ) {
			e.preventDefault();
			const target = cellAt( next[ 0 ], next[ 1 ] );
			stopEdit( true );
			if ( target ) {
				startEdit( cellAt( next[ 0 ], next[ 1 ] ) );
			}
		}
	} );

	grid.addEventListener( 'paste', ( e ) => {
		if ( ! editing ) {
			return;
		}
		const text = ( e.clipboardData || window.clipboardData ).getData( 'text/plain' ) || '';
		e.preventDefault();
		const lines = text.replace( /\r/g, '' ).replace( /\n+$/, '' ).split( '\n' );
		if ( editing.tagName === 'SPAN' || ( lines.length === 1 && lines[ 0 ].indexOf( '\t' ) < 0 ) ) {
			document.execCommand( 'insertText', false, lines.join( ' ' ) );
			return;
		}
		// A block copied from Excel: fill cells to the right and down from here.
		const t = state.tables[ state.active ];
		const r0 = +editing.dataset.r;
		const c0 = +editing.dataset.c;
		stopEdit( false );
		lines.forEach( ( line, i ) => {
			const r = r0 + i;
			while ( t.rows.length <= r ) {
				t.rows.push( t.headings.map( () => '' ) );
			}
			line.split( '\t' ).forEach( ( v, j ) => {
				if ( c0 + j < t.headings.length ) {
					t.rows[ r ][ c0 + j ] = R.clean( v );
				}
			} );
		} );
		markDirty();
		renderGrid();
	} );

	/* ------------------------------------------------------ table tools */

	function blankRow( t ) {
		return t.headings.map( ( h ) => {
			if ( h === 'COURSE NAME' ) {
				return t.course;
			}
			if ( h === 'SEMESTER' && t.rows.length ) {
				return t.rows[ 0 ][ t.headings.indexOf( 'SEMESTER' ) ];
			}
			return '';
		} );
	}

	app.addEventListener( 'click', ( e ) => {
		const tab = e.target.closest( '[data-tab]' );
		if ( tab ) {
			stopEdit( true );
			state.active = +tab.dataset.tab;
			renderTabs();
			renderGrid();
			return;
		}
		const btn = e.target.closest( '[data-act]' );
		if ( ! btn ) {
			return;
		}
		const act = btn.dataset.act;
		const t = state.tables[ state.active ];
		stopEdit( true );
		if ( act === 'upload' ) {
			$( '[data-role="file"]' ).click();
		} else if ( act === 'save' ) {
			save();
		} else if ( act === 'add-row' && t ) {
			t.rows.push( blankRow( t ) );
			markDirty();
			renderGrid();
			const cell = cellAt( t.rows.length - 1, 0 );
			cell.scrollIntoView( { block: 'nearest' } );
			startEdit( cell );
		} else if ( act === 'add-col' && t ) {
			let name = 'NEW COLUMN';
			for ( let n = 2; t.headings.includes( name ); n++ ) {
				name = 'NEW COLUMN ' + n;
			}
			let at = t.headings.findIndex( ( h ) => TAIL.test( h ) );
			if ( at < 0 ) {
				at = t.headings.length;
			}
			t.headings.splice( at, 0, name );
			t.rows.forEach( ( row ) => row.splice( at, 0, '' ) );
			markDirty();
			renderGrid();
			const h = grid.querySelector( '.bppimt-grid__h[data-c="' + at + '"]' );
			h.scrollIntoView( { block: 'nearest', inline: 'center' } );
			startEdit( h );
		} else if ( act === 'del-table' && t ) {
			if ( window.confirm( 'Delete the whole table "' + t.label + '" with its ' + t.rows.length + ' student rows?' ) ) {
				state.tables.splice( state.active, 1 );
				state.active = Math.max( 0, state.active - 1 );
				markDirty();
				render();
			}
		} else if ( act === 'add-table' ) {
			const nt = { course: 'New course', label: 'New course', headings: LEAD.concat( [ 'SGPA', 'SEMESTER RESULT' ] ), rows: [] };
			nt.rows.push( nt.headings.map( ( h ) => ( h === 'COURSE NAME' ? nt.course : '' ) ) );
			state.tables.push( nt );
			state.active = state.tables.length - 1;
			markDirty();
			render();
		} else if ( act === 'load-version' ) {
			loadVersion();
		}
	} );

	$( '[data-role="course"]' ).addEventListener( 'change', ( e ) => {
		const t = state.tables[ state.active ];
		const value = e.target.value.replace( /\s+/g, ' ' ).trim();
		if ( ! t || ! value ) {
			e.target.value = t ? t.course : '';
			return;
		}
		const old = t.course;
		const ci = t.headings.indexOf( 'COURSE NAME' );
		t.rows.forEach( ( row ) => {
			if ( ci >= 0 && row[ ci ] === old ) {
				row[ ci ] = value;
			}
		} );
		if ( t.label === old ) {
			t.label = value;
		}
		t.course = value;
		markDirty();
		renderGrid();
	} );

	$( '[data-role="label"]' ).addEventListener( 'change', ( e ) => {
		const t = state.tables[ state.active ];
		if ( t ) {
			t.label = e.target.value.replace( /\s+/g, ' ' ).trim() || t.course;
			e.target.value = t.label;
			markDirty();
		}
	} );

	/* ------------------------------------------------------ upload, save */

	$( '[data-role="file"]' ).addEventListener( 'change', async ( e ) => {
		const file = e.target.files[ 0 ];
		e.target.value = '';
		if ( ! file ) {
			return;
		}
		state.busy = true;
		setStatus( 'Reading ' + file.name + '…' );
		try {
			const sheets = await R.readXlsx( await file.arrayBuffer() );
			const blocks = R.toBlocks( sheets );
			if ( ! blocks.length ) {
				throw new Error( 'No heading row with "ROLL NO" and "NAME" was found in ' + file.name + '. Is this the result file?' );
			}
			const result = R.normalise( blocks, R.semesterNumber( cfg.title ), cfg.courses );
			const students = result.tables.reduce( ( n, t ) => n + t.rows.length, 0 );
			if ( ! students ) {
				throw new Error( 'No student rows were found in ' + file.name + '.' );
			}
			state.busy = false;
			if ( state.tables.length && ! window.confirm( 'Replace the tables shown here with the ' + result.tables.length + ' tables (' + students + ' students) from ' + file.name + '?\n\nNothing changes on the website until you click Save tables.' ) ) {
				refreshStatus();
				return;
			}
			state.tables = result.tables;
			state.semester = result.semester;
			state.active = 0;
			state.source = 'excel';
			state.notes = [ { level: 'ok', text: 'Read ' + students + ' students in ' + result.tables.length + ' tables from ' + file.name + '. Check the tables below, then click Save tables.' } ].concat( result.notes );
			state.dirty = true;
			render();
		} catch ( err ) {
			state.busy = false;
			state.notes = [ { level: 'error', text: err.message } ];
			renderNotes();
			refreshStatus();
		}
	} );

	function checks() {
		const notes = [];
		const seen = {};
		const dups = new Set();
		state.tables.forEach( ( t ) => {
			if ( t.headings.some( ( h ) => ! h ) ) {
				notes.push( { level: 'error', text: t.label + ': a column has no heading.' } );
			}
			const bad = t.rows.filter( ( r ) => ! /^\d{11}$/.test( r[ 0 ] ) ).length;
			if ( bad ) {
				notes.push( { level: 'error', text: t.label + ': ' + bad + ' row(s) do not have an 11 digit roll number.' } );
			}
			t.rows.forEach( ( r ) => {
				if ( r[ 0 ] && seen[ r[ 0 ] ] ) {
					dups.add( r[ 0 ] );
				}
				seen[ r[ 0 ] ] = true;
			} );
		} );
		if ( dups.size ) {
			notes.push( { level: 'error', text: dups.size + ' roll number(s) appear more than once: ' + Array.from( dups ).slice( 0, 8 ).join( ', ' ) } );
		}
		return notes;
	}

	function save() {
		if ( state.busy || ! state.tables.length ) {
			return;
		}
		state.busy = true;
		setStatus( 'Saving…' );
		$( '[data-act="save"]' ).disabled = true;
		const first = ! state.hasSaved;
		post( 'save', { data: JSON.stringify( { semester: state.semester, tables: state.tables } ), source: state.source } )
			.then( ( data ) => {
				state.busy = false;
				state.dirty = false;
				state.source = 'edit';
				applyServer( data );
				state.notes = checks();
				if ( state.mode !== 'new' ) {
					state.notes.unshift( { level: 'info', text: ( first ? 'Tables saved. ' : '' ) + 'The website still shows the original page content. Open "Preview new tables" to check them, then set "Website shows" to "the new result tables".' } );
				}
				render();
			} )
			.catch( ( err ) => {
				state.busy = false;
				state.notes = [ { level: 'error', text: 'Not saved. ' + err.message } ];
				renderNotes();
				refreshStatus();
			} );
	}

	$( '[data-role="mode"]' ).addEventListener( 'change', ( e ) => {
		const mode = e.target.value;
		if ( mode === 'new' && ( ! state.hasSaved || state.dirty ) ) {
			e.target.value = state.mode;
			state.notes = [ { level: 'error', text: 'Click Save tables first, then switch the website over to the new tables.' } ];
			renderNotes();
			return;
		}
		post( 'mode', { mode } )
			.then( ( data ) => {
				state.mode = data.mode;
				state.notes = [ { level: 'ok', text: data.mode === 'new' ? 'The website now shows the new result tables for this result.' : 'The website now shows the original page content for this result. The tables stay stored here.' } ];
				renderNotes();
			} )
			.catch( ( err ) => {
				e.target.value = state.mode;
				state.notes = [ { level: 'error', text: err.message } ];
				renderNotes();
			} );
	} );

	function loadVersion() {
		const sel = $( '[data-role="history"]' );
		if ( ! sel.value ) {
			return;
		}
		const label = sel.options[ sel.selectedIndex ].textContent;
		if ( state.dirty && ! window.confirm( 'You have unsaved changes. Load the earlier version anyway?' ) ) {
			return;
		}
		post( 'version', { version: sel.value } )
			.then( ( data ) => {
				state.tables = data.data.tables;
				state.semester = data.data.semester || 0;
				state.active = 0;
				state.dirty = true;
				state.source = 'restore';
				state.notes = [ { level: 'info', text: 'Loaded the version from ' + label + '. Click Save tables to make it the current one.' } ];
				render();
			} )
			.catch( ( err ) => {
				state.notes = [ { level: 'error', text: err.message } ];
				renderNotes();
			} );
	}

	window.addEventListener( 'beforeunload', ( e ) => {
		if ( state.dirty ) {
			e.preventDefault();
			e.returnValue = '';
		}
	} );

	post( 'load' )
		.then( ( data ) => {
			applyServer( data );
			render();
		} )
		.catch( ( err ) => {
			state.notes = [ { level: 'error', text: err.message } ];
			render();
		} );
} )();
