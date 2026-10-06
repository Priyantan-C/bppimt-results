/* "Download Excel": builds the .xlsx file in the visitor's own browser from the tables already on the page.
   Nothing is requested from the server, so downloads add no load to the website. */
( function () {
	'use strict';

	const enc = new TextEncoder();
	const xmlEsc = ( s ) => String( s ).replace( /[^\x09\x0A\x0D\x20-퟿-�]/g, '' ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

	function colName( i ) {
		let s = '';
		for ( i += 1; i > 0; i = Math.floor( ( i - 1 ) / 26 ) ) {
			s = String.fromCharCode( 65 + ( ( i - 1 ) % 26 ) ) + s;
		}
		return s;
	}

	function sheetXml( headings, rows ) {
		const widths = headings.map( ( h, c ) => {
			let w = String( h ).length;
			for ( let r = 0; r < rows.length; r++ ) {
				w = Math.max( w, String( rows[ r ][ c ] || '' ).length );
			}
			return Math.min( Math.max( w + 3, 9 ), 45 );
		} );
		const cell = ( v, r, c, style ) => {
			if ( v === '' || v == null ) {
				return '';
			}
			return '<c r="' + colName( c ) + r + '" t="inlineStr"' + ( style ? ' s="' + style + '"' : '' ) + '><is><t xml:space="preserve">' + xmlEsc( v ) + '</t></is></c>';
		};
		let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
		x += '<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>';
		x += '<cols>' + widths.map( ( w, i ) => '<col min="' + ( i + 1 ) + '" max="' + ( i + 1 ) + '" width="' + w + '" customWidth="1"/>' ).join( '' ) + '</cols>';
		x += '<sheetData><row r="1" ht="24" customHeight="1">' + headings.map( ( h, c ) => cell( h, 1, c, 1 ) ).join( '' ) + '</row>';
		rows.forEach( ( row, i ) => {
			x += '<row r="' + ( i + 2 ) + '">' + row.map( ( v, c ) => cell( v, i + 2, c, c === 1 ? 3 : 2 ) ).join( '' ) + '</row>';
		} );
		return x + '</sheetData></worksheet>';
	}

	const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
		'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF160448"/><bgColor indexed="64"/></patternFill></fill></fills>' +
		'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
		'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
		'<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
		'<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
		'<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
		'<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs>' +
		'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

	function sheetNames( labels ) {
		const used = {};
		return labels.map( ( label ) => {
			const base = ( String( label ).replace( /[\[\]:*?\/\\]/g, ' ' ).replace( /\s+/g, ' ' ).trim() || 'Sheet' ).slice( 0, 31 );
			let name = base;
			for ( let n = 2; used[ name.toLowerCase() ]; n++ ) {
				name = base.slice( 0, 27 ) + ' (' + n + ')';
			}
			used[ name.toLowerCase() ] = true;
			return name;
		} );
	}

	/* ---- zip ---- */
	let crcTable = null;
	function crc32( bytes ) {
		if ( ! crcTable ) {
			crcTable = new Uint32Array( 256 );
			for ( let n = 0; n < 256; n++ ) {
				let c = n;
				for ( let k = 0; k < 8; k++ ) {
					c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
				}
				crcTable[ n ] = c >>> 0;
			}
		}
		let crc = 0xffffffff;
		for ( let i = 0; i < bytes.length; i++ ) {
			crc = crcTable[ ( crc ^ bytes[ i ] ) & 0xff ] ^ ( crc >>> 8 );
		}
		return ( crc ^ 0xffffffff ) >>> 0;
	}

	async function deflate( bytes ) {
		if ( typeof CompressionStream === 'undefined' ) {
			return null;
		}
		try {
			const stream = new Blob( [ bytes ] ).stream().pipeThrough( new CompressionStream( 'deflate-raw' ) );
			return new Uint8Array( await new Response( stream ).arrayBuffer() );
		} catch ( e ) {
			return null; // older browsers: store the file uncompressed instead
		}
	}

	async function zip( files ) {
		const parts = [];
		const central = [];
		let offset = 0;
		for ( const f of files ) {
			const name = enc.encode( f.name );
			const raw = enc.encode( f.text );
			const packed = await deflate( raw ); // eslint-disable-line no-await-in-loop
			const data = packed && packed.length < raw.length ? packed : raw;
			const method = data === raw ? 0 : 8;
			const crc = crc32( raw );
			const head = new DataView( new ArrayBuffer( 30 ) );
			head.setUint32( 0, 0x04034b50, true );
			head.setUint16( 4, 20, true );
			head.setUint16( 6, 0x0800, true );
			head.setUint16( 8, method, true );
			head.setUint16( 10, 0, true );
			head.setUint16( 12, 0x21, true );
			head.setUint32( 14, crc, true );
			head.setUint32( 18, data.length, true );
			head.setUint32( 22, raw.length, true );
			head.setUint16( 26, name.length, true );
			head.setUint16( 28, 0, true );
			parts.push( new Uint8Array( head.buffer ), name, data );
			const cd = new DataView( new ArrayBuffer( 46 ) );
			cd.setUint32( 0, 0x02014b50, true );
			cd.setUint16( 4, 20, true );
			cd.setUint16( 6, 20, true );
			cd.setUint16( 8, 0x0800, true );
			cd.setUint16( 10, method, true );
			cd.setUint16( 12, 0, true );
			cd.setUint16( 14, 0x21, true );
			cd.setUint32( 16, crc, true );
			cd.setUint32( 20, data.length, true );
			cd.setUint32( 24, raw.length, true );
			cd.setUint16( 28, name.length, true );
			cd.setUint32( 42, offset, true );
			central.push( new Uint8Array( cd.buffer ), name );
			offset += 30 + name.length + data.length;
		}
		const cdSize = central.reduce( ( n, p ) => n + p.length, 0 );
		const end = new DataView( new ArrayBuffer( 22 ) );
		end.setUint32( 0, 0x06054b50, true );
		end.setUint16( 8, files.length, true );
		end.setUint16( 10, files.length, true );
		end.setUint32( 12, cdSize, true );
		end.setUint32( 16, offset, true );
		return new Blob( parts.concat( central, [ new Uint8Array( end.buffer ) ] ), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } );
	}

	/** @param {Array<{label:string, headings:string[], rows:string[][]}>} tables */
	async function buildXlsx( tables ) {
		const names = sheetNames( tables.map( ( t ) => t.label ) );
		const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/';
		const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
		const files = [
			{ name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types ' + ns + 'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + tables.map( ( t, i ) => '<Override PartName="/xl/worksheets/sheet' + ( i + 1 ) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' ).join( '' ) + '</Types>' },
			{ name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + 'relationships"><Relationship Id="rId1" Type="' + office + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
			{ name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + office + '"><bookViews><workbookView/></bookViews><sheets>' + names.map( ( n, i ) => '<sheet name="' + xmlEsc( n ) + '" sheetId="' + ( i + 1 ) + '" r:id="rId' + ( i + 1 ) + '"/>' ).join( '' ) + '</sheets></workbook>' },
			{ name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + 'relationships">' + tables.map( ( t, i ) => '<Relationship Id="rId' + ( i + 1 ) + '" Type="' + office + '/worksheet" Target="worksheets/sheet' + ( i + 1 ) + '.xml"/>' ).join( '' ) + '<Relationship Id="rId' + ( tables.length + 1 ) + '" Type="' + office + '/styles" Target="styles.xml"/></Relationships>' },
			{ name: 'xl/styles.xml', text: STYLES },
		];
		tables.forEach( ( t, i ) => files.push( { name: 'xl/worksheets/sheet' + ( i + 1 ) + '.xml', text: sheetXml( t.headings, t.rows ) } ) );
		return zip( files );
	}

	function tablesFromPage( root ) {
		return Array.from( root.querySelectorAll( '.bppimt-results__block' ) ).map( ( block ) => {
			const table = block.querySelector( 'table' );
			const read = ( tr ) => Array.from( tr.children ).map( ( c ) => c.textContent.trim() );
			return {
				label: block.getAttribute( 'data-label' ) || 'Result',
				headings: read( table.tHead.rows[ 0 ] ),
				rows: Array.from( table.tBodies[ 0 ].rows ).map( read ),
			};
		} );
	}

	function init() {
		document.querySelectorAll( '[data-bppimt-results]' ).forEach( ( root ) => {
			const btn = root.querySelector( '.bppimt-results__download' );
			if ( ! btn ) {
				return;
			}
			const label = btn.textContent;
			btn.addEventListener( 'click', async () => {
				btn.disabled = true;
				btn.textContent = 'Preparing…';
				try {
					const blob = await buildXlsx( tablesFromPage( root ) );
					const a = document.createElement( 'a' );
					a.href = URL.createObjectURL( blob );
					a.download = ( btn.getAttribute( 'data-filename' ) || 'results' ) + '.xlsx';
					document.body.appendChild( a );
					a.click();
					a.remove();
					setTimeout( () => URL.revokeObjectURL( a.href ), 60000 );
				} catch ( e ) {
					window.console && console.error( e );
				}
				btn.textContent = label;
				btn.disabled = false;
			} );
		} );
	}

	window.BPPIMTResultsDownload = { buildXlsx };
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
