/* Course tabs and the roll number / name search for the result tables. Without JavaScript every table is simply shown. */
( function () {
	'use strict';

	function setup( root ) {
		const tabs = Array.from( root.querySelectorAll( '.bppimt-results__tab' ) );
		const panels = Array.from( root.querySelectorAll( '.bppimt-results__panel' ) );
		const input = root.querySelector( '.bppimt-results__search input' );
		const status = root.querySelector( '.bppimt-results__status' );
		const empty = root.querySelector( '.bppimt-results__empty' );
		if ( ! tabs.length || ! panels.length ) {
			return;
		}

		function show( i, focus ) {
			tabs.forEach( ( t, n ) => {
				t.setAttribute( 'aria-selected', n === i ? 'true' : 'false' );
				t.tabIndex = n === i ? 0 : -1;
			} );
			panels.forEach( ( p, n ) => p.classList.toggle( 'is-active', n === i ) );
			if ( focus ) {
				tabs[ i ].focus();
			}
		}

		tabs.forEach( ( tab, i ) => {
			tab.addEventListener( 'click', () => {
				if ( input && input.value ) {
					input.value = '';
					search( '' );
				}
				show( i );
			} );
			tab.addEventListener( 'keydown', ( e ) => {
				const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
				if ( step ) {
					e.preventDefault();
					show( ( i + step + tabs.length ) % tabs.length, true );
				}
			} );
		} );

		let rows = null;
		function index() {
			rows = [];
			root.querySelectorAll( '.bppimt-results__table tbody tr' ).forEach( ( tr ) => {
				const cells = tr.children;
				rows.push( { tr, text: ( ( cells[ 0 ] ? cells[ 0 ].textContent : '' ) + ' ' + ( cells[ 1 ] ? cells[ 1 ].textContent : '' ) ).toLowerCase() } );
			} );
		}

		function search( value ) {
			const q = value.trim().toLowerCase().replace( /\s+/g, ' ' );
			if ( ! rows ) {
				index();
			}
			let found = 0;
			rows.forEach( ( r ) => {
				const hit = ! q || r.text.indexOf( q ) >= 0;
				r.tr.hidden = ! hit;
				if ( hit ) {
					found++;
				}
			} );
			root.classList.toggle( 'is-searching', !! q );
			root.querySelectorAll( '.bppimt-results__block' ).forEach( ( b ) => {
				b.classList.toggle( 'is-nomatch', !! q && ! b.querySelector( 'tbody tr:not([hidden])' ) );
			} );
			panels.forEach( ( p ) => {
				p.classList.toggle( 'is-nomatch', !! q && ! p.querySelector( 'tbody tr:not([hidden])' ) );
			} );
			status.hidden = ! q || ! found;
			status.textContent = q && found ? found + ( found === 1 ? ' student found' : ' students found' ) + ' across all courses' : '';
			empty.hidden = ! q || found > 0;
		}

		if ( input ) {
			let timer = null;
			input.addEventListener( 'input', () => {
				clearTimeout( timer );
				timer = setTimeout( () => search( input.value ), 120 );
			} );
		}

		root.classList.add( 'is-ready' );
		show( 0 );
	}

	/* Height of any fixed site menu or toolbar at the top of the screen. */
	function fixedTop( root ) {
		let top = 0;
		const x = Math.round( window.innerWidth / 2 );
		for ( let i = 0; i < 4; i++ ) {
			let el = document.elementFromPoint( x, top + 2 );
			let bar = null;
			while ( el && el !== document.body && el !== document.documentElement ) {
				const pos = getComputedStyle( el ).position;
				if ( ( pos === 'fixed' || pos === 'sticky' ) && ! root.contains( el ) ) {
					bar = el;
				}
				el = el.parentElement;
			}
			if ( ! bar ) {
				break;
			}
			const r = bar.getBoundingClientRect();
			if ( r.top > top + 4 || r.bottom <= top || r.height > window.innerHeight / 2 ) {
				break;
			}
			top = Math.round( r.bottom );
		}
		return top;
	}

	/* Wrappers around the result (the page builder puts wide content in a scrolling box) would stop the heading
	   row from sticking to the screen. The table scrolls sideways by itself, so those boxes are not needed here. */
	function unclip( root ) {
		for ( let el = root.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement ) {
			const cs = getComputedStyle( el );
			if ( cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ) {
				el.style.setProperty( 'overflow', 'visible', 'important' );
				if ( cs.display.indexOf( 'flex' ) >= 0 || cs.display.indexOf( 'grid' ) >= 0 ) {
					el.style.setProperty( 'min-width', '0' );
				}
			}
		}
	}

	function stickyHeads( root ) {
		if ( ! window.CSS || ! CSS.supports( '(position: sticky) or (position: -webkit-sticky)' ) || typeof ResizeObserver === 'undefined' ) {
			return;
		}
		unclip( root );
		root.querySelectorAll( '.bppimt-results__block' ).forEach( ( block ) => {
			const scroll = block.querySelector( '.bppimt-results__scroll' );
			const table = scroll && scroll.querySelector( 'table' );
			if ( ! table || ! table.tHead ) {
				return;
			}
			const wrap = document.createElement( 'div' );
			wrap.className = 'bppimt-results__sticky';
			wrap.setAttribute( 'aria-hidden', 'true' );
			const copy = document.createElement( 'table' );
			copy.className = table.className;
			copy.appendChild( table.tHead.cloneNode( true ) );
			wrap.appendChild( copy );
			block.insertBefore( wrap, scroll );
			block.classList.add( 'has-sticky' );
			const from = table.tHead.rows[ 0 ].cells;
			const to = copy.tHead.rows[ 0 ].cells;

			function size() {
				const w = table.getBoundingClientRect().width;
				if ( ! w ) {
					return; // inside a hidden course tab
				}
				copy.style.width = w + 'px';
				for ( let i = 0; i < from.length; i++ ) {
					const cw = from[ i ].getBoundingClientRect().width + 'px';
					to[ i ].style.width = cw;
					to[ i ].style.minWidth = cw;
					to[ i ].style.maxWidth = cw;
				}
				const h = table.tHead.getBoundingClientRect().height;
				wrap.style.height = h + 1 + 'px';
				wrap.style.marginBottom = -( h + 1 ) + 'px'; // sit exactly on top of the table's own heading row
				wrap.scrollLeft = scroll.scrollLeft;
			}
			scroll.addEventListener( 'scroll', () => {
				wrap.scrollLeft = scroll.scrollLeft;
			}, { passive: true } );
			new ResizeObserver( size ).observe( table );
			size();
		} );

		// Rest just below a fixed site menu or toolbar, when there is one. Checked now and then, never per frame.
		let last = -1;
		let timer = null;
		function setTop() {
			const top = fixedTop( root );
			if ( top !== last ) {
				last = top;
				root.style.setProperty( '--bppimt-top', top + 'px' );
			}
		}
		function later() {
			clearTimeout( timer );
			timer = setTimeout( setTop, 150 );
		}
		window.addEventListener( 'scroll', later, { passive: true } );
		window.addEventListener( 'resize', later );
		setTop();
	}

	function init() {
		document.querySelectorAll( '[data-bppimt-results]' ).forEach( ( root ) => {
			setup( root );
			stickyHeads( root );
		} );
	}
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
