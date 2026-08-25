/* pdf.js — scrittore PDF minimo, senza librerie esterne.
   Usa i font standard del formato PDF (Helvetica), quindi non deve incorporare
   nulla: il file resta piccolo e si apre ovunque. Codifica WinAnsi, che copre
   accenti italiani e simbolo dell'euro. */
window.PDF = (function () {
  'use strict';

  /* ------------------------------------------------- larghezze dei font --
     Larghezze ufficiali AFM dei font Helvetica, per i codici da 32 a 126.
     Servono per allineare a destra e per troncare il testo che non ci sta. */
  const W_REG = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,          // 32-47  spazio ! " # $ % & ' ( ) * + , - . /
    556,556,556,556,556,556,556,556,556,556,                                   // 48-57  0-9
    278,278,584,584,584,556,1015,                                              // 58-64  : ; < = > ? @
    667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,               // 65-79  A-O
    667,778,722,667,611,722,667,944,667,667,611,                               // 80-90  P-Z
    278,278,278,469,556,333,                                                   // 91-96  [ \ ] ^ _ `
    556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,               // 97-111 a-o
    556,556,333,500,278,556,500,722,500,500,500,                               // 112-122 p-z
    334,260,334,584                                                            // 123-126 { | } ~
  ];
  const W_BOLD = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,
    333,333,584,584,584,611,975,
    722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,
    333,278,333,584,556,333,
    556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,
    389,280,389,584
  ];

  function tabella(base) {
    const m = new Array(256).fill(556);
    for (let i = 0; i < base.length; i++) m[32 + i] = base[i];
    // le lettere accentate hanno la stessa larghezza della lettera di base
    const eco = { 0xE0:97,0xE1:97,0xE2:97,0xE3:97,0xE4:97,0xE5:97,0xE6:97,
      0xE8:101,0xE9:101,0xEA:101,0xEB:101,0xEC:105,0xED:105,0xEE:105,0xEF:105,
      0xF2:111,0xF3:111,0xF4:111,0xF5:111,0xF6:111,0xF8:111,
      0xF9:117,0xFA:117,0xFB:117,0xFC:117,0xF1:110,0xE7:99,0xFD:121,0xFF:121,
      0xC0:65,0xC1:65,0xC8:69,0xC9:69,0xCC:73,0xCD:73,0xD2:79,0xD3:79,
      0xD9:85,0xDA:85,0xDC:85,0xC7:67,0xD1:78 };
    for (const k in eco) m[k] = m[eco[k]];
    m[0x80] = m[69];                     // simbolo euro, largo come una E
    m[0xB0] = 400;                       // grado
    m[0xA9] = m[0xAE] = 737;             // © ®
    m[0xA7] = 556; m[0xAB] = m[0xBB] = 556;
    m[0x96] = 556; m[0x97] = 1000;       // trattini lunghi
    m[0x91] = m[0x92] = m[39];
    m[0x93] = m[0x94] = m[34];
    m[0x95] = 350;                       // punto elenco
    m[0xA0] = m[32];                     // spazio unificatore
    return m;
  }
  const LARG = { reg: tabella(W_REG), bold: tabella(W_BOLD) };

  /* -------------------------------------------------- codifica WinAnsi -- */
  const SPECIALI = { 0x20AC:0x80, 0x201A:0x82, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86,
    0x2021:0x87, 0x2030:0x89, 0x2039:0x8B, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93,
    0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97, 0x2122:0x99, 0x203A:0x9B };

  function byteDi(cp) {
    if (cp < 0x80) return cp;
    if (SPECIALI[cp] != null) return SPECIALI[cp];
    if (cp >= 0xA0 && cp <= 0xFF) return cp;
    return 63;                                   // "?"
  }

  /** stringa -> byte WinAnsi, con escape per le parentesi del PDF */
  function testoPdf(s) {
    let out = '';
    // Intl usa lo spazio unificatore prima di "€": alcuni lettori PDF non lo
    // disegnano, quindi lo trasformo in uno spazio normale
    for (const ch of String(s == null ? '' : s).replace(/[\u00A0\u202F\u2009]/g, ' ')) {
      const b = byteDi(ch.codePointAt(0));
      if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
      else if (b < 32) out += ' ';
      else out += String.fromCharCode(b);
    }
    return out;
  }

  function larghezza(s, dim, grassetto) {
    const t = grassetto ? LARG.bold : LARG.reg;
    let w = 0;
    for (const ch of String(s == null ? '' : s).replace(/[\u00A0\u202F\u2009]/g, ' ')) {
      w += t[byteDi(ch.codePointAt(0))] || 556;
    }
    return w * dim / 1000;
  }

  /** taglia il testo aggiungendo "…" se non ci sta nella larghezza data */
  function tronca(s, max, dim, grassetto) {
    s = String(s == null ? '' : s);
    if (larghezza(s, dim, grassetto) <= max) return s;
    let out = s;
    while (out.length > 1 && larghezza(out + '…', dim, grassetto) > max) out = out.slice(0, -1);
    return out + '…';
  }

  /** manda a capo il testo su più righe */
  function aCapo(s, max, dim, grassetto) {
    const parole = String(s || '').split(/\s+/);
    const righe = [];
    let r = '';
    for (const p of parole) {
      const prova = r ? r + ' ' + p : p;
      if (larghezza(prova, dim, grassetto) <= max) r = prova;
      else { if (r) righe.push(r); r = p; }
    }
    if (r) righe.push(r);
    return righe;
  }

  /* ------------------------------------------------------ documento ----- */
  const A4 = { w: 595.28, h: 841.89 };

  function Documento(opz) {
    opz = opz || {};
    this.margine = opz.margine || 42;
    this.pagine = [];
    this.corrente = null;
    this.y = 0;
    this.piePagina = opz.piePagina || null;
    this.nuovaPagina();
  }

  Documento.prototype.nuovaPagina = function () {
    this.corrente = [];
    this.pagine.push(this.corrente);
    this.y = A4.h - this.margine;
    if (this.intestazionePagina) this.intestazionePagina(this);
    return this;
  };

  Documento.prototype.spazio = function (n) { this.y -= n; return this; };

  Documento.prototype.serve = function (h) {
    if (this.y - h < this.margine + 30) this.nuovaPagina();
    return this;
  };

  const col = (c) => {
    const n = parseInt(c.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
      .map((x) => x.toFixed(3)).join(' ');
  };

  Documento.prototype.rett = function (x, y, w, h, colore, raggio) {
    this.corrente.push(`${col(colore)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  };

  Documento.prototype.linea = function (x1, y1, x2, y2, colore, spessore) {
    this.corrente.push(`${col(colore || '#E0E3EA')} RG ${(spessore || 0.6)} w ` +
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  };

  /** scrive testo; allineamento: 'sx' | 'dx' | 'centro' */
  Documento.prototype.testo = function (s, x, y, o) {
    o = o || {};
    const dim = o.dim || 9.5;
    const grassetto = !!o.grassetto;
    let str = String(s == null ? '' : s);
    if (o.max) str = tronca(str, o.max, dim, grassetto);
    let px = x;
    if (o.all === 'dx') px = x - larghezza(str, dim, grassetto);
    else if (o.all === 'centro') px = x - larghezza(str, dim, grassetto) / 2;
    this.corrente.push(`BT ${col(o.colore || '#1A1D26')} rg /${grassetto ? 'FB' : 'FR'} ${dim} Tf ` +
      `${px.toFixed(2)} ${y.toFixed(2)} Td (${testoPdf(str)}) Tj ET`);
    return this;
  };

  /** paragrafo con ritorno a capo automatico */
  Documento.prototype.paragrafo = function (s, x, larg, o) {
    o = o || {};
    const dim = o.dim || 9.5, interlinea = o.interlinea || dim * 1.45;
    for (const riga of aCapo(s, larg, dim, !!o.grassetto)) {
      this.serve(interlinea + 4);
      this.testo(riga, x, this.y, o);
      this.y -= interlinea;
    }
    return this;
  };

  /** casella di spunta disegnata a mano: WinAnsi non ha i simboli adatti */
  Documento.prototype.casella = function (x, y, spuntata) {
    const l = 7.5;
    this.corrente.push(`${spuntata ? '0.118 0.620 0.384' : '0.60 0.63 0.69'} RG 1 w ` +
      `${x} ${y} ${l} ${l} re S`);
    if (spuntata) {
      this.corrente.push(`0.118 0.620 0.384 RG 1.3 w ${x + 1.6} ${y + 3.9} m ` +
        `${x + 3.1} ${y + 2} l ${x + 6} ${y + 5.6} l S`);
    }
    return this;
  };

  Documento.prototype.larghezza = larghezza;

  /* ------------------------------------------------------- costruzione -- */
  Documento.prototype.blob = function () {
    const oggetti = [];
    const aggiungi = (s) => { oggetti.push(s); return oggetti.length; };
    const nPag = this.pagine.length;

    const idFR = 1, idFB = 2;      // riservati sotto
    const idPagine = 3;
    const idsPagina = [], idsCont = [];
    for (let i = 0; i < nPag; i++) { idsPagina.push(4 + i * 2); idsCont.push(5 + i * 2); }
    const idCatalogo = 4 + nPag * 2;

    aggiungi('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    aggiungi('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    aggiungi(`<< /Type /Pages /Count ${nPag} /Kids [${idsPagina.map((i) => i + ' 0 R').join(' ')}] >>`);

    this.pagine.forEach((istruzioni, i) => {
      let flusso = istruzioni.join('\n');
      if (this.piePagina) flusso += '\n' + this.piePagina(i + 1, nPag, this);
      aggiungi(`<< /Type /Page /Parent ${idPagine} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
        `/Resources << /Font << /FR ${idFR} 0 R /FB ${idFB} 0 R >> >> /Contents ${idsCont[i]} 0 R >>`);
      aggiungi({ flusso });
    });
    aggiungi(`<< /Type /Catalog /Pages ${idPagine} 0 R >>`);

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    oggetti.forEach((o, i) => {
      offsets.push(pdf.length);
      if (typeof o === 'object') {
        pdf += `${i + 1} 0 obj\n<< /Length ${o.flusso.length} >>\nstream\n${o.flusso}\nendstream\nendobj\n`;
      } else {
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
      }
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= oggetti.length; i++) {
      pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += `trailer\n<< /Size ${oggetti.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  };

  return { Documento, A4, larghezza, tronca, aCapo };
})();
