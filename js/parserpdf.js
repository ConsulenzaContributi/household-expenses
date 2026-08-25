/* parserpdf.js — legge gli estratti conto trimestrali Fineco in PDF.
 *
 * Il documento non è una tabella sola: è un testo a più sezioni — prima il
 * conto corrente ("Movimenti" con colonne USCITE/ENTRATE), poi una sezione
 * per ciascuna carta collegata ("Movimenti Luglio" / "Carta N.: ...1234"
 * con un'unica colonna IMPORTO). Si legge come una macchina a stati: si
 * riconosce l'inizio di ogni sezione dal testo, e da lì si interpretano le
 * righe finché non arriva l'inizio della sezione successiva.
 *
 * Il punto delicato è che nella sezione conto un numero da solo non dice se
 * è un'uscita o un'entrata: lo dice solo la sua posizione orizzontale sulla
 * pagina, rispetto a dove cade la colonna "ENTRATE" nell'intestazione di
 * quella pagina — per questo serve il lettore posizionato di pdfread.js
 * invece di una semplice stringa di testo. */
window.PPDF = (function () {
  'use strict';

  const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const RE_MESE = new RegExp('Movimenti\\s+(' + MESI_IT.join('|') + ')', 'i');

  const RE_DATA = /^(\d{2})[.\/](\d{2})[.\/](\d{2,4})$/;
  function dataIso(s) {
    const m = RE_DATA.exec(String(s || '').trim());
    if (!m) return null;
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 70 ? '19' : '20') + y;
    return `${y}-${mo}-${d}`;
  }

  const RE_IMPORTO = /^[+-]?[\d.]*\d,\d{2}$/;
  function importoNum(s) {
    s = String(s || '').trim();
    if (!RE_IMPORTO.test(s)) return null;
    const neg = s.startsWith('-');
    const n = parseFloat(s.replace(/[+-]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : (neg ? -n : n);
  }

  const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // righe che non sono mai l'inizio di una descrizione (intestazioni ripetute,
  // note di continuità, piè di pagina legale...): se una riga senza data in
  // testa inizia così, non va incollata alla descrizione precedente
  const RE_RUMORE = /^(Totale|PAGINA|Estratto conto|FinecoBank|PEC:|segue a pagina|Servizio Clienti|DATA|Non risultano|SHAREHOLDERS|NUOVI PAESI|INFORMATIVA|PRECISAZIONI|CLASSIFICAZIONE|NOTA\.|Il trasferimento|numero verde|Luned|800\.|02\.2899)/i;

  /**
   * Estrae dalle pagine (formato di PDFR.leggiRighe) i movimenti del conto
   * corrente e di tutte le carte collegate trovate nel documento, più il
   * saldo iniziale/finale stampato sull'estratto, per il controllo di
   * quadratura.
   */
  function estrai(pagine) {
    const movimenti = [];
    let modo = null;             // 'conto' | 'carta' | null
    let entrateX = null;         // soglia colonna ENTRATE nella sezione conto
    let cartaCorrente = null;
    let saldoIniziale = null, saldoFinale = null;
    let ultimoMovimento = null;  // per le righe di descrizione che vanno a capo
    let periodo = null;          // { mesi:[1,2,3], anno:2025 }
    let paginaDichiarata = null; // "PAGINA x DI y" dell'ultima pagina vista

    for (const pagina of pagine) {
      for (const riga of pagina.righe) {
        const items = riga.items.filter((it) => it.s.trim() !== '');
        if (!items.length) continue;
        const prima = items[0].s.trim();
        const testoRiga = items.map((it) => it.s).join(' ');

        if (!periodo) {
          const m = testoRiga.match(/Estratto conto\s*$/i) ? null :
            testoRiga.match(/(Gennaio|Febbraio|Marzo|Aprile|Maggio|Giugno|Luglio|Agosto|Settembre|Ottobre|Novembre|Dicembre)\s*-\s*(\w+)\s*-\s*(\w+)\s+(\d{4})/i);
          if (m) {
            const idx = (nome) => MESI_IT.findIndex((x) => x === nome.toLowerCase()) + 1;
            periodo = { mesi: [idx(m[1]), idx(m[2]), idx(m[3])], anno: +m[4] };
          }
        }
        const mPag = testoRiga.match(/PAGINA\s+(\d+)\s+DI\s+(\d+)/i);
        if (mPag) paginaDichiarata = { n: +mPag[1], di: +mPag[2] };

        // ---- inizio sezione "conto corrente" -------------------------------
        if (/Movimenti/i.test(testoRiga) && /Numero Conto/i.test(testoRiga)) {
          modo = 'conto'; entrateX = null; ultimoMovimento = null;
          continue;
        }
        // intestazione delle colonne della sezione conto: calibra dove cade ENTRATE
        if (entrateX === null) {
          const uUsc = items.find((it) => it.s.trim() === 'USCITE');
          const uEnt = items.find((it) => it.s.trim() === 'ENTRATE');
          if (uUsc && uEnt) { modo = 'conto'; entrateX = uEnt.x; ultimoMovimento = null; continue; }
        }

        // ---- inizio sezione di una carta ------------------------------------
        if (RE_MESE.test(testoRiga)) { modo = 'carta-in-attesa'; ultimoMovimento = null; continue; }
        const mCarta = testoRiga.match(/Carta N\.:\s*[\d*]{4}[\s*]+(\d{4})/);
        if (mCarta) { cartaCorrente = mCarta[1]; modo = 'carta'; ultimoMovimento = null; continue; }

        // ---- saldo iniziale / finale del conto (per la quadratura) --------
        if (/Saldo iniziale in euro/i.test(testoRiga)) {
          const v = items.map((it) => importoNum(it.s)).find((n) => n !== null);
          if (v != null) saldoIniziale = v;
          continue;
        }
        if (/Saldo finale in euro/i.test(testoRiga)) {
          const v = items.map((it) => importoNum(it.s)).find((n) => n !== null);
          if (v != null) saldoFinale = v;
          continue;
        }

        const d1 = dataIso(prima);
        if (!d1) {
          // possibile continuazione della descrizione precedente: è tale solo
          // se comincia dove comincia la colonna descrizione (non a margine
          // sinistro, dove invece cade il testo legale di contorno) e non è
          // una riga "di servizio" nota
          if (ultimoMovimento && items[0].x > 200 && !RE_RUMORE.test(testoRiga)) {
            ultimoMovimento.descrizione += ' ' + pulisci(testoRiga);
          } else {
            ultimoMovimento = null;
          }
          continue;
        }

        if (items.length < 3) { ultimoMovimento = null; continue; }
        const d2 = dataIso(items[1].s);
        if (!d2) { ultimoMovimento = null; continue; }

        if (modo === 'conto' && entrateX !== null) {
          const impItem = items.slice(2).find((it) => importoNum(it.s) !== null);
          if (!impItem) { ultimoMovimento = null; continue; }
          const valore = importoNum(impItem.s);
          const entrata = impItem.x >= entrateX - 15;
          const descrizione = pulisci(items.slice(items.indexOf(impItem) + 1).map((it) => it.s).join(' '));
          if (!descrizione) { ultimoMovimento = null; continue; }
          const mov = { dataOperazione: d1, dataAltra: d2, importo: entrata ? valore : -valore,
                        descrizione, conto: 'conto', fonte: 'conto' };
          movimenti.push(mov);
          ultimoMovimento = mov;
        } else if (modo === 'carta' && cartaCorrente) {
          const ultimo = items[items.length - 1];
          const valore = importoNum(ultimo.s);
          if (valore === null) { ultimoMovimento = null; continue; }
          const descItems = items.slice(2, items.length - 1);
          let descrizione = pulisci(descItems.map((it) => it.s).join(' '));
          if (!descrizione) { ultimoMovimento = null; continue; }
          // l'estratto in .xlsx della stessa carta mette sempre un codice paese
          // in fondo alla descrizione (IT per l'Italia); il PDF lo stampa solo
          // per l'estero. Lo aggiungiamo anche qui quando manca, altrimenti le
          // due fonti scrivono la stessa spesa in modo leggermente diverso e il
          // controllo dei doppioni non le riconosce come lo stesso movimento.
          const ultimoPezzo = descItems.length ? descItems[descItems.length - 1].s.trim() : '';
          if (!/^[A-Za-z]{2}$/.test(ultimoPezzo)) descrizione += ' IT';
          const mov = { dataOperazione: d1, dataAltra: d2, importo: -Math.abs(valore),
                        descrizione, conto: 'carta:' + cartaCorrente, fonte: 'carta' };
          movimenti.push(mov);
          ultimoMovimento = mov;
        } else {
          ultimoMovimento = null;
        }
      }
    }

    return { movimenti, saldoIniziale, saldoFinale, periodo, paginaDichiarata, nPagine: pagine.length };
  }

  return { estrai, dataIso, importoNum };
})();
