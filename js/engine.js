/* engine.js — calcolo del report mensile e delle esportazioni */
window.E = (function () {
  'use strict';

  /**
   * Come va letto un movimento a colpo d'occhio. È la stessa classificazione
   * usata dai colori nella tabella, nel PDF e nel foglio Excel.
   *   comune    = entra tutta nelle spese di casa   (verde)
   *   parziale  = entra in parte                    (verde chiaro)
   *   personale = non entra                         (ambra)
   *   esclusa   = fuori dal conteggio               (grigio)
   */
  function classe(m) {
    if (m.escluso) return 'esclusa';
    if (m.importo > 0) return 'entrata';
    const q = Number(m.quota) || 0;
    if (q >= 100) return 'comune';
    if (q > 0) return 'parziale';
    return 'personale';
  }

  const ETICHETTA_CLASSE = {
    comune: 'Spesa comune', parziale: 'In parte comune', personale: 'Personale',
    esclusa: 'Esclusa dal conteggio', entrata: 'Entrata'
  };

  const quotaComune = (m) => (m.escluso || m.importo > 0)
    ? 0 : U.arrotonda(Math.abs(m.importo) * (Number(m.quota) || 0) / 100);

  /** elenco dei mesi presenti in archivio, dal più recente */
  function mesi(stato) {
    const set = new Set(stato.movimenti.map((m) => m.mese).filter(Boolean));
    return [...set].sort().reverse();
  }
  /** elenco dei trimestri presenti in archivio, dal più recente */
  function trimestri(stato) {
    const set = new Set(mesi(stato).map(U.trimestreDiMese));
    return [...set].sort().reverse();
  }
  /** elenco degli anni presenti in archivio, dal più recente */
  function anni(stato) {
    const set = new Set(mesi(stato).map(U.annoDiMese));
    return [...set].sort().reverse();
  }
  /** elenco dei periodi di una data granularità presenti in archivio */
  const periodi = (stato, tipo) => tipo === 'trimestre' ? trimestri(stato) : tipo === 'anno' ? anni(stato) : mesi(stato);

  /**
   * Calcola tutto quello che serve per un periodo: un mese ("2026-07"), un
   * trimestre ("2026-T3") o un anno intero ("2026") — tipo di default 'mese',
   * così ogni chiamata esistente `report(stato, mese)` continua a funzionare
   * senza modifiche. Il resto dell'app (viste, PDF, XLSX, CSV, assistente)
   * legge solo i campi del risultato, senza sapere di che granularità è.
   */
  function report(stato, chiave, tipo) {
    tipo = tipo || 'mese';
    const cfg = stato.config;
    const mesiCoperti = new Set(U.mesiDelPeriodo(tipo, chiave));
    const tutti = stato.movimenti.filter((m) => mesiCoperti.has(m.mese));
    const attivi = tutti.filter((m) => !m.escluso);
    const esclusi = tutti.filter((m) => m.escluso);
    const spese = attivi.filter((m) => m.importo < 0);
    const entrate = attivi.filter((m) => m.importo > 0);

    const totaleComune = U.arrotonda(spese.reduce((s, m) => s + quotaComune(m), 0));
    const totaleSpeso  = U.arrotonda(spese.reduce((s, m) => s + Math.abs(m.importo), 0));
    const totalePersonale = U.arrotonda(totaleSpeso - totaleComune);
    const totaleEntrate = U.arrotonda(entrate.reduce((s, m) => s + m.importo, 0));

    // ripartizione fra i due
    const quotaMia = Number(cfg.quotaMia) || 0;
    const dovutoMio   = U.arrotonda(totaleComune * quotaMia / 100);
    const dovutoAltro = U.arrotonda(totaleComune - dovutoMio);
    const pagatoMio   = U.arrotonda(spese.filter((m) => m.pagatoDa !== 'moglie')
                                        .reduce((s, m) => s + quotaComune(m), 0));
    const pagatoAltro = U.arrotonda(totaleComune - pagatoMio);
    const saldo = U.arrotonda(pagatoMio - dovutoMio);   // >0 => l'altro deve a me

    const perCategoria = raggruppa(spese, (m) => m.categoria || 'Altro');
    const perConto     = raggruppa(spese, (m) => m.conto, stato);
    const perEsercente = raggruppa(spese, (m) => m.esercente || '—').slice(0, 15);
    // andamento mese per mese dentro il periodo (utile per trimestre/anno)
    const perMese = [...mesiCoperti].sort().map((k) => {
      const s = spese.filter((m) => m.mese === k);
      return { mese: k, etichetta: U.meseBreve(k),
               comune: U.arrotonda(s.reduce((x, m) => x + quotaComune(m), 0)),
               totale: U.arrotonda(s.reduce((x, m) => x + Math.abs(m.importo), 0)) };
    });

    // confronto con il periodo precedente (stessa granularità)
    const mesePrec = U.shiftPeriodo(tipo, chiave, -1);
    const mesiCopertiPrec = new Set(U.mesiDelPeriodo(tipo, mesePrec));
    const precSpese = stato.movimenti.filter((m) => mesiCopertiPrec.has(m.mese) && !m.escluso && m.importo < 0);
    const precComune = U.arrotonda(precSpese.reduce((s, m) => s + quotaComune(m), 0));
    const esistePrec = stato.movimenti.some((m) => mesiCopertiPrec.has(m.mese));
    const precPerCat = raggruppa(precSpese, (m) => m.categoria || 'Altro');
    const mappaPrec = new Map(precPerCat.map((c) => [c.nome, c.comune]));
    for (const c of perCategoria) {
      c.precedente = mappaPrec.get(c.nome) || 0;
      c.delta = U.arrotonda(c.comune - c.precedente);
    }

    // cose che meritano un controllo prima di chiudere il periodo
    const daControllare = tutti.filter((m) => !m.bloccato && (
      m.suggerimento ||
      (m.categoria === 'Altro' && Math.abs(m.importo) >= 10) ||
      m.motivoEsclusione === 'contanti-da-assegnare'));

    // le note/promemoria sono sempre scritte su un mese preciso: per un
    // trimestre o un anno si raccolgono quelle di tutti i mesi coperti
    const note = [...mesiCoperti].sort().flatMap((k) =>
      ((stato.note && stato.note[k]) || []).map((n) => Object.assign({ mese: k }, n)));
    const noteDalMesePrec = tipo === 'mese'
      ? ((stato.note && stato.note[mesePrec]) || [])
      : [];

    return {
      mese: chiave, meseLabel: U.periodoLabel(tipo, chiave), mesePrec, esistePrec,
      tipo, periodoBreve: U.periodoBreve(tipo, chiave), etichettaPrec: U.periodoPrecEtichetta(tipo),
      mesiCoperti: [...mesiCoperti].sort(), perMese,
      tutti, attivi, esclusi, spese, entrate,
      totaleComune, totaleSpeso, totalePersonale, totaleEntrate,
      dovutoMio, dovutoAltro, pagatoMio, pagatoAltro, saldo,
      perCategoria, perConto, perEsercente,
      precComune, deltaComune: U.arrotonda(totaleComune - precComune),
      deltaPerc: precComune ? U.arrotonda((totaleComune - precComune) / precComune * 100) : null,
      daControllare,
      nContanti: tutti.filter((m) => m.motivoEsclusione === 'contanti-da-assegnare').length,
      nDuplicati: tutti.filter((m) => m.motivoEsclusione === 'duplicato-carta').length,
      nGiroconti: tutti.filter((m) => m.motivoEsclusione === 'giroconto').length,
      note, noteDalMesePrec,
      config: cfg
    };
  }

  function raggruppa(spese, chiaveFn, stato) {
    const map = new Map();
    for (const m of spese) {
      const k = chiaveFn(m);
      if (!map.has(k)) map.set(k, { nome: k, totale: 0, comune: 0, n: 0, movimenti: [] });
      const g = map.get(k);
      g.totale = U.arrotonda(g.totale + Math.abs(m.importo));
      g.comune = U.arrotonda(g.comune + quotaComune(m));
      g.n++;
      g.movimenti.push(m);
    }
    const out = [...map.values()].sort((a, b) => b.comune - a.comune || b.totale - a.totale);
    if (stato) for (const g of out) g.etichetta = R.contoInfo(g.nome, stato.config.conti).etichetta;
    return out;
  }

  /** frase pronta da leggere: chi deve quanto a chi */
  function fraseSaldo(rep) {
    const c = rep.config;
    if (Math.abs(rep.saldo) < 0.01) return 'Siete in pari.';
    return rep.saldo > 0
      ? `${c.nomeAltro} deve ${U.eur(Math.abs(rep.saldo))} a ${c.nomeMio}`.replace(/\u00A0/g, ' ')
      : `${c.nomeMio} deve ${U.eur(Math.abs(rep.saldo))} a ${c.nomeAltro}`.replace(/\u00A0/g, ' ');
  }

  /**
   * Riassunto testuale del periodo (mese, trimestre o anno) da dare in pasto
   * all'assistente. Contiene solo numeri veri calcolati qui: il modello non
   * deve inventarne.
   */
  function contesto(stato, chiave, tipo) {
    const rep = report(stato, chiave, tipo);
    const c = rep.config;
    const r = [];
    r.push(`Periodo: ${rep.meseLabel}`);
    r.push(`Chi divide: ${c.nomeMio} (${c.quotaMia}%) e ${c.nomeAltro} (${100 - c.quotaMia}%)`);
    r.push(`Totale speso nel mese: ${U.eur(rep.totaleSpeso)}`);
    r.push(`Totale spese in comune: ${U.eur(rep.totaleComune)}`);
    r.push(`Spese non comuni: ${U.eur(rep.totalePersonale)}`);
    r.push(`Quota ${c.nomeMio}: ${U.eur(rep.dovutoMio)} — quota ${c.nomeAltro}: ${U.eur(rep.dovutoAltro)}`);
    r.push(`Già pagati da ${c.nomeMio}: ${U.eur(rep.pagatoMio)} — da ${c.nomeAltro}: ${U.eur(rep.pagatoAltro)}`);
    r.push(`Saldo: ${fraseSaldo(rep)}`);
    r.push(`Movimenti: ${rep.tutti.length}, di cui ${rep.esclusi.length} esclusi ` +
           `(${rep.nDuplicati} doppioni conto/carta, ${rep.nGiroconti} giroconti, ${rep.nContanti} prelievi)`);

    if (rep.esistePrec) {
      r.push(`\nPeriodo precedente (${U.periodoLabel(rep.tipo, rep.mesePrec)}): spese in comune ${U.eur(rep.precComune)} ` +
             `— differenza ${rep.deltaComune > 0 ? '+' : ''}${U.eur(rep.deltaComune)}`);
    } else {
      r.push('\nNon ci sono dati del periodo precedente: non fare confronti con il passato.');
    }

    r.push('\nSpese in comune per categoria (importo in comune, totale speso, numero movimenti' +
           (rep.esistePrec ? ', differenza sul mese prima' : '') + '):');
    for (const x of rep.perCategoria) {
      r.push(`- ${x.nome}: ${U.eur(x.comune)} in comune su ${U.eur(x.totale)} spesi, ${x.n} mov.` +
             (rep.esistePrec ? ` (${x.delta > 0 ? '+' : ''}${U.eur(x.delta)})` : ''));
    }

    r.push('\nPer conto di provenienza:');
    for (const x of rep.perConto) {
      r.push(`- ${x.etichetta}: ${U.eur(x.totale)} spesi, ${U.eur(x.comune)} in comune, ${x.n} mov.`);
    }

    r.push('\nDove si spende di più:');
    for (const x of rep.perEsercente.slice(0, 12)) {
      r.push(`- ${x.nome}: ${U.eur(x.totale)} in ${x.n} volte`);
    }

    const grandi = rep.spese.slice().sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo)).slice(0, 10);
    r.push('\nSpese più grandi del periodo:');
    for (const m of grandi) {
      r.push(`- ${m.data} ${m.esercente}: ${U.eur(Math.abs(m.importo))} (${m.categoria}, ` +
             `quota comune ${m.quota || 0}%)`);
    }

    if (rep.daControllare.length) {
      r.push('\nMovimenti ancora da confermare:');
      for (const m of rep.daControllare.slice(0, 12)) {
        r.push(`- ${m.data} ${m.esercente} ${U.eur(Math.abs(m.importo))}: ${m.suggerimento || m.categoria}`);
      }
    }
    if ((rep.note || []).length) {
      r.push('\nPromemoria scritti per il mese prossimo:');
      for (const n of rep.note) r.push(`- ${n.fatto ? '[fatto] ' : ''}${n.testo}`);
    }
    if ((rep.noteDalMesePrec || []).length) {
      r.push('\nPromemoria arrivati dal mese scorso:');
      for (const n of rep.noteDalMesePrec) r.push(`- ${n.fatto ? '[fatto] ' : ''}${n.testo}`);
    }

    return { testo: r.join('\n'), nomeMio: c.nomeMio, nomeAltro: c.nomeAltro, rep };
  }

  /* ------------------------------ esportazioni ------------------------------ */

  /** ordina come l'estratto conto: per data di addebito, poi per data operazione */
  const ordinaPerAddebito = (a, b) =>
    (a.dataReg || a.data).localeCompare(b.dataReg || b.data) || a.data.localeCompare(b.data);

  function csv(rep) {
    const righe = [['Data operazione', 'Data addebito', 'Descrizione', 'Esercente', 'Categoria', 'Conto', 'Importo',
                    'Quota comune %', 'Quota in comune', 'Pagato da', 'Stato', 'Nota']];
    for (const m of rep.tutti.slice().sort(ordinaPerAddebito)) {
      righe.push([m.data, m.dataReg || m.data, U.pulisci(m.descrizione), m.esercente, m.categoria || '',
        R.contoInfo(m.conto, rep.config.conti).etichetta, U.eurPlain(m.importo),
        m.escluso ? '0' : (m.quota || 0), U.eurPlain(quotaComune(m)),
        m.pagatoDa === 'moglie' ? rep.config.nomeAltro : rep.config.nomeMio,
        m.escluso ? ('escluso: ' + (m.motivoEsclusione || '')) : 'conteggiato', m.nota || '']);
    }
    righe.push([]);
    righe.push(['TOTALE SPESO', '', '', '', '', '', U.eurPlain(-rep.totaleSpeso)]);
    righe.push(['TOTALE IN COMUNE', '', '', '', '', '', '', '', U.eurPlain(rep.totaleComune)]);
    righe.push([`Quota ${rep.config.nomeMio}`, '', '', '', '', '', '', '', U.eurPlain(rep.dovutoMio)]);
    righe.push([`Quota ${rep.config.nomeAltro}`, '', '', '', '', '', '', '', U.eurPlain(rep.dovutoAltro)]);
    righe.push(['SALDO', fraseSaldo(rep)]);
    const testo = righe.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
    return '﻿' + testo;   // BOM: Excel italiano apre il file correttamente
  }

  /** report stampabile: si apre nel browser e si salva in PDF con Cmd+P */
  function html(rep) {
    const c = rep.config;
    const barra = (v, max, col) => `<div class="b"><i style="width:${max ? (v / max * 100) : 0}%;background:${col}"></i></div>`;
    const maxCat = Math.max(...rep.perCategoria.map((x) => x.comune), 1);
    const righeCat = rep.perCategoria.filter((x) => x.comune > 0).map((x) => `
      <tr><td>${R.icona(x.nome)} ${U.escapeHtml(x.nome)}</td>
          <td class="n">${x.n}</td>
          <td class="n">${U.eur(x.comune)}</td>
          <td style="width:34%">${barra(x.comune, maxCat, R.colore(x.nome))}</td>
          <td class="n ${x.delta > 0 ? 'up' : x.delta < 0 ? 'down' : ''}">${
            rep.esistePrec ? (x.delta > 0 ? '+' : '') + U.eur(x.delta) : '—'}</td></tr>`).join('');
    const righeMov = rep.tutti.slice().sort(ordinaPerAddebito).map((m) => `
      <tr class="${m.escluso ? 'esc' : ''}">
        <td class="nowrap">${m.data.slice(8)}/${m.data.slice(5, 7)}</td>
        <td>${U.escapeHtml(U.pulisci(m.descrizione))}${m.nota ? '<br><em>' + U.escapeHtml(m.nota) + '</em>' : ''}</td>
        <td>${U.escapeHtml(m.categoria || '')}</td>
        <td class="nowrap">${U.escapeHtml(R.contoInfo(m.conto, c.conti).etichetta)}</td>
        <td class="n">${U.eur(Math.abs(m.importo))}</td>
        <td class="n">${m.escluso ? '<span class="tag">' + U.escapeHtml(m.motivoEsclusione || 'escluso') + '</span>' : (m.quota || 0) + '%'}</td>
        <td class="n b2">${m.escluso ? '—' : U.eur(quotaComune(m))}</td></tr>`).join('');
    const note = (rep.note || []).map((n) => `<li>${n.fatto ? '☑' : '☐'} ${U.escapeHtml(n.testo)}</li>`).join('');

    return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Spese comuni — ${rep.meseLabel}</title>
<style>
 @page { size: A4; margin: 14mm }
 *{box-sizing:border-box} body{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;margin:0;padding:24px;max-width:1000px}
 h1{font-size:24px;margin:0 0 2px} h2{font-size:15px;margin:26px 0 8px;padding-bottom:5px;border-bottom:2px solid #e4e4e7}
 .sub{color:#71717a;margin-bottom:20px}
 .kpi{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 6px}
 .k{flex:1;min-width:130px;border:1px solid #e4e4e7;border-radius:10px;padding:11px 13px}
 .k b{display:block;font-size:20px;margin-top:3px} .k span{font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.4px}
 .saldo{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:17px;font-weight:600}
 table{width:100%;border-collapse:collapse;margin-top:6px} th{text-align:left;font-size:11px;text-transform:uppercase;color:#71717a;border-bottom:1px solid #d4d4d8;padding:6px 5px}
 td{padding:5px;border-bottom:1px solid #f4f4f5;vertical-align:top} td.n{text-align:right;white-space:nowrap} .b2{font-weight:600}
 .nowrap{white-space:nowrap} em{color:#71717a;font-style:normal;font-size:11px}
 tr.esc td{color:#a1a1aa;text-decoration:line-through} tr.esc .tag{text-decoration:none;display:inline-block;background:#f4f4f5;border-radius:4px;padding:1px 5px;font-size:10px;color:#71717a}
 .b{background:#f4f4f5;border-radius:3px;height:9px;overflow:hidden}.b i{display:block;height:100%}
 .up{color:#dc2626}.down{color:#16a34a}
 ul{margin:6px 0;padding-left:18px} footer{margin-top:28px;color:#a1a1aa;font-size:11px;border-top:1px solid #e4e4e7;padding-top:8px}
</style></head><body>
<h1>Spese comuni — ${rep.meseLabel}</h1>
<div class="sub">${rep.tutti.length} movimenti importati · report generato il ${new Date().toLocaleDateString('it-IT')}</div>
<div class="kpi">
  <div class="k"><span>Totale in comune</span><b>${U.eur(rep.totaleComune)}</b></div>
  <div class="k"><span>Quota ${U.escapeHtml(c.nomeMio)} (${c.quotaMia}%)</span><b>${U.eur(rep.dovutoMio)}</b></div>
  <div class="k"><span>Quota ${U.escapeHtml(c.nomeAltro)} (${100 - c.quotaMia}%)</span><b>${U.eur(rep.dovutoAltro)}</b></div>
  <div class="k"><span>Spese non comuni</span><b>${U.eur(rep.totalePersonale)}</b></div>
</div>
<div class="saldo">${U.escapeHtml(fraseSaldo(rep))}${rep.esistePrec ? ` <span style="font-weight:400;font-size:13px;color:#52525b">· ${rep.etichettaPrec} ${U.eur(rep.precComune)} in comune (${rep.deltaComune > 0 ? '+' : ''}${U.eur(rep.deltaComune)})</span>` : ''}</div>
<h2>Per categoria</h2>
<table><thead><tr><th>Categoria</th><th class="n">Mov.</th><th class="n">In comune</th><th></th><th class="n">vs periodo prec.</th></tr></thead><tbody>${righeCat}</tbody></table>
${note ? `<h2>Promemoria</h2><ul>${note}</ul>` : ''}
<h2>Dettaglio movimenti</h2>
<table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Conto</th><th class="n">Importo</th><th class="n">Quota</th><th class="n">In comune</th></tr></thead><tbody>${righeMov}</tbody></table>
<footer>Esclusi dal conteggio: ${rep.nDuplicati} duplicati carta/conto · ${rep.nGiroconti} giroconti · ${rep.esclusi.length - rep.nDuplicati - rep.nGiroconti} altri.<br>
I movimenti sono ordinati per data di addebito, come sull'estratto conto: la data mostrata è quella dell'operazione, quindi le spese di fine mese precedente compaiono all'inizio.</footer>
</body></html>`;
  }

  /* ============================================= ricerca per soggetto ==== */

  /** elenco di tutti gli esercenti conosciuti in archivio, per l'autocompletamento */
  function esercentiConosciuti(stato) {
    const map = new Map();
    for (const m of stato.movimenti) {
      const nome = m.esercente || U.pulisci(m.descrizione);
      if (!nome) continue;
      map.set(nome, (map.get(nome) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  }

  /**
   * Cerca tutte le entrate e le uscite riguardanti un soggetto (un esercente,
   * o un pezzo del suo nome — "decathlon" trova anche "DECATHLON ITALIA SPA")
   * dentro un periodo, o su tutto l'archivio se il periodo non è specificato.
   * Restituisce entrate e uscite separate, l'andamento mese per mese e
   * l'elenco dei movimenti, così la vista può mostrare tutto senza ricalcolare.
   */
  function cercaSoggetto(stato, testo, periodo) {
    const chiave = U.chiave(testo);
    if (!chiave) return null;

    let ambito = stato.movimenti;
    let mesiCoperti = null;
    if (periodo && periodo.tipo && periodo.chiave) {
      mesiCoperti = new Set(U.mesiDelPeriodo(periodo.tipo, periodo.chiave));
      ambito = ambito.filter((m) => mesiCoperti.has(m.mese));
    }

    const trovati = ambito.filter((m) => {
      const testoMov = U.chiave(m.esercente || '') + U.chiave(m.descrizione || '');
      return testoMov.includes(chiave);
    });
    if (!trovati.length) {
      return { testo, periodo, trovati: [], entrate: { totale: 0, n: 0, movimenti: [] },
               uscite: { totale: 0, n: 0, movimenti: [] }, netto: 0, perMese: [],
               varianti: [], esclusi: 0 };
    }

    const attivi = trovati.filter((m) => !m.escluso);
    const esclusi = trovati.length - attivi.length;
    const uscM = attivi.filter((m) => m.importo < 0);
    const entM = attivi.filter((m) => m.importo > 0);

    const uscite = { totale: U.arrotonda(uscM.reduce((s, m) => s + Math.abs(m.importo), 0)),
                     comune: U.arrotonda(uscM.reduce((s, m) => s + quotaComune(m), 0)),
                     n: uscM.length, movimenti: uscM };
    const entrate = { totale: U.arrotonda(entM.reduce((s, m) => s + m.importo, 0)),
                      n: entM.length, movimenti: entM };
    const netto = U.arrotonda(entrate.totale - uscite.totale);

    // andamento mensile, per il grafico
    const mesiTrovati = [...new Set(trovati.map((m) => m.mese))].sort();
    const perMese = mesiTrovati.map((k) => {
      const inMese = attivi.filter((m) => m.mese === k);
      return {
        mese: k, etichetta: U.meseBreve(k),
        uscite: U.arrotonda(inMese.filter((m) => m.importo < 0).reduce((s, m) => s + Math.abs(m.importo), 0)),
        entrate: U.arrotonda(inMese.filter((m) => m.importo > 0).reduce((s, m) => s + m.importo, 0))
      };
    });

    // se il testo cercato corrisponde a più nomi esercente distinti, li elenchiamo:
    // capita con "decathlon" che trova sia "DECATHLON ITALIA" sia "DECATHLON CASORIA"
    const varianti = [...new Set(trovati.map((m) => m.esercente || U.pulisci(m.descrizione)))]
      .sort((a, b) => a.localeCompare(b));

    return { testo, periodo, trovati, esclusi, entrate, uscite, netto, perMese, varianti,
             primo: mesiTrovati[0], ultimo: mesiTrovati[mesiTrovati.length - 1] };
  }

  /* ================================================== report su misura === */

  /**
   * Filtra tutto l'archivio secondo criteri liberi (non legati a un mese
   * preciso): è il motore dei "report su misura" chiesti all'assistente.
   * criteri = { soggetto, categoria, conto, dataDa, dataA, importoMin,
   *             importoMax, tipo: 'spesa'|'entrata'|'tutti', soloComune,
   *             pagatoDa, titolo }
   * Tutti i campi sono opzionali: senza criteri torna tutto l'archivio.
   */
  function filtraLibero(stato, criteri) {
    criteri = criteri || {};
    let mov = stato.movimenti.slice();

    if (criteri.dataDa) mov = mov.filter((m) => (m.data || '') >= criteri.dataDa);
    if (criteri.dataA) mov = mov.filter((m) => (m.data || '') <= criteri.dataA);

    if (criteri.soggetto) {
      const chiave = U.chiave(criteri.soggetto);
      mov = mov.filter((m) => (U.chiave(m.esercente || '') + U.chiave(m.descrizione || '')).includes(chiave));
    }
    if (criteri.categoria) {
      const c = String(criteri.categoria).toLowerCase();
      mov = mov.filter((m) => (m.categoria || '').toLowerCase().includes(c));
    }
    if (criteri.conto) {
      const c = String(criteri.conto).toLowerCase();
      mov = mov.filter((m) => (m.conto || '').toLowerCase().includes(c) ||
        R.contoInfo(m.conto, stato.config.conti).etichetta.toLowerCase().includes(c));
    }
    if (criteri.pagatoDa) mov = mov.filter((m) => m.pagatoDa === criteri.pagatoDa);

    if (criteri.tipo === 'entrata') mov = mov.filter((m) => m.importo > 0);
    else if (criteri.tipo !== 'tutti') mov = mov.filter((m) => m.importo < 0);

    if (!criteri.conServiziEsclusi) mov = mov.filter((m) => !m.escluso);
    if (criteri.soloComune) mov = mov.filter((m) => (Number(m.quota) || 0) > 0);

    if (criteri.importoMin != null) mov = mov.filter((m) => Math.abs(m.importo) >= Number(criteri.importoMin));
    if (criteri.importoMax != null) mov = mov.filter((m) => Math.abs(m.importo) <= Number(criteri.importoMax));

    mov.sort(ordinaPerAddebito);
    const totale = U.arrotonda(mov.reduce((s, m) => s + Math.abs(m.importo), 0));
    const comune = U.arrotonda(mov.reduce((s, m) => s + quotaComune(m), 0));
    const mesiTrovati = [...new Set(mov.map((m) => m.mese))].sort();

    return {
      criteri, movimenti: mov, n: mov.length, totale, comune,
      primo: mesiTrovati[0] || null, ultimo: mesiTrovati[mesiTrovati.length - 1] || null,
      generato: new Date().toISOString()
    };
  }

  /** frase che riassume i criteri applicati, per il titolo del report e la sua intestazione */
  function descriviCriteri(criteri, config) {
    const pezzi = [];
    if (criteri.soggetto) pezzi.push(`riguardanti "${criteri.soggetto}"`);
    if (criteri.categoria) pezzi.push(`categoria "${criteri.categoria}"`);
    if (criteri.conto) pezzi.push(`conto "${criteri.conto}"`);
    if (criteri.dataDa && criteri.dataA) pezzi.push(`dal ${criteri.dataDa} al ${criteri.dataA}`);
    else if (criteri.dataDa) pezzi.push(`dal ${criteri.dataDa}`);
    else if (criteri.dataA) pezzi.push(`fino al ${criteri.dataA}`);
    if (criteri.importoMin != null) pezzi.push(`almeno ${U.eur(criteri.importoMin)}`);
    if (criteri.importoMax != null) pezzi.push(`fino a ${U.eur(criteri.importoMax)}`);
    if (criteri.tipo === 'entrata') pezzi.push('solo entrate');
    if (criteri.soloComune) pezzi.push('solo spese comuni');
    if (criteri.pagatoDa && config) pezzi.push('pagate da ' + (criteri.pagatoDa === 'moglie' ? config.nomeAltro : config.nomeMio));
    return pezzi.length ? 'Spese ' + pezzi.join(', ') : 'Tutti i movimenti in archivio';
  }

  /* ======================================================== copertura === */

  /**
   * Per ogni conto/carta trovato in archivio, dice quali mesi hanno almeno
   * un movimento e quali no, fra il primo e l'ultimo mese visti in tutto
   * l'archivio. Un mese "buco" — senza movimenti ma con mesi sia prima sia
   * dopo che ne hanno — è quasi sempre un estratto che manca ancora
   * all'importazione, non un mese in cui non è successo nulla: un conto
   * corrente o una carta non stanno mai del tutto fermi per un mese intero.
   * Un mese vuoto a inizio o fine serie invece è normale (il conto non
   * esisteva ancora, o è il mese in corso non ancora concluso) e non viene
   * segnalato.
   */
  function copertura(stato) {
    const tuttiMesi = mesi(stato);
    if (!tuttiMesi.length) return { conti: [], primo: null, ultimo: null, mesi: [] };
    const primo = tuttiMesi[tuttiMesi.length - 1], ultimo = tuttiMesi[0];
    const asseMesi = [];
    for (let k = primo; k <= ultimo; k = U.shiftMese(k, 1)) {
      asseMesi.push(k);
      if (asseMesi.length > 400) break;   // sicurezza anti-loop
    }

    const perConto = new Map();
    for (const m of stato.movimenti) {
      if (!perConto.has(m.conto)) perConto.set(m.conto, new Set());
      perConto.get(m.conto).add(m.mese);
    }

    const conti = [...perConto.entries()].map(([conto, mesiPresenti]) => {
      const primoConto = [...mesiPresenti].sort()[0];
      const ultimoConto = [...mesiPresenti].sort().pop();
      const buchi = asseMesi.filter((k) => k >= primoConto && k <= ultimoConto && !mesiPresenti.has(k));
      return {
        conto, etichetta: R.contoInfo(conto, stato.config.conti).etichetta,
        primo: primoConto, ultimo: ultimoConto, nMesi: mesiPresenti.size, buchi
      };
    }).sort((a, b) => b.buchi.length - a.buchi.length || a.conto.localeCompare(b.conto));

    return { conti, primo, ultimo, mesi: asseMesi };
  }

  return { report, mesi, trimestri, anni, periodi, quotaComune, fraseSaldo, csv, html,
           raggruppa, contesto, classe, ETICHETTA_CLASSE, cercaSoggetto, esercentiConosciuti, copertura,
           filtraLibero, descriviCriteri, ordinaPerAddebito };
})();
