/* Reads an .xlsx file in the browser. No libraries: unzip with the built-in DecompressionStream, parse the XML. */
( function ( root ) {
	'use strict';

	async function inflate( bytes ) {
		if ( typeof DecompressionStream === 'undefined' ) {
			throw new Error( 'This browser cannot open Excel files here. Please use a current version of Chrome, Edge, Firefox or Safari.' );
		}
		const stream = new Blob( [ bytes ] ).stream().pipeThrough( new DecompressionStream( 'deflate-raw' ) );
		return new Uint8Array( await new Response( stream ).arrayBuffer() );
	}

	/** Returns { 'path/in/zip': Uint8Array } for the entries whose names pass `want`. */
	async function unzip( buffer, want ) {
		const view = new DataView( buffer );
		const bytes = new Uint8Array( buffer );
		let eocd = -1;
		for ( let i = bytes.length - 22; i >= Math.max( 0, bytes.length - 66000 ); i-- ) {
			if ( view.getUint32( i, true ) === 0x06054b50 ) {
				eocd = i;
				break;
			}
		}
		if ( eocd < 0 ) {
			throw new Error( 'This does not look like an Excel .xlsx file.' );
		}
		const count = view.getUint16( eocd + 10, true );
		let p = view.getUint32( eocd + 16, true );
		const files = {};
		const decoder = new TextDecoder();
		for ( let n = 0; n < count; n++ ) {
			if ( view.getUint32( p, true ) !== 0x02014b50 ) {
				break;
			}
			const method = view.getUint16( p + 10, true );
			const compSize = view.getUint32( p + 20, true );
			const nameLen = view.getUint16( p + 28, true );
			const extraLen = view.getUint16( p + 30, true );
			const commentLen = view.getUint16( p + 32, true );
			const local = view.getUint32( p + 42, true );
			const name = decoder.decode( bytes.subarray( p + 46, p + 46 + nameLen ) );
			p += 46 + nameLen + extraLen + commentLen;
			if ( ! want( name ) ) {
				continue;
			}
			const start = local + 30 + view.getUint16( local + 26, true ) + view.getUint16( local + 28, true );
			const raw = bytes.subarray( start, start + compSize );
			files[ name ] = method === 0 ? raw : await inflate( raw );
		}
		return files;
	}

	function xml( bytes ) {
		const doc = new DOMParser().parseFromString( new TextDecoder().decode( bytes ), 'application/xml' );
		if ( doc.getElementsByTagName( 'parsererror' ).length ) {
			throw new Error( 'The Excel file could not be read (damaged sheet data).' );
		}
		return doc;
	}

	const tags = ( node, name ) => Array.from( node.getElementsByTagNameNS( '*', name ) );

	function text( node ) {
		// All <t> pieces of a string, skipping phonetic hints.
		return tags( node, 't' )
			.filter( ( t ) => ! t.parentNode || t.parentNode.localName !== 'rPh' )
			.map( ( t ) => t.textContent )
			.join( '' );
	}

	function colIndex( ref ) {
		let n = 0;
		for ( let i = 0; i < ref.length; i++ ) {
			const c = ref.charCodeAt( i );
			if ( c < 65 || c > 90 ) {
				break;
			}
			n = n * 26 + ( c - 64 );
		}
		return n - 1;
	}

	function number( v ) {
		const n = Number( v );
		if ( ! isFinite( n ) || v.trim() === '' ) {
			return v;
		}
		return String( parseFloat( n.toPrecision( 12 ) ) );
	}

	/**
	 * @param {ArrayBuffer} buffer
	 * @return {Promise<Array<{name:string, rows:string[][]}>>} every visible sheet, as text.
	 */
	async function readXlsx( buffer ) {
		const files = await unzip( buffer, ( n ) => /^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test( n ) );
		if ( ! files[ 'xl/workbook.xml' ] ) {
			throw new Error( 'This does not look like an Excel .xlsx file. If it is an older .xls file, open it in Excel and save it as .xlsx first.' );
		}
		const shared = files[ 'xl/sharedStrings.xml' ] ? tags( xml( files[ 'xl/sharedStrings.xml' ] ), 'si' ).map( text ) : [];
		const rels = {};
		if ( files[ 'xl/_rels/workbook.xml.rels' ] ) {
			tags( xml( files[ 'xl/_rels/workbook.xml.rels' ] ), 'Relationship' ).forEach( ( r ) => {
				rels[ r.getAttribute( 'Id' ) ] = r.getAttribute( 'Target' ).replace( /^\/?(xl\/)?/, '' );
			} );
		}
		const sheets = [];
		tags( xml( files[ 'xl/workbook.xml' ] ), 'sheet' ).forEach( ( s, i ) => {
			if ( s.getAttribute( 'state' ) === 'hidden' || s.getAttribute( 'state' ) === 'veryHidden' ) {
				return;
			}
			const rid = s.getAttribute( 'r:id' ) || s.getAttributeNS( 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id' );
			const path = 'xl/' + ( rels[ rid ] || 'worksheets/sheet' + ( i + 1 ) + '.xml' );
			if ( ! files[ path ] ) {
				return;
			}
			const rows = [];
			tags( xml( files[ path ] ), 'row' ).forEach( ( rowNode, ri ) => {
				const r = ( parseInt( rowNode.getAttribute( 'r' ), 10 ) || ri + 1 ) - 1;
				const row = [];
				let next = 0;
				tags( rowNode, 'c' ).forEach( ( c ) => {
					const ref = c.getAttribute( 'r' );
					const ci = ref ? colIndex( ref ) : next;
					next = ci + 1;
					const type = c.getAttribute( 't' );
					const vNode = tags( c, 'v' )[ 0 ];
					let value = '';
					if ( type === 'inlineStr' ) {
						value = text( c );
					} else if ( vNode ) {
						const v = vNode.textContent;
						if ( type === 's' ) {
							value = shared[ parseInt( v, 10 ) ] || '';
						} else if ( type === 'str' || type === 'e' ) {
							value = v;
						} else if ( type === 'b' ) {
							value = v === '1' ? 'TRUE' : 'FALSE';
						} else {
							value = number( v );
						}
					}
					row[ ci ] = value;
				} );
				for ( let k = 0; k < row.length; k++ ) {
					if ( row[ k ] === undefined ) {
						row[ k ] = '';
					}
				}
				rows[ r ] = row;
			} );
			for ( let k = 0; k < rows.length; k++ ) {
				if ( ! rows[ k ] ) {
					rows[ k ] = [];
				}
			}
			sheets.push( { name: s.getAttribute( 'name' ) || 'Sheet ' + ( i + 1 ), rows } );
		} );
		if ( ! sheets.length ) {
			throw new Error( 'No sheets were found in this Excel file.' );
		}
		return sheets;
	}

	root.BPPIMTResults = root.BPPIMTResults || {};
	root.BPPIMTResults.readXlsx = readXlsx;
} )( typeof window !== 'undefined' ? window : globalThis );
