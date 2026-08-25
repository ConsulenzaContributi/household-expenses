/* report.js — costruisce il report mensile in PDF e in XLSX */
window.REP = (function () {
  'use strict';

  const COLORI = {
    testo: '#1A1D26', tenue: '#6B7488', bordo: '#E0E3EA', linea: '#F1F2F5',
    scuro: '#2B4C7E', verde: '#1E9E62', verdeChiaro: '#D8F5E3', verdePallido: '#EDFBF3',
    ambra: '#B7791F', ambraChiaro: '#FDEBCF', grigio: '#F1F2F5', rosso: '#C53030'
  };
  const SFONDO = { comune: COLORI.verdeChiaro, parziale: COLORI.verdePallido,
                   personale: COLORI.ambraChiaro, esclusa: COLORI.grigio, entrata: '#E8F0FE' };

  const ordina = (a, b) => (a.dataReg || a.data).localeCompare(b.dataReg || b.data) ||
                           a.data.localeCompare(b.data);
  const gg = (d) => d.slice(8) + '/' + d.slice(5, 7);

  /* ============================================================== PDF === */
  function pdf(rep, extra) {
    extra = extra || {};
    const c = rep.config;
    const M = 42, L = PDF.A4.w - M * 2;
    const doc = new PDF.Documento({ margine: M });

    doc.piePagina = (n, tot) => {
      const parti = [];
      parti.push(`0.42 0.45 0.53 rg /FR 8 Tf BT ${M} 28 Td (${'Spese di casa — ' +
        rep.meseLabel.replace(/[()]/g, '')}) Tj ET`);
      parti.push(`BT ${PDF.A4.w - M - PDF.larghezza('Pagina ' + n + ' di ' + tot, 8, false)} 28 Td ` +
        `(Pagina ${n} di ${tot}) Tj ET`);
      parti.push(`0.88 0.89 0.92 RG 0.6 w ${M} 40 m ${PDF.A4.w - M} 40 l S`);
      return parti.join('\n');
    };

    /* ---- testata ---- */
    doc.rett(0, PDF.A4.h - 108, PDF.A4.w, 108, COLORI.scuro);
    doc.testo('Spese di casa', M, PDF.A4.h - 46, { dim: 12, colore: '#A8C4E8' });
    doc.testo(rep.meseLabel.charAt(0).toUpperCase() + rep.meseLabel.slice(1),
      M, PDF.A4.h - 74, { dim: 23, grassetto: true, colore: '#FFFFFF' });
    doc.testo(`${rep.tutti.length} movimenti · report del ${new Date().toLocaleDateString('it-IT')}`,
      M, PDF.A4.h - 92, { dim: 8.5, colore: '#A8C4E8' });
    doc.testo(U.eur(rep.totaleComune), PDF.A4.w - M, PDF.A4.h - 74,
      { dim: 23, grassetto: true, colore: '#FFFFFF', all: 'dx' });
    doc.testo('totale in comune', PDF.A4.w - M, PDF.A4.h - 92,
      { dim: 8.5, colore: '#A8C4E8', all: 'dx' });
    doc.y = PDF.A4.h - 132;

    /* ---- quattro riquadri ---- */
    const personale = c.modalita === 'personale';
    const kpi = personale ? [
      ['Totale speso', U.eur(rep.totaleSpeso), rep.tutti.length + ' movimenti'],
      ['Categorizzato', U.eur(rep.totaleComune), rep.spese.length + ' spese conteggiate'],
      ['Escluso dal conteggio', String(rep.esclusi.length), 'duplicati, giroconti, prelievi'],
      ['Periodo', rep.meseLabel, '']
    ] : [
      ['Quota ' + c.nomeMio, U.eur(rep.dovutoMio), c.quotaMia + '% delle comuni'],
      ['Quota ' + c.nomeAltro, U.eur(rep.dovutoAltro), (100 - c.quotaMia) + '% delle comuni'],
      ['Spese non comuni', U.eur(rep.totalePersonale), 'restano a chi le ha fatte'],
      ['Totale speso', U.eur(rep.totaleSpeso), rep.spese.length + ' spese conteggiate']
    ];
    const lb = (L - 3 * 8) / 4;
    kpi.forEach((k, i) => {
      const x = M + i * (lb + 8);
      doc.rett(x, doc.y - 52, lb, 52, '#F7F8FB');
      doc.testo(k[0].toUpperCase(), x + 9, doc.y - 17, { dim: 6.8, colore: COLORI.tenue, max: lb - 18 });
      doc.testo(k[1], x + 9, doc.y - 34, { dim: 13, grassetto: true, max: lb - 18 });
      doc.testo(k[2], x + 9, doc.y - 45, { dim: 6.8, colore: COLORI.tenue, max: lb - 18 });
    });
    doc.y -= 66;

    /* ---- saldo (solo modalità condivisa: in personale non c'è nessuno a cui dover nulla) ---- */
    if (!personale) {
      const pari = Math.abs(rep.saldo) < 0.01;
      doc.rett(M, doc.y - 40, L, 40, pari ? '#EDFBF3' : COLORI.verdeChiaro);
      doc.testo(E.fraseSaldo(rep), M + 14, doc.y - 18, { dim: 13, grassetto: true, colore: '#12613D' });
      doc.testo(`${c.nomeMio} ha già pagato ${U.eur(rep.pagatoMio)} · ${c.nomeAltro} ${U.eur(rep.pagatoAltro)}` +
        (rep.esistePrec ? ` · ${rep.etichettaPrec} ${U.eur(rep.precComune)} (${rep.deltaComune > 0 ? '+' : ''}${U.eur(rep.deltaComune)})` : ''),
        M + 14, doc.y - 31, { dim: 8, colore: '#2E6B4F', max: L - 28 });
      doc.y -= 56;
    }

    /* ---- commento dell'assistente ---- */
    if (extra.commento) {
      doc.serve(70);
      titolo(doc, 'Il mese in breve', M, L);
      doc.paragrafo(extra.commento, M, L, { dim: 9.5, colore: '#33384A', interlinea: 13.5 });
      doc.y -= 10;
    }

    /* ---- categorie ---- */
    doc.serve(90);
    titolo(doc, 'Spese comuni per categoria', M, L);
    const cats = rep.perCategoria.filter((x) => x.comune > 0);
    const maxC = Math.max(...cats.map((x) => x.comune), 0.01);
    intestazioneTabella(doc, M, L, [
      ['Categoria', 0, 140], ['Mov.', 140, 32, 'dx'], ['In comune', 176, 62, 'dx'],
      ['', 250, 105], ['Totale speso', 362, 62, 'dx'], ['vs periodo prec.', 434, L - 434, 'dx']
    ]);
    for (const x of cats) {
      doc.serve(17);
      const y = doc.y;
      doc.testo(x.nome, M, y, { dim: 9, max: 135 });
      doc.testo(String(x.n), M + 172, y, { dim: 9, all: 'dx', colore: COLORI.tenue });
      doc.testo(U.eur(x.comune), M + 238, y, { dim: 9, all: 'dx', grassetto: true });
      doc.rett(M + 250, y - 1, 100, 5, COLORI.linea);
      doc.rett(M + 250, y - 1, Math.max(1.5, 100 * x.comune / maxC), 5, COLORI.verde);
      doc.testo(U.eur(x.totale), M + 424, y, { dim: 8.5, all: 'dx', colore: COLORI.tenue });
      doc.testo(rep.esistePrec ? (x.delta > 0 ? '+' : '') + U.eur(x.delta) : '—', M + L, y,
        { dim: 8.5, all: 'dx', colore: !rep.esistePrec ? COLORI.tenue : x.delta > 0 ? COLORI.rosso : COLORI.verde });
      doc.y -= 16;
      doc.linea(M, doc.y + 5, M + L, doc.y + 5, COLORI.linea);
    }
    doc.y -= 14;

    /* ---- conti ---- */
    doc.serve(80);
    titolo(doc, 'Da quale conto arrivano', M, L);
    intestazioneTabella(doc, M, L, [
      ['Conto', 0, 220], ['Movimenti', 220, 80, 'dx'], ['Totale speso', 305, 90, 'dx'],
      ['In comune', 400, 111, 'dx']
    ]);
    for (const x of rep.perConto) {
      doc.serve(17);
      const y = doc.y;
      doc.testo(x.etichetta, M, y, { dim: 9, max: 215 });
      doc.testo(String(x.n), M + 295, y, { dim: 9, all: 'dx', colore: COLORI.tenue });
      doc.testo(U.eur(x.totale), M + 390, y, { dim: 9, all: 'dx' });
      doc.testo(U.eur(x.comune), M + L, y, { dim: 9, all: 'dx', grassetto: true, colore: COLORI.verde });
      doc.y -= 16;
      doc.linea(M, doc.y + 5, M + L, doc.y + 5, COLORI.linea);
    }
    doc.y -= 14;

    /* ---- note ---- */
    const note = (rep.note || []).concat((rep.noteDalMesePrec || []).filter((n) => !n.fatto));
    if (note.length) {
      doc.serve(50);
      titolo(doc, 'Promemoria per il mese prossimo', M, L);
      for (const n of note) {
        doc.serve(16);
        doc.casella(M + 1, doc.y - 6, !!n.fatto);
        doc.testo(n.testo, M + 16, doc.y, { dim: 9, max: L - 20, colore: n.fatto ? COLORI.tenue : COLORI.testo });
        doc.y -= 15;
      }
      doc.y -= 12;
    }

    /* ---- dettaglio movimenti ---- */
    doc.nuovaPagina();
    doc.intestazionePagina = (d) => {
      d.testo('Dettaglio movimenti', M, d.y - 4, { dim: 13, grassetto: true });
      d.y -= 26;
      intestazioneTabella(d, M, L, [
        ['Data', 0, 30], ['Descrizione', 30, 178], ['Categoria', 214, 92],
        ['Conto', 306, 86, 'dx'], ['Importo', 392, 46, 'dx'], ['Quota', 442, 30, 'dx'],
        ['In comune', L - 62, 62, 'dx']
      ]);
    };
    doc.intestazionePagina(doc);
    let legenda = false;
    for (const m of rep.tutti.slice().sort(ordina)) {
      if (doc.y - 16 < M + 30) { doc.nuovaPagina(); }
      const cl = E.classe(m);
      const y = doc.y;
      if (cl !== 'personale' || m.conto === 'carta:1234') doc.rett(M - 4, y - 4.5, L + 8, 15, SFONDO[cl]);
      const qc = E.quotaComune(m);
      doc.testo(gg(m.data), M, y, { dim: 8, colore: COLORI.tenue });
      doc.testo(U.pulisci(m.descrizione), M + 30, y, { dim: 8.5, max: 178 });
      doc.testo(m.categoria || '', M + 214, y, { dim: 8, max: 88, colore: COLORI.tenue });
      doc.testo(R.contoInfo(m.conto, c.conti).etichetta, M + 396, y,
        { dim: 8, max: 88, all: 'dx', colore: COLORI.tenue });
      doc.testo(U.eur(Math.abs(m.importo)), M + 438, y, { dim: 8.5, all: 'dx' });
      doc.testo(m.escluso ? '—' : (m.quota || 0) + '%', M + 472, y, { dim: 7.5, all: 'dx', colore: COLORI.tenue });
      doc.testo(m.escluso ? '—' : U.eur(qc), M + L, y,
        { dim: 8.5, all: 'dx', grassetto: qc > 0, colore: qc > 0 ? COLORI.verde : COLORI.tenue });
      doc.y -= 15;
      legenda = true;
    }

    /* ---- legenda ---- */
    doc.serve(60);
    doc.y -= 10;
    if (legenda) {
      const voci = [['comune', 'spesa comune'], ['parziale', 'in parte comune'],
                    ['personale', 'personale / lavoro'], ['esclusa', 'esclusa dal conteggio']];
      let x = M;
      for (const [k, et] of voci) {
        doc.rett(x, doc.y - 1, 16, 8, SFONDO[k]);
        doc.testo(et, x + 21, doc.y, { dim: 7.5, colore: COLORI.tenue });
        x += 26 + PDF.larghezza(et, 7.5, false);
      }
      doc.y -= 16;
    }
    doc.paragrafo(`Esclusi dal conteggio: ${rep.nDuplicati} doppioni fra conto corrente e carte, ` +
      `${rep.nGiroconti} ricariche della prepagata, ${Math.max(0, rep.esclusi.length - rep.nDuplicati - rep.nGiroconti)} altri. ` +
      'I movimenti sono ordinati per data di addebito, come sull\'estratto: la data mostrata è quella dell\'operazione.',
      M, L, { dim: 7.5, colore: COLORI.tenue, interlinea: 11 });

    return doc.blob();
  }

  function titolo(doc, testo, M, L) {
    doc.testo(testo, M, doc.y, { dim: 12, grassetto: true });
    doc.y -= 8;
    doc.linea(M, doc.y, M + L, doc.y, '#CDD2DD', 1);
    doc.y -= 16;
  }

  function intestazioneTabella(doc, M, L, colonne) {
    for (const [et, dx, w, all] of colonne) {
      if (!et) continue;
      const x = all === 'dx' ? M + dx + w - 2 : M + dx;
      doc.testo(et.toUpperCase(), x, doc.y,
        { dim: 6.8, colore: COLORI.tenue, all: all === 'dx' ? 'dx' : 'sx', max: w - 2 });
    }
    doc.y -= 6;
    doc.linea(M, doc.y, M + L, doc.y, '#CDD2DD', 0.8);
    doc.y -= 13;
  }

  /* ============================================================= XLSX === */
  function xlsx(rep, extra) {
    extra = extra || {};
    const c = rep.config, S = XW.S;
    const H = (t) => ({ v: t, s: S.intestazione });

    /* --- foglio 1: riepilogo --- */
    const r1 = [];
    r1.push([{ v: 'Spese di casa — ' + rep.meseLabel, s: S.titolo }]);
    r1.push([{ v: `${rep.tutti.length} movimenti · generato il ` +
      new Date().toLocaleDateString('it-IT'), s: S.normale }]);
    r1.push([]);
    r1.push([{ v: E.fraseSaldo(rep), s: S.sottotitolo }]);
    r1.push([]);
    const kpi = [
      ['Totale speso nel mese', rep.totaleSpeso],
      ['Totale spese in comune', rep.totaleComune],
      ['Spese non comuni', rep.totalePersonale],
      [`Quota ${c.nomeMio} (${c.quotaMia}%)`, rep.dovutoMio],
      [`Quota ${c.nomeAltro} (${100 - c.quotaMia}%)`, rep.dovutoAltro],
      [`Già pagati da ${c.nomeMio}`, rep.pagatoMio],
      [`Già pagati da ${c.nomeAltro}`, rep.pagatoAltro],
      ['Saldo (positivo = ti devono)', rep.saldo]
    ];
    r1.push([H('Voce'), H('Importo')]);
    for (const [et, v] of kpi) r1.push([{ v: et, s: S.etichetta }, { v, s: S.euroGrassetto }]);
    r1.push([]);
    if (extra.commento) {
      r1.push([{ v: 'Il mese in breve', s: S.sottotitolo }]);
      for (const riga of String(extra.commento).split(/\n+/)) r1.push([{ v: riga.trim(), s: S.normale }]);
      r1.push([]);
    }
    r1.push([{ v: 'Per categoria', s: S.sottotitolo }]);
    r1.push([H('Categoria'), H('Movimenti'), H('Totale speso'), H('In comune'),
             H(rep.esistePrec ? 'vs periodo prec.' : '—')]);
    for (const x of rep.perCategoria) {
      r1.push([{ v: x.nome, s: S.normale }, { v: x.n, s: S.normale },
               { v: x.totale, s: S.euro },
               { v: x.comune, s: x.comune > 0 ? S.comuneEuro : S.euro },
               { v: rep.esistePrec ? x.delta : '', s: S.euro }]);
    }
    r1.push([]);
    r1.push([{ v: 'Per conto', s: S.sottotitolo }]);
    r1.push([H('Conto'), H('Movimenti'), H('Totale speso'), H('In comune')]);
    for (const x of rep.perConto) {
      r1.push([{ v: x.etichetta, s: S.normale }, { v: x.n, s: S.normale },
               { v: x.totale, s: S.euro },
               { v: x.comune, s: x.comune > 0 ? S.comuneEuro : S.euro }]);
    }

    /* --- foglio 2: movimenti --- */
    const stiliRiga = {
      comune:    { t: S.comune,    e: S.comuneEuro,    p: S.comunePerc },
      parziale:  { t: S.comune,    e: S.comuneEuro,    p: S.comunePerc },
      personale: { t: S.personale, e: S.personaleEuro, p: S.personalePerc },
      esclusa:   { t: S.esclusa,   e: S.esclusaEuro,   p: S.esclusaPerc },
      entrata:   { t: S.normale,   e: S.euro,          p: S.percento }
    };
    const r2 = [[H('Data operazione'), H('Data addebito'), H('Descrizione'), H('Esercente'),
                 H('Categoria'), H('Conto'), H('Importo'), H('Quota %'), H('In comune'),
                 H('Pagato da'), H('Come viene contata'), H('Nota')]];
    for (const m of rep.tutti.slice().sort(ordina)) {
      const cl = E.classe(m), st = stiliRiga[cl];
      r2.push([
        { v: m.data, s: S.data }, { v: m.dataReg || m.data, s: S.data },
        { v: U.pulisci(m.descrizione), s: st.t }, { v: m.esercente, s: st.t },
        { v: m.categoria || '', s: st.t },
        { v: R.contoInfo(m.conto, c.conti).etichetta, s: st.t },
        { v: Math.abs(m.importo), s: st.e },
        { v: m.escluso ? 0 : (Number(m.quota) || 0), s: st.p },
        { v: E.quotaComune(m), s: st.e },
        { v: m.pagatoDa === 'moglie' ? c.nomeAltro : c.nomeMio, s: st.t },
        { v: m.escluso ? (E.ETICHETTA_CLASSE.esclusa + ' — ' + (m.motivoEsclusione || '')) : E.ETICHETTA_CLASSE[cl], s: st.t },
        { v: m.nota || '', s: st.t }
      ]);
    }
    r2.push([]);
    r2.push([{ v: 'TOTALI', s: S.etichetta }, '', '', '', '', '',
             { v: rep.totaleSpeso, s: S.euroGrassetto }, '',
             { v: rep.totaleComune, s: S.comuneEuro }]);

    /* --- foglio 3: esercenti --- */
    const r3 = [[H('Esercente'), H('Categoria'), H('Volte'), H('Totale speso'), H('In comune'), H('Come viene contata')]];
    for (const x of E.raggruppa(rep.spese, (m) => m.esercente || '—')) {
      const cl = x.comune > 0 ? 'comune' : 'personale';
      const st = stiliRiga[cl];
      r3.push([{ v: x.nome, s: st.t }, { v: x.movimenti[0].categoria || '', s: st.t },
               { v: x.n, s: st.t }, { v: x.totale, s: st.e }, { v: x.comune, s: st.e },
               { v: x.comune > 0 ? 'entra nelle comuni' : 'personale / lavoro', s: st.t }]);
    }

    /* --- foglio 4: note --- */
    const r4 = [[H('Stato'), H('Promemoria'), H('Scritto a')]];
    for (const n of (rep.note || [])) {
      r4.push([{ v: n.fatto ? 'fatto' : 'da fare', s: S.normale },
               { v: n.testo, s: S.normale }, { v: rep.meseLabel, s: S.normale }]);
    }
    for (const n of (rep.noteDalMesePrec || [])) {
      r4.push([{ v: n.fatto ? 'fatto' : 'da fare', s: S.normale },
               { v: n.testo, s: S.normale }, { v: U.meseLabel(rep.mesePrec), s: S.normale }]);
    }
    if (r4.length === 1) r4.push([{ v: '—', s: S.normale }, { v: 'Nessun promemoria per questo mese', s: S.normale }]);

    return XW.crea([
      { nome: 'Riepilogo', righe: r1, larghezze: [34, 15, 15, 15, 15] },
      { nome: 'Movimenti', righe: r2, blocca: 1, filtro: 1,
        larghezze: [15, 15, 46, 28, 20, 20, 12, 9, 12, 12, 26, 30] },
      { nome: 'Esercenti', righe: r3, blocca: 1, filtro: 1, larghezze: [34, 20, 8, 14, 14, 22] },
      { nome: 'Note', righe: r4, blocca: 1, larghezze: [12, 70, 18] }
    ]);
  }

  /* ==================================================== report su misura === */
  /** PDF di un elenco filtrato libero (risultato di E.filtraLibero), non legato a un mese */
  function pdfPersonale(ris, config, descrizione) {
    const M = 42, L = PDF.A4.w - M * 2;
    const doc = new PDF.Documento({ margine: M });

    doc.piePagina = (n, tot) => {
      const parti = [];
      parti.push(`0.42 0.45 0.53 rg /FR 8 Tf BT ${M} 28 Td (Spese di casa — report su misura) Tj ET`);
      parti.push(`BT ${PDF.A4.w - M - PDF.larghezza('Pagina ' + n + ' di ' + tot, 8, false)} 28 Td ` +
        `(Pagina ${n} di ${tot}) Tj ET`);
      parti.push(`0.88 0.89 0.92 RG 0.6 w ${M} 40 m ${PDF.A4.w - M} 40 l S`);
      return parti.join('\n');
    };

    doc.rett(0, PDF.A4.h - 96, PDF.A4.w, 96, COLORI.scuro);
    doc.testo('Spese di casa — report su misura', M, PDF.A4.h - 40, { dim: 11, colore: '#A8C4E8' });
    doc.testo(ris.criteri.titolo || 'Report', M, PDF.A4.h - 66, { dim: 19, grassetto: true, colore: '#FFFFFF', max: L - 170 });
    doc.testo(U.eur(ris.totale), PDF.A4.w - M, PDF.A4.h - 66, { dim: 19, grassetto: true, colore: '#FFFFFF', all: 'dx' });
    doc.testo('totale trovato', PDF.A4.w - M, PDF.A4.h - 82, { dim: 8, colore: '#A8C4E8', all: 'dx' });
    doc.y = PDF.A4.h - 120;

    doc.paragrafo(descrizione + ` — ${ris.n} movimenti trovati` +
      (ris.comune > 0 ? `, di cui ${U.eur(ris.comune)} in comune` : '') +
      ` — generato il ${new Date().toLocaleDateString('it-IT')}`,
      M, L, { dim: 8.5, colore: COLORI.tenue, interlinea: 12 });
    doc.y -= 18;

    doc.intestazionePagina = (d) => {
      intestazioneTabella(d, M, L, [
        ['Data', 0, 30], ['Descrizione', 30, 190], ['Categoria', 220, 92],
        ['Conto', 312, 78, 'dx'], ['Importo', 392, 50, 'dx'], ['In comune', L - 62, 62, 'dx']
      ]);
    };
    doc.intestazionePagina(doc);
    for (const m of ris.movimenti) {
      if (doc.y - 16 < M + 30) doc.nuovaPagina();
      const cl = E.classe(m);
      const y = doc.y;
      if (cl !== 'personale') doc.rett(M - 4, y - 4.5, L + 8, 15, SFONDO[cl]);
      doc.testo(gg(m.data), M, y, { dim: 8, colore: COLORI.tenue });
      doc.testo(U.pulisci(m.descrizione), M + 30, y, { dim: 8.5, max: 188 });
      doc.testo(m.categoria || '', M + 220, y, { dim: 8, max: 90, colore: COLORI.tenue });
      doc.testo(R.contoInfo(m.conto, config.conti).etichetta, M + 388, y,
        { dim: 8, max: 78, all: 'dx', colore: COLORI.tenue });
      doc.testo(U.eur(Math.abs(m.importo)), M + 440, y, { dim: 8.5, all: 'dx' });
      doc.testo(U.eur(E.quotaComune(m)), M + L, y,
        { dim: 8.5, all: 'dx', grassetto: E.quotaComune(m) > 0, colore: E.quotaComune(m) > 0 ? COLORI.verde : COLORI.tenue });
      doc.y -= 15;
    }
    if (!ris.movimenti.length) {
      doc.paragrafo('Nessun movimento trovato con questi criteri.', M, L, { dim: 9.5, colore: COLORI.tenue });
    }
    doc.serve(30);
    doc.y -= 10;
    doc.linea(M, doc.y, M + L, doc.y, '#CDD2DD', 0.8);
    doc.y -= 15;
    doc.testo('TOTALE', M, doc.y, { dim: 9, grassetto: true });
    doc.testo(U.eur(ris.totale), M + L, doc.y, { dim: 9, grassetto: true, all: 'dx' });

    return doc.blob();
  }

  /** XLSX di un elenco filtrato libero */
  function xlsxPersonale(ris, config, descrizione) {
    const S = XW.S, H = (t) => ({ v: t, s: S.intestazione });
    const stiliRiga = {
      comune: { t: S.comune, e: S.comuneEuro }, parziale: { t: S.comune, e: S.comuneEuro },
      personale: { t: S.personale, e: S.personaleEuro }, esclusa: { t: S.esclusa, e: S.esclusaEuro },
      entrata: { t: S.normale, e: S.euro }
    };
    const r1 = [];
    r1.push([{ v: ris.criteri.titolo || 'Report su misura', s: S.titolo }]);
    r1.push([{ v: descrizione, s: S.normale }]);
    r1.push([{ v: `${ris.n} movimenti · generato il ${new Date().toLocaleDateString('it-IT')}`, s: S.normale }]);
    r1.push([]);
    r1.push([H('Data operazione'), H('Data addebito'), H('Descrizione'), H('Esercente'),
             H('Categoria'), H('Conto'), H('Importo'), H('Quota %'), H('In comune'), H('Pagato da')]);
    for (const m of ris.movimenti) {
      const cl = E.classe(m), st = stiliRiga[cl];
      r1.push([
        { v: m.data, s: S.data }, { v: m.dataReg || m.data, s: S.data },
        { v: U.pulisci(m.descrizione), s: st.t }, { v: m.esercente, s: st.t },
        { v: m.categoria || '', s: st.t }, { v: R.contoInfo(m.conto, config.conti).etichetta, s: st.t },
        { v: Math.abs(m.importo), s: st.e }, { v: Number(m.quota) || 0, s: S.normale },
        { v: E.quotaComune(m), s: st.e },
        { v: m.pagatoDa === 'moglie' ? config.nomeAltro : config.nomeMio, s: st.t }
      ]);
    }
    r1.push([]);
    r1.push([{ v: 'TOTALE', s: S.etichetta }, '', '', '', '', '',
             { v: ris.totale, s: S.euroGrassetto }, '', { v: ris.comune, s: S.comuneEuro }]);

    return XW.crea([
      { nome: 'Report', righe: r1, blocca: 5, filtro: 5,
        larghezze: [15, 15, 46, 28, 20, 20, 12, 9, 12, 12] }
    ]);
  }

  return { pdf, xlsx, pdfPersonale, xlsxPersonale, COLORI, SFONDO };
})();
