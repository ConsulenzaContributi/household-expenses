/* xlsxwrite.js — scrive file .xlsx con formattazione, senza librerie esterne.
   Serve perché il report deve arrivare in Excel già leggibile: intestazioni,
   importi in euro, colonne larghe il giusto e le righe delle spese comuni
   evidenziate in verde come nell'app. */
window.XW = (function () {
  'use strict';

  /* --------------------------------------------------------------- CRC --- */
  const TAB = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TAB[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function comprimi(bytes) {
    if (typeof CompressionStream !== 'function') return { dati: bytes, metodo: 0 };
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const out = new Uint8Array(await new Response(s).arrayBuffer());
      return out.length < bytes.length ? { dati: out, metodo: 8 } : { dati: bytes, metodo: 0 };
    } catch (_) { return { dati: bytes, metodo: 0 }; }
  }

  /* --------------------------------------------------------------- zip --- */
  async function zip(voci) {
    const enc = new TextEncoder();
    const pezzi = [], centrale = [];
    let offset = 0;
    for (const v of voci) {
      const nome = enc.encode(v.nome);
      const grezzo = typeof v.dati === 'string' ? enc.encode(v.dati) : v.dati;
      const { dati, metodo } = await comprimi(grezzo);
      const crc = crc32(grezzo);

      const locale = new Uint8Array(30 + nome.length);
      const dl = new DataView(locale.buffer);
      dl.setUint32(0, 0x04034b50, true); dl.setUint16(4, 20, true);
      dl.setUint16(6, 0, true); dl.setUint16(8, metodo, true);
      dl.setUint16(10, 0, true); dl.setUint16(12, 0x2821, true);   // ora/data fisse
      dl.setUint32(14, crc, true); dl.setUint32(18, dati.length, true);
      dl.setUint32(22, grezzo.length, true); dl.setUint16(26, nome.length, true);
      dl.setUint16(28, 0, true);
      locale.set(nome, 30);
      pezzi.push(locale, dati);

      const cen = new Uint8Array(46 + nome.length);
      const dc = new DataView(cen.buffer);
      dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true);
      dc.setUint16(8, 0, true); dc.setUint16(10, metodo, true);
      dc.setUint16(12, 0, true); dc.setUint16(14, 0x2821, true);
      dc.setUint32(16, crc, true); dc.setUint32(20, dati.length, true);
      dc.setUint32(24, grezzo.length, true); dc.setUint16(28, nome.length, true);
      dc.setUint32(42, offset, true);
      cen.set(nome, 46);
      centrale.push(cen);
      offset += locale.length + dati.length;
    }
    const inizioCen = offset;
    let lunCen = 0;
    for (const c of centrale) { pezzi.push(c); lunCen += c.length; }
    const fine = new Uint8Array(22);
    const df = new DataView(fine.buffer);
    df.setUint32(0, 0x06054b50, true);
    df.setUint16(8, centrale.length, true); df.setUint16(10, centrale.length, true);
    df.setUint32(12, lunCen, true); df.setUint32(16, inizioCen, true);
    pezzi.push(fine);
    return new Blob(pezzi, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* --------------------------------------------------------------- xml --- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  function lettera(n) {
    let s = '';
    n++;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  }

  /** stili disponibili: l'indice corrisponde a cellXfs in stiliXml() */
  const S = {
    normale: 0, intestazione: 1, euro: 2, euroGrassetto: 3, data: 4, titolo: 5,
    comune: 6, comuneEuro: 7, personale: 8, personaleEuro: 9,
    esclusa: 10, esclusaEuro: 11, percento: 12, etichetta: 13, sottotitolo: 14,
    comunePerc: 15, personalePerc: 16, esclusaPerc: 17, kpi: 18
  };

  const stiliXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
 <numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/>
 <numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>
 <numFmt numFmtId="166" formatCode="0&quot;%&quot;"/>
</numFmts>
<fonts count="6">
 <font><sz val="11"/><name val="Calibri"/><color rgb="FF1A1D26"/></font>
 <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
 <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF1A1D26"/></font>
 <font><i/><sz val="11"/><name val="Calibri"/><color rgb="FF9AA3B8"/></font>
 <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF1A1D26"/></font>
 <font><b/><sz val="13"/><name val="Calibri"/><color rgb="FF2B6CB0"/></font>
</fonts>
<fills count="6">
 <fill><patternFill patternType="none"/></fill>
 <fill><patternFill patternType="gray125"/></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF2B4C7E"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFD8F5E3"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFFDEBCF"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFF1F2F5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
 <border><left/><right/><top/><bottom/><diagonal/></border>
 <border><left/><right/><top/><bottom style="thin"><color rgb="FFE0E3EA"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
 <xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
 <xf numFmtId="0"   fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
 <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
 <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
 <xf numFmtId="0"   fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
 <xf numFmtId="0"   fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="0"   fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="0"   fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
 <xf numFmtId="0"   fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
 <xf numFmtId="0"   fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
 <xf numFmtId="166" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="166" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="166" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normale" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  /* ------------------------------------------------------------ foglio --- */
  const GIORNI = (d) => {
    const [y, m, g] = d.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, g) - Date.UTC(1899, 11, 30)) / 86400000);
  };

  /**
   * Una cella può essere:
   *   "testo" | 12.5 | null
   *   { v: valore, s: S.euro, t: 'n'|'s'|'d' }
   */
  function cellaXml(rif, cella) {
    let v = cella, st = 0, tipo = null;
    if (cella && typeof cella === 'object' && !(cella instanceof Date)) {
      v = cella.v; st = cella.s || 0; tipo = cella.t || null;
    }
    if (v === null || v === undefined || v === '') return `<c r="${rif}" s="${st}"/>`;
    if (tipo === 'd' || (typeof v === 'string' && tipo !== 's' && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
      return `<c r="${rif}" s="${st || S.data}"><v>${GIORNI(v)}</v></c>`;
    }
    if (typeof v === 'number' && isFinite(v)) return `<c r="${rif}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${rif}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  function foglioXml(f) {
    const righe = f.righe.map((riga, i) => {
      if (!riga || !riga.length) return `<row r="${i + 1}"/>`;
      const celle = riga.map((c, j) => cellaXml(lettera(j) + (i + 1), c)).join('');
      const h = f.altezze && f.altezze[i] ? ` ht="${f.altezze[i]}" customHeight="1"` : '';
      return `<row r="${i + 1}"${h}>${celle}</row>`;
    }).join('');
    const cols = (f.larghezze || []).map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const nRighe = f.righe.length;
    const nCol = Math.max(1, ...f.righe.map((r) => (r || []).length));
    const dim = `A1:${lettera(nCol - 1)}${Math.max(1, nRighe)}`;
    const blocca = f.blocca
      ? `<sheetView workbookViewId="0"><pane ySplit="${f.blocca}" topLeftCell="A${f.blocca + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
      : '<sheetView workbookViewId="0"/>';
    const filtro = f.filtro
      ? `<autoFilter ref="A${f.filtro}:${lettera(nCol - 1)}${nRighe}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dim}"/><sheetViews>${blocca}</sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? '<cols>' + cols + '</cols>' : ''}
<sheetData>${righe}</sheetData>${filtro}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;
  }

  /* ------------------------------------------------------- costruzione --- */
  /** fogli: [{ nome, righe, larghezze, blocca, filtro }] */
  async function crea(fogli) {
    const n = fogli.length;
    const tipi = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${fogli.map((f, i) =>
  `<sheet name="${esc(f.nome).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    return zip([
      { nome: '[Content_Types].xml', dati: tipi },
      { nome: '_rels/.rels', dati: rels },
      { nome: 'xl/workbook.xml', dati: wb },
      { nome: 'xl/_rels/workbook.xml.rels', dati: wbRels },
      { nome: 'xl/styles.xml', dati: stiliXml() },
      ...fogli.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dati: foglioXml(f) }))
    ]);
  }

  return { crea, S };
})();
