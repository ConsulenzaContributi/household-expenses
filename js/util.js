/* util.js — funzioni di base condivise da tutti i moduli */
window.U = (function () {
  'use strict';

  const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                'luglio','agosto','settembre','ottobre','novembre','dicembre'];

  /** "1.234,56" | "-8.27" | 8.27 | Date -> numero (NaN se impossibile) */
  function num(v) {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    let s = String(v).trim().replace(/[€\s ]/g, '');
    // formato italiano: separatore migliaia "." e decimale ","
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  /** Qualunque cosa somigli a una data -> "YYYY-MM-DD" oppure null */
  function iso(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date && !isNaN(v)) return ymd(v);
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    // 28-07-2026-21.03  |  25/07/26  |  1/7/2026
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = (parseInt(y, 10) > 70 ? '19' : '20') + y;
      return `${y}-${p2(mo)}-${p2(d)}`;
    }
    // seriale Excel
    const n = parseFloat(s);
    if (!isNaN(n) && n > 20000 && n < 60000) {
      return ymd(new Date(Date.UTC(1899, 11, 30 + Math.floor(n))));
    }
    return null;
  }

  const p2 = (x) => String(x).padStart(2, '0');
  const ymd = (d) => `${d.getUTCFullYear ? d.getUTCFullYear() : d.getFullYear()}-` +
    p2((d.getUTCMonth ? d.getUTCMonth() : d.getMonth()) + 1) + '-' +
    p2(d.getUTCDate ? d.getUTCDate() : d.getDate());

  const mese = (isoDate) => (isoDate || '').slice(0, 7);          // "2026-07"
  const meseLabel = (k) => {
    if (!k) return '—';
    const [y, m] = k.split('-');
    return `${MESI[parseInt(m, 10) - 1]} ${y}`;
  };
  const meseBreve = (k) => {
    const [y, m] = (k || '').split('-');
    return m ? `${MESI[+m - 1].slice(0, 3)} ${y.slice(2)}` : '—';
  };
  /** mese precedente / successivo in formato "YYYY-MM" */
  function shiftMese(k, delta) {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
  }

  /* --------------------------------------------------- trimestri e anni --- */
  /* Chiave trimestre: "2026-T3". Chiave anno: "2026". Ordinano bene con un
   * semplice sort() alfabetico perché hanno tutte la stessa lunghezza e T1<T4. */

  const trimestreDiMese = (meseKey) => {
    const [y, m] = meseKey.split('-');
    return `${y}-T${Math.ceil(Number(m) / 3)}`;
  };
  const annoDiMese = (meseKey) => (meseKey || '').slice(0, 4);

  const mesiDelTrimestre = (trimKey) => {
    const [y, t] = trimKey.split('-T').map(Number);
    return [0, 1, 2].map((i) => `${y}-${p2((t - 1) * 3 + i + 1)}`);
  };
  const mesiDelAnno = (annoKey) => Array.from({ length: 12 }, (_, i) => `${annoKey}-${p2(i + 1)}`);

  /** elenco dei mesi coperti da un periodo, qualunque sia la sua granularità */
  function mesiDelPeriodo(tipo, chiave) {
    if (tipo === 'trimestre') return mesiDelTrimestre(chiave);
    if (tipo === 'anno') return mesiDelAnno(chiave);
    return [chiave];
  }

  const trimestreLabel = (k) => { const [y, t] = (k || '').split('-T'); return t ? `${t}° trimestre ${y}` : '—'; };
  const trimestreBreve = (k) => { const [y, t] = (k || '').split('-T'); return t ? `T${t} ${y.slice(2)}` : '—'; };
  const annoLabel = (k) => (k ? `Anno ${k}` : '—');

  /** periodo precedente / successivo, qualunque sia la granularità */
  function shiftPeriodo(tipo, chiave, delta) {
    if (tipo === 'trimestre') {
      let [y, t] = chiave.split('-T').map(Number);
      t += delta;
      while (t < 1) { t += 4; y--; }
      while (t > 4) { t -= 4; y++; }
      return `${y}-T${t}`;
    }
    if (tipo === 'anno') return String(Number(chiave) + delta);
    return shiftMese(chiave, delta);
  }

  const periodoLabel = (tipo, chiave) =>
    tipo === 'trimestre' ? trimestreLabel(chiave) : tipo === 'anno' ? annoLabel(chiave) : meseLabel(chiave);
  const periodoBreve = (tipo, chiave) =>
    tipo === 'trimestre' ? trimestreBreve(chiave) : tipo === 'anno' ? String(chiave) : meseBreve(chiave);
  /** "il mese scorso" / "il trimestre scorso" / "l'anno scorso" — per le frasi generate */
  const periodoPrecEtichetta = (tipo) =>
    tipo === 'trimestre' ? 'il trimestre scorso' : tipo === 'anno' ? "l'anno scorso" : 'il mese scorso';

  const eur = (n) => (isNaN(n) ? '—' : new Intl.NumberFormat('it-IT',
    { style: 'currency', currency: 'EUR' }).format(n));
  const eurPlain = (n) => (isNaN(n) ? '' : n.toFixed(2).replace('.', ','));

  /** hash stabile FNV-1a a 32 bit -> stringa base36 */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  /** Testo descrizione ripulito: via code carta, date, doppi spazi */
  function pulisci(desc) {
    return String(desc || '')
      .replace(/Carta\s*N\.?\s*\*+\s*\d+/gi, ' ')
      .replace(/Data\s*oper\w*\s*[\d/.\-: ]*/gi, ' ')
      .replace(/Ora\s*[\d.:]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Nome esercente leggibile per raggruppare (es. "DECO SUPERMERCATI NAPOLI IT" -> "Deco Supermercati") */
  function esercente(desc) {
    let s = pulisci(desc)
      .replace(/\b(IT|NL|IE|LU|DE|FR|ES|GB|US|CA|NY|CH)\b\s*$/i, '')
      .replace(/\b(NAPOLI|MILANO|ROMA|CASERTA|NOLA|CARDITO|DUBLIN|AMSTERDAM|LUXEMBOURG|FALKENSEE|VILLA LITERNO|SAN GIUSEPPE|CASAL DI PRIN|MONTE DI PROC)\b/gi, '')
      .replace(/\*[A-Z0-9]{5,}/g, '')
      .replace(/\b\d{6,}\b/g, '')
      .replace(/[*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) s = pulisci(desc);
    return s.length > 34 ? s.slice(0, 34) : s;
  }

  /** chiave di confronto fra fonti diverse: solo lettere/cifre, maiuscolo */
  const chiave = (s) => pulisci(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

  /** scaricamento "grezzo" nella cartella Download del browser: usato solo
   *  come ripiego quando il server locale non è raggiungibile */
  function scarica(nomeFile, contenuto, mime) {
    const blob = contenuto instanceof Blob ? contenuto
      : new Blob([contenuto], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function blobABase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',').pop());
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  /** nome file pulito: toglie caratteri che sui filesystem danno fastidio */
  const nomePulito = (s) => String(s || '')
    .replace(/[/\\:*?"<>|'’]/g, '').replace(/\s+/g, ' ').trim();

  /**
   * Salva un file dentro archivio/<cartella>/<nomeFile>, scrivendolo dal
   * server locale (server.py) così finisce sempre nel posto giusto con
   * il nome giusto, senza passare dalla finestra "salva con nome" del
   * browser. Se il server non risponde (app aperta come file, o server
   * spento) usa il download normale come ripiego, avvisando l'utente.
   * Ritorna { salvatoSulServer, percorso, sostituito }.
   */
  async function salva(cartella, nomeFile, contenuto, mime) {
    nomeFile = nomePulito(nomeFile);
    const blob = contenuto instanceof Blob ? contenuto
      : new Blob([contenuto], { type: mime || 'application/octet-stream' });

    try {
      const base64 = await blobABase64(blob);
      const r = await fetch('/api/salva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartella: cartella || '', nomeFile, contenutoBase64: base64 })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errore || ('errore ' + r.status));
      return { salvatoSulServer: true, percorso: d.percorso, sostituito: !!d.sostituito };
    } catch (e) {
      scarica(nomeFile, blob);
      return { salvatoSulServer: false, percorso: nomeFile, errore: e.message };
    }
  }

  /** come salva(), ma per i due soli file di catalogo scritti dentro raw/
   *  invece che dentro archivio/ (endpoint separato e più ristretto) */
  async function salvaRaw(nomeFile, contenuto, mime) {
    const blob = contenuto instanceof Blob ? contenuto
      : new Blob([contenuto], { type: mime || 'application/octet-stream' });
    try {
      const base64 = await blobABase64(blob);
      const r = await fetch('/api/salva-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeFile, contenutoBase64: base64 })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errore || ('errore ' + r.status));
      return { salvatoSulServer: true, percorso: d.percorso, sostituito: !!d.sostituito };
    } catch (e) {
      scarica(nomeFile, blob);
      return { salvatoSulServer: false, percorso: nomeFile, errore: e.message };
    }
  }

  const escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const arrotonda = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  return { num, iso, mese, meseLabel, meseBreve, shiftMese, eur, eurPlain, hash,
           pulisci, esercente, chiave, scarica, salva, salvaRaw, nomePulito, escapeHtml,
           arrotonda, MESI, p2,
           trimestreDiMese, annoDiMese, mesiDelTrimestre, mesiDelAnno, mesiDelPeriodo,
           trimestreLabel, trimestreBreve, annoLabel, shiftPeriodo, periodoLabel,
           periodoBreve, periodoPrecEtichetta };
})();
