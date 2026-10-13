/* Results listing: switch academic year without reloading the page. Works as plain links without JavaScript. */
( function () {
	'use strict';
	function setup( root ) {
		const links = Array.from( root.querySelectorAll( '.bppimt-list__year' ) );
		const groups = Array.from( root.querySelectorAll( '.bppimt-list__group' ) );
		function show( year, push ) {
			links.forEach( ( a ) => {
				if ( a.dataset.year === year ) {
					a.setAttribute( 'aria-current', 'true' );
				} else {
					a.removeAttribute( 'aria-current' );
				}
			} );
			groups.forEach( ( g ) => {
				g.hidden = year !== 'all' && g.dataset.group !== year;
			} );
			root.classList.toggle( 'is-all', year === 'all' );
			if ( push && window.history && history.replaceState ) {
				const url = new URL( window.location.href );
				url.searchParams.set( 'result_year', year );
				history.replaceState( null, '', url );
			}
		}
		links.forEach( ( a ) => {
			a.addEventListener( 'click', ( e ) => {
				if ( e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 ) {
					return; // let "open in new tab" work
				}
				e.preventDefault();
				show( a.dataset.year, true );
			} );
		} );
		const current = links.find( ( a ) => a.getAttribute( 'aria-current' ) === 'true' );
		show( current ? current.dataset.year : 'all', false );
	}
	function init() {
		document.querySelectorAll( '[data-bppimt-list]' ).forEach( setup );
	}
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
