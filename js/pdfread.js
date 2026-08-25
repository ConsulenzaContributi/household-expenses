/* pdfread.js — lettore di PDF, modulo ES perché pdf.js (Mozilla) è distribuito
 * solo come modulo dalla versione 4. Espone window.PDFR, riempito in modo
 * asincrono: il resto dell'app aspetta PDFR.pronto prima di usarlo.
 *
 * A differenza di xlsxlite.js (che scrive) qui non conveniva reinventare un
 * lettore da zero: un PDF di testo vero richiede di capire font, encoding e
 * CMap per ricostruire le lettere, un problema enormemente più grande di
 * scrivere le nostre pagine. pdf.js è la libreria di riferimento (è il motore
 * di Firefox) e in prova ha estratto il testo dei nostri estratti conto
 * Fineco in modo identico a pdftotext, quindi ce ne fidiamo.
 *
 * Restituisce le righe con le coordinate x di ogni pezzo di testo, non una
 * stringa unica: serve a distinguere la colonna USCITE dalla colonna ENTRATE
 * quando il PDF mette solo un numero senza dire a quale colonna appartiene. */
import * as pdfjsLib from './vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

/**
 * Legge un PDF e restituisce le sue pagine come righe di testo posizionate.
 * pagine: [ { righe: [ { y, items: [{x, s}, ...] } ] } ]
 * Le righe sono ordinate dall'alto in basso, gli item di ogni riga da
 * sinistra a destra.
 */
async function leggiRighe(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
  const pagine = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const perY = new Map();
    for (const it of tc.items) {
      const testo = it.str;
      if (testo === '') continue;
      const x = it.transform[4], y = Math.round(it.transform[5]);
      // pezzi sulla stessa riga ma con y arrotondato diverso di 1-2 punti
      // (capita con apici e caratteri accentati): li unifico sulla y più vicina già vista
      let yy = y;
      for (const ke of perY.keys()) { if (Math.abs(ke - y) <= 2) { yy = ke; break; } }
      if (!perY.has(yy)) perY.set(yy, []);
      perY.get(yy).push({ x, s: testo });
    }
    const righe = [...perY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));
    pagine.push({ righe });
  }
  return { pagine, numPagine: doc.numPages };
}

window.PDFR = { leggiRighe, pronto: true };
document.dispatchEvent(new CustomEvent('pdfr-pronto'));
