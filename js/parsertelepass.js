/* parsertelepass.js — legge le rendicontazioni Telepass in PDF.
 *
 * Sotto lo stesso nome "fattura" arrivano in realtà tre documenti diversi,
 * ognuno con la sua tabella:
 *   - "AUTOSTRADE PER L'ITALIA" — l'estratto conto dei pedaggi veri e propri
 *   - "TELEPASS S.P.A." con "CANONE TELEPASS" — la fattura del canone
 *     periodico dell'abbonamento: una riga sola, nessun pedaggio
 *   - "TELEPASS S.P.A." con "Rif. Prospetto Riepilogativo" — i parcheggi
 *     pagati col Telepass, elencati come i pedaggi ma su un'unica colonna
 * Si riconosce quale dei tre è guardando poche parole chiave nel testo.
 */
window.PTEL = (function () {
  'use strict';

  const RE_DATA = /^(\d{2})-(\d{2})-(\d{4})$/;
  function dataIso(s) {
    const m = RE_DATA.exec(String(s || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  const RE_IMPORTO = /^[+-]?[\d.]*\d,\d{2}$/;
  function importoNum(s) {
    s = String(s || '').trim();
    if (!RE_IMPORTO.test(s)) return null;
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function testoIntero(pagine) {
    return pagine.map((p) => p.righe.map((r) => r.items.map((it) => it.s).join(' ')).join(' ')).join(' ');
  }

  /** riconosce quale dei tre documenti è, oppure null se non è nessuno dei tre */
  function rileva(pagine) {
    const testo = testoIntero(pagine.slice(0, 1));
    if (/AUTOSTRADE PER L'ITALIA/i.test(testo)) return 'autostrade';
    if (/TELEPASS S\.P\.A\./i.test(testo) && /CANONE TELEPASS/i.test(testo)) return 'canone';
    if (/TELEPASS S\.P\.A\./i.test(testo) && /Rif\.\s*Prospetto Riepilogativo/i.test(testo)) return 'parcheggio';
    return null;
  }

  /** numero e data del documento, per dare un nome leggibile all'importazione */
  function estraiNumeroData(pagine) {
    const testo = testoIntero(pagine.slice(0, 1));
    const m = testo.match(/\d{9,}[A-Z]?\s+del\s+(\d{2})-(\d{2})-(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  function estraiAutostrade(pagine) {
    const movimenti = [];
    let totaleDichiarato = null;
    for (const pagina of pagine) {
      for (const riga of pagina.righe) {
        const items = riga.items.filter((it) => it.s.trim() !== '');
        if (!items.length) continue;
        const testoRiga = items.map((it) => it.s).join(' ');
        const mTot = testoRiga.match(/TOTALE\s*€?\s*([\d.,]+,\d{2})/i) ||
                     testoRiga.match(/TOTALE MOVIMENTI DI PEDAGGIO.*IMPORTO\s*([\d.,]+,\d{2})/i);
        if (mTot) { const v = importoNum(mTot[1]); if (v != null) totaleDichiarato = v; continue; }

        if (items.length < 6) continue;
        const data = dataIso(items[0].s);
        if (!data) continue;
        const ora = items[1].s.trim();
        const valore = importoNum(items[items.length - 1].s);
        if (valore === null) continue;
        const tratta = pulisci(items.slice(3, items.length - 2).map((it) => it.s).join(' '));
        if (!tratta) continue;
        // il segno arriva già corretto dal documento: i pedaggi (SVR "PED") sono
        // stampati positivi, gli sconti (SVR "SCO") negativi — capovolgendolo si
        // ottiene una spesa per i pedaggi e uno storno (positivo) per gli sconti
        movimenti.push({
          data, dataReg: data, importo: -valore,
          descrizione: 'Pedaggio ' + tratta + (ora ? ' (' + ora.slice(0, 5) + ')' : ''),
          tipoOperazione: 'pedaggio', fonte: 'telepass', conto: 'telepass'
        });
      }
    }
    return { movimenti, totaleDichiarato };
  }

  function estraiParcheggio(pagine) {
    const movimenti = [];
    let totaleDichiarato = null;
    for (const pagina of pagine) {
      for (const riga of pagina.righe) {
        const items = riga.items.filter((it) => it.s.trim() !== '');
        if (!items.length) continue;
        const testoRiga = items.map((it) => it.s).join(' ');
        const mTot = testoRiga.match(/^TOTALE\s*€?\s*([\d.,]+,\d{2})/i);
        if (mTot) { const v = importoNum(mTot[1]); if (v != null) totaleDichiarato = v; continue; }

        if (items.length < 3) continue;
        const primaData = dataIso((items[0].s.trim().split(/\s+/)[0] || ''));
        if (!primaData) continue;
        const ora = (items[0].s.trim().match(/(\d{2}:\d{2}:\d{2})/) || [])[1] || '';
        const valore = importoNum(items[items.length - 1].s);
        if (valore === null) continue;
        const descrizione = pulisci(items.slice(1, items.length - 1).map((it) => it.s).join(' '));
        if (!descrizione) continue;
        movimenti.push({
          data: primaData, dataReg: primaData, importo: -Math.abs(valore),
          descrizione: descrizione + (ora ? ' (' + ora.slice(0, 5) + ')' : ''),
          tipoOperazione: 'parcheggio', fonte: 'telepass', conto: 'telepass'
        });
      }
    }
    return { movimenti, totaleDichiarato };
  }

  function estraiCanone(pagine) {
    const testo = testoIntero(pagine);
    const data = estraiNumeroData(pagine);
    const mTot = testo.match(/TOTALE FATTURA\s*€?\s*([\d.,]+,\d{2})/i);
    const valore = mTot ? importoNum(mTot[1]) : null;
    if (!data || valore === null) return { movimenti: [], totaleDichiarato: null };
    return {
      movimenti: [{
        data, dataReg: data, importo: -Math.abs(valore),
        descrizione: 'Canone Telepass',
        tipoOperazione: 'canone', fonte: 'telepass', conto: 'telepass'
      }],
      totaleDichiarato: valore
    };
  }

  function estrai(pagine, tipo) {
    const r = tipo === 'autostrade' ? estraiAutostrade(pagine)
      : tipo === 'parcheggio' ? estraiParcheggio(pagine)
      : tipo === 'canone' ? estraiCanone(pagine)
      : { movimenti: [], totaleDichiarato: null };
    r.data = estraiNumeroData(pagine);
    return r;
  }

  return { rileva, estrai };
})();
