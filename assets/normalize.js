/* The cleaning rules, shared by the Excel upload: the same rules used to convert every past result. */
( function ( root ) {
	'use strict';

	const LEAD = [ 'ROLL NO', 'NAME', 'SEMESTER', 'COURSE NAME' ];
	const DROP = [ 'COLLEGE NAME', 'COURSE CODE' ];
	const TAIL = /^(SGPA\d*|YGPA|DGPA|CGPA|SEMESTER RESULT|OVERALL RESULT|TOTAL MAR POINTS)$/;
	const HEADER_FIXES = { COURSENAME: 'COURSE NAME', 'SEMETER RESULT': 'SEMESTER RESULT', 'ROLL NO.': 'ROLL NO', ROLLNO: 'ROLL NO' };
	const ORD = [ '', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th' ];
	const SEM_WORDS = {
		first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
		one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
	};

	const norm = ( t ) => String( t == null ? '' : t ).toLowerCase().replace( /[^a-z0-9]+/g, ' ' ).trim();

	function clean( v ) {
		v = String( v == null ? '' : v ).replace( / /g, ' ' ).replace( /\s+/g, ' ' ).trim();
		if ( v === '()' ) {
			return '';
		}
		if ( /^[—–-]+$/.test( v ) ) {
			return '---'; // a long dash is how WordPress prints the university's "---"
		}
		return v;
	}

	function heading( h ) {
		h = clean( h ).toUpperCase();
		return HEADER_FIXES[ h ] || h;
	}

	const isBlank = ( cells ) => cells.every( ( c ) => clean( c ) === '' );

	function isHeader( cells ) {
		const set = cells.map( ( c ) => norm( c ).replace( / /g, '' ) );
		return set.includes( 'rollno' ) && set.includes( 'name' );
	}

	/** "Fourth Semester", "Eight Semester", "4th Sem", "4" -> 4. Otherwise 0. */
	function semesterNumber( value ) {
		const words = norm( value ).split( ' ' ).filter( ( w ) => w && w !== 'semester' && w !== 'sem' && w !== 'results' && w !== 'result' );
		for ( const w of words ) {
			if ( SEM_WORDS[ w ] ) {
				return SEM_WORDS[ w ];
			}
			const m = w.match( /^(\d{1,2})(st|nd|rd|th)?$/ );
			if ( m && +m[ 1 ] >= 1 && +m[ 1 ] <= 10 ) {
				return +m[ 1 ];
			}
		}
		return 0;
	}

	function courseTools( courses ) {
		const byName = {};
		const byCode = {};
		courses.forEach( ( c ) => {
			byCode[ c.code ] = c.short;
			byName[ norm( c.short ) ] = c.short;
			( c.names || [] ).forEach( ( n ) => {
				byName[ norm( n ) ] = c.short;
			} );
		} );
		return {
			fromName( name ) {
				const n = norm( name );
				if ( byName[ n ] ) {
					return byName[ n ];
				}
				// The university export cuts long names short ("...Communication Engine").
				const hits = new Set();
				Object.keys( byName ).forEach( ( k ) => {
					if ( n.length >= 20 && k.startsWith( n ) ) {
						hits.add( byName[ k ] );
					}
				} );
				return hits.size === 1 ? Array.from( hits )[ 0 ] : null;
			},
			fromRoll( roll ) {
				roll = String( roll ).trim();
				return /^\d{11}$/.test( roll ) ? byCode[ roll.slice( 3, 6 ) ] || null : null;
			},
		};
	}

	/** Split sheet rows into blocks: the export repeats the heading row before each course. */
	function toBlocks( sheets ) {
		const blocks = [];
		sheets.forEach( ( sheet ) => {
			let cur = null;
			sheet.rows.forEach( ( row ) => {
				if ( isBlank( row ) ) {
					return;
				}
				if ( isHeader( row ) ) {
					cur = { header: row, rows: [] };
					blocks.push( cur );
				} else if ( cur ) {
					cur.rows.push( row );
				}
			} );
		} );
		return blocks.filter( ( b ) => b.rows.length );
	}

	function mergeHeadings( merged, names ) {
		names.forEach( ( name, pos ) => {
			if ( merged.includes( name ) ) {
				return;
			}
			let after = names.slice( pos + 1 ).find( ( n ) => merged.includes( n ) );
			if ( after === undefined && ! TAIL.test( name ) ) {
				after = merged.find( ( n ) => TAIL.test( n ) );
			}
			merged.splice( after === undefined ? merged.length : merged.indexOf( after ), 0, name );
		} );
	}

	const subjects = ( headings ) => headings.filter( ( h ) => ! LEAD.includes( h ) && ! TAIL.test( h ) );

	/**
	 * @param {Array} blocks   from toBlocks()
	 * @param {number} semNo   0 = work it out from the Semester column
	 * @param {Array} courses  course settings from the plugin
	 * @return {{semester:number, tables:Array, notes:Array<{level:string,text:string}>}}
	 */
	function normalise( blocks, semNo, courses ) {
		const tools = courseTools( courses );
		const notes = [];
		const note = ( level, text ) => {
			if ( ! notes.some( ( n ) => n.text === text ) ) {
				notes.push( { level, text } );
			}
		};
		const out = new Map(); // course -> groups

		// Semester: read it from the file when it is there.
		let fileSem = 0;
		blocks.forEach( ( b ) => {
			const i = b.header.map( heading ).indexOf( 'SEMESTER' );
			if ( i >= 0 && ! fileSem ) {
				for ( const r of b.rows ) {
					fileSem = semesterNumber( r[ i ] );
					if ( fileSem ) {
						break;
					}
				}
			}
		} );
		if ( fileSem && semNo && fileSem !== semNo ) {
			note( 'error', 'The file says ' + ORD[ fileSem ] + ' Sem but this page is for ' + ORD[ semNo ] + ' Sem. Check that you picked the right file. The file\'s semester was used.' );
		}
		const sem = fileSem || semNo;
		if ( ! sem ) {
			note( 'error', 'The semester could not be worked out from the file or the page title. Fill in the SEMESTER column by hand.' );
		}
		const semText = sem ? ORD[ sem ] + ' Sem' : '';

		blocks.forEach( ( block ) => {
			const heads = block.header.map( heading );
			const width = heads.length;
			const idx = {};
			heads.forEach( ( h, i ) => {
				if ( h && idx[ h ] === undefined ) {
					idx[ h ] = i;
				}
			} );
			if ( idx[ 'ROLL NO' ] === undefined ) {
				return;
			}
			const rows = block.rows.map( ( raw ) => {
				let r = raw.map( clean );
				while ( r.length > width && r[ r.length - 1 ] === '' ) {
					r.pop();
				}
				let surplus = r.length - width;
				for ( let i = r.length - 1; i > 1 && surplus > 0; i-- ) {
					if ( r[ i ] === '' ) {
						r.splice( i, 1 );
						surplus--;
					}
				}
				if ( surplus > 0 ) {
					note( 'error', 'Roll ' + r[ 0 ] + ': the row has more values than headings. Check this row.' );
					r = r.slice( 0, width );
				}
				while ( r.length < width ) {
					r.push( '' );
				}
				return r;
			} );

			const cols = [];
			const seen = {};
			heads.forEach( ( h, i ) => {
				if ( DROP.includes( h ) || LEAD.includes( h ) ) {
					return;
				}
				if ( ! h ) {
					if ( rows.every( ( r ) => r[ i ] === '' || r[ i ] === '0' ) ) {
						return; // the gap between the subjects and the GPA columns
					}
					note( 'error', 'A column after "' + ( heads[ i - 1 ] || 'column ' + i ) + '" has grades but no heading. The headings in this file may not match the data.' );
					h = 'COLUMN ' + ( i + 1 );
				}
				seen[ h ] = ( seen[ h ] || 0 ) + 1;
				cols.push( [ seen[ h ] === 1 ? h : h + ' (' + seen[ h ] + ')', i ] );
			} );
			const names = cols.map( ( c ) => c[ 0 ] );
			const key = names.join( '\u0001' );

			let blockCourse = null;
			if ( idx[ 'COURSE NAME' ] === undefined ) {
				const votes = {};
				rows.forEach( ( r ) => {
					const c = tools.fromRoll( r[ idx[ 'ROLL NO' ] ] );
					if ( c ) {
						votes[ c ] = ( votes[ c ] || 0 ) + 1;
					}
				} );
				blockCourse = Object.keys( votes ).sort( ( a, b ) => votes[ b ] - votes[ a ] )[ 0 ] || null;
				if ( blockCourse ) {
					note( 'info', 'A table had no course column. It was assigned to ' + blockCourse + ' from the roll numbers.' );
				}
			}

			rows.forEach( ( r ) => {
				const roll = r[ idx[ 'ROLL NO' ] ];
				const named = idx[ 'COURSE NAME' ] !== undefined ? r[ idx[ 'COURSE NAME' ] ] : '';
				let course = named ? tools.fromName( named ) : null;
				if ( named && ! course ) {
					note( 'error', 'Course "' + named + '" is not in the list of known courses. Its students are shown under that full name; rename the table, and ask for the course to be added to the plugin.' );
					course = named;
				}
				course = course || blockCourse || tools.fromRoll( roll );
				if ( ! course ) {
					note( 'error', 'Roll ' + roll + ': the course could not be worked out. The row was placed in a table called "Unknown course".' );
					course = 'Unknown course';
				}
				const rec = { 'ROLL NO': roll, NAME: idx.NAME !== undefined ? r[ idx.NAME ] : '', SEMESTER: semText, 'COURSE NAME': course };
				cols.forEach( ( [ h, i ] ) => {
					rec[ h ] = r[ i ];
				} );
				if ( ! out.has( course ) ) {
					out.set( course, [] );
				}
				const groups = out.get( course );
				const mine = new Set( subjects( names ) );
				let best = null;
				let score = 0;
				groups.forEach( ( g ) => {
					let sc;
					if ( g.sets.includes( key ) ) {
						sc = 2;
					} else {
						const theirs = new Set( subjects( g.headings ) );
						let both = 0;
						mine.forEach( ( h ) => {
							if ( theirs.has( h ) ) {
								both++;
							}
						} );
						sc = both / Math.max( mine.size + theirs.size - both, 1 );
					}
					if ( sc > score ) {
						best = g;
						score = sc;
					}
				} );
				// Students whose subjects are mostly different (an older syllabus) get their own table.
				if ( ! best || score < 0.5 ) {
					best = { headings: LEAD.slice(), sets: [], rows: [] };
					groups.push( best );
				}
				if ( ! best.sets.includes( key ) ) {
					best.sets.push( key );
					mergeHeadings( best.headings, names );
				}
				best.rows.push( rec );
			} );
		} );

		// Different courses under identical subject headings usually means a heading row was pasted wrongly.
		const okPairs = [ [ 'B.Tech CSE', 'B.Tech IT' ] ].concat( sem && sem <= 2 ? [ [ 'B.Tech ECE', 'B.Tech EE' ] ] : [] );
		const firstUse = {};
		out.forEach( ( groups, course ) => {
			groups.forEach( ( g ) => {
				const k = subjects( g.headings ).join( '|' );
				if ( ! k ) {
					return;
				}
				const other = firstUse[ k ];
				if ( other && other !== course && ! okPairs.some( ( p ) => p.includes( other ) && p.includes( course ) ) ) {
					note( 'error', course + ' and ' + other + ' have exactly the same subject headings. Check that the heading row belongs to each course.' );
				}
				firstUse[ k ] = firstUse[ k ] || course;
			} );
		} );

		const tables = [];
		const rolls = {};
		// Courses always appear in the same order (the order of the plugin's course list); unknown ones go last.
		const rank = ( c ) => {
			const i = courses.findIndex( ( x ) => x.short === c );
			return i < 0 ? courses.length : i;
		};
		const ordered = Array.from( out.entries() ).sort( ( a, b ) => rank( a[ 0 ] ) - rank( b[ 0 ] ) );
		ordered.forEach( ( [ course, groups ] ) => {
			groups.forEach( ( g, gi ) => {
				if ( g.sets.length > 1 ) {
					const all = g.sets.map( ( s ) => s.split( '\u0001' ) );
					const partial = subjects( g.headings ).filter( ( h ) => ! all.every( ( s ) => s.includes( h ) ) );
					note( 'info', course + ': students with different electives were merged into one table. Not taken by everyone: ' + partial.join( ', ' ) + '.' );
				}
				if ( gi > 0 ) {
					note( 'info', course + ': ' + g.rows.length + ' student(s) have a different set of subjects and are in a separate table, "' + course + ' (' + ( gi + 1 ) + ')".' );
				}
				g.rows.forEach( ( r ) => {
					rolls[ r[ 'ROLL NO' ] ] = ( rolls[ r[ 'ROLL NO' ] ] || 0 ) + 1;
				} );
				tables.push( {
					course,
					label: gi === 0 ? course : course + ' (' + ( gi + 1 ) + ')',
					headings: g.headings,
					rows: g.rows.map( ( r ) => g.headings.map( ( h ) => ( r[ h ] === undefined ? '' : r[ h ] ) ) ),
				} );
			} );
		} );
		const dups = Object.keys( rolls ).filter( ( k ) => rolls[ k ] > 1 );
		if ( dups.length ) {
			note( 'error', dups.length + ' roll number(s) appear more than once: ' + dups.slice( 0, 8 ).join( ', ' ) + ( dups.length > 8 ? ' ...' : '' ) );
		}
		return { semester: sem || 0, tables, notes };
	}

	root.BPPIMTResults = root.BPPIMTResults || {};
	Object.assign( root.BPPIMTResults, { normalise, toBlocks, semesterNumber, heading, clean, LEAD } );
} )( typeof window !== 'undefined' ? window : globalThis );
