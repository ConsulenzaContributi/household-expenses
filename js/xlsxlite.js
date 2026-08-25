/* xlsxlite.js — lettore .xlsx autonomo.
   Serve perché alcune banche esportano file .xlsx con zip "in streaming"
   (dimensioni scritte dopo i dati) che le librerie generiche leggono troncati:
   il risultato sarebbe un estratto conto incompleto senza nessun errore visibile.
   Qui le dimensioni vengono lette dal Central Directory, che è sempre corretto. */
window.XL = (function () {
  'use strict';

  const disponibile = () => typeof DecompressionStream === 'function';

  /* ------------------------------------------------------------- zip ---- */
  async function inflate(bytes, metodo) {
    if (metodo === 0) return bytes;
    if (metodo !== 8) throw new Error('Compressione zip non supportata (metodo ' + metodo + ')');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function apriZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // End Of Central Directory: si cerca all'indietro dalla fine
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('File non valido: non sembra un .xlsx');
    let n = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    if (off === 0xffffffff || n === 0xffff) throw new Error('Archivio ZIP64 non supportato');

    const voci = new Map();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(off + 10, true);
      const csz = dv.getUint32(off + 20, true);
      const usz = dv.getUint32(off + 24, true);
      const nl = dv.getUint16(off + 28, true);
      const el = dv.getUint16(off + 30, true);
      const cl = dv.getUint16(off + 32, true);
      const locale = dv.getUint32(off + 42, true);
      const nome = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl));
      voci.set(nome, { metodo, csz, usz, locale });
      off += 46 + nl + el + cl;
    }

    return {
      ha: (nome) => voci.has(nome),
      nomi: () => [...voci.keys()],
      async testo(nome) {
        const v = voci.get(nome);
        if (!v) return null;
        if (dv.getUint32(v.locale, true) !== 0x04034b50) throw new Error('Voce zip corrotta: ' + nome);
        const nl = dv.getUint16(v.locale + 26, true);
        const el = dv.getUint16(v.locale + 28, true);
        const inizio = v.locale + 30 + nl + el;
        const dati = u8.subarray(inizio, inizio + v.csz);
        const out = await inflate(dati, v.metodo);
        if (v.usz && out.length !== v.usz) {
          throw new Error(`Lettura incompleta di ${nome}: ${out.length} byte invece di ${v.usz}`);
        }
        return new TextDecoder('utf-8').decode(out);
      }
    };
  }

  /* -------------------------------------------------------------- xml --- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const dec = (s) => s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10));
    return ENT[e] != null ? ENT[e] : m;
  });
  const attr = (tag, nome) => {
    const m = tag.match(new RegExp(nome + '="([^"]*)"'));
    return m ? dec(m[1]) : null;
  };
  const testoInterno = (xml) => {
    let s = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
    let m;
    while ((m = re.exec(xml))) s += m[1] != null ? dec(m[1]) : '';
    return s;
  };

  /* ------------------------------------------------------- date Excel --- */
  const FMT_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  function seriale(n) {
    const ms = Math.round((n - 25569) * 86400000);   // 25569 = 1970-01-01
    const d = new Date(ms);
    if (isNaN(d)) return null;
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }

  /* ------------------------------------------------- riferimenti celle -- */
  function colonna(rif) {
    let n = 0;
    for (let i = 0; i < rif.length; i++) {
      const c = rif.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  /* ------------------------------------------------------ lettura xlsx -- */
  async function leggi(arrayBuffer) {
    const zip = apriZip(arrayBuffer);

    // stringhe condivise
    const condivise = [];
    if (zip.ha('xl/sharedStrings.xml')) {
      const xml = await zip.testo('xl/sharedStrings.xml');
      const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
      let m;
      while ((m = re.exec(xml))) condivise.push(m[1] != null ? testoInterno(m[1]) : '');
    }

    // stili: serve solo sapere quali celle sono date
    const stiliData = [];
    if (zip.ha('xl/styles.xml')) {
      const xml = await zip.testo('xl/styles.xml');
      const custom = new Map();
      let m, re = /<numFmt\s[^>]*\/>/g;
      while ((m = re.exec(xml))) {
        const id = +attr(m[0], 'numFmtId');
        const code = attr(m[0], 'formatCode') || '';
        custom.set(id, /[ymdhs]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')));
      }
      const blocco = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
      if (blocco) {
        re = /<xf\s[^>]*?(?:\/>|>)/g;
        while ((m = re.exec(blocco[0]))) {
          const id = +(attr(m[0], 'numFmtId') || 0);
          stiliData.push(FMT_DATA.has(id) || custom.get(id) === true);
        }
      }
    }

    // elenco fogli, in ordine di workbook
    const wb = await zip.testo('xl/workbook.xml');
    const rels = zip.ha('xl/_rels/workbook.xml.rels') ? await zip.testo('xl/_rels/workbook.xml.rels') : '';
    const mappaRel = new Map();
    let m, re = /<Relationship\s[^>]*\/>/g;
    while ((m = re.exec(rels))) mappaRel.set(attr(m[0], 'Id'), attr(m[0], 'Target'));

    const fogli = [];
    re = /<sheet\s[^>]*\/>/g;
    while ((m = re.exec(wb || ''))) {
      const nome = attr(m[0], 'name') || 'Foglio';
      const rid = attr(m[0], 'r:id') || attr(m[0], 'relationshipId');
      let target = mappaRel.get(rid);
      if (!target) continue;
      if (target.startsWith('/')) target = target.slice(1);
      else if (!target.startsWith('xl/')) target = 'xl/' + target;
      if (!zip.ha(target)) continue;
      fogli.push({ nome, righe: parseFoglio(await zip.testo(target), condivise, stiliData) });
    }
    if (!fogli.length) throw new Error('Nessun foglio leggibile nel file');
    return { fogli };
  }

  function parseFoglio(xml, condivise, stiliData) {
    const righe = [];
    const reRiga = /<row(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/row>)/g;
    let mr;
    while ((mr = reRiga.exec(xml))) {
      const attrRiga = mr[1] || '';
      const idx = +(attr(attrRiga, 'r') || righe.length + 1) - 1;
      const celle = [];
      const corpo = mr[2] || '';
      const reCella = /<c(\s[^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let mc, auto = 0;
      while ((mc = reCella.exec(corpo))) {
        const a = mc[1] || '', dentro = mc[2] || '';
        const rif = attr(a, 'r');
        const col = rif ? colonna(rif) : auto;
        auto = col + 1;
        const t = attr(a, 't');
        const s = +(attr(a, 's') || -1);
        let val = '';
        if (t === 'inlineStr') val = testoInterno(dentro);
        else {
          const v = dentro.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
          const grezzo = v ? dec(v[1]) : '';
          if (t === 's') val = condivise[+grezzo] != null ? condivise[+grezzo] : '';
          else if (t === 'str' || t === 'e') val = grezzo;
          else if (t === 'b') val = grezzo === '1' ? 'VERO' : 'FALSO';
          else if (grezzo === '') val = '';
          else {
            const n = parseFloat(grezzo);
            val = isNaN(n) ? grezzo : (stiliData[s] ? (seriale(n) || n) : n);
          }
        }
        celle[col] = val;
      }
      for (let i = 0; i < celle.length; i++) if (celle[i] === undefined) celle[i] = '';
      righe[idx] = celle;
    }
    for (let i = 0; i < righe.length; i++) if (!righe[i]) righe[i] = [];
    return righe;
  }

  return { leggi, disponibile };
})();
