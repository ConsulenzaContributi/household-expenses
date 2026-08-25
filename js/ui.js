/* ui.js — tutte le viste dell'applicazione */
window.V = (function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const h = U.escapeHtml;

  const TABS = [
    { id: 'riepilogo', et: 'Riepilogo' },
    { id: 'movimenti', et: 'Movimenti' },
    { id: 'categorie', et: 'Categorie' },
    { id: 'soggetti',  et: 'Soggetti' },
    { id: 'note',      et: 'Note' },
    { id: 'importa',   et: 'Importa' },
    { id: 'regole',    et: 'Regole' },
    { id: 'guida',     et: 'Guida' }
  ];
  /** schede che restano sempre ancorate al mese in corso, anche quando la
   *  sidebar sta mostrando un recap per trimestre o per anno */
  const TAB_SOLO_MESE = new Set(['note']);

  /* =========================================================== toast ==== */
  /**
   * Messaggio in basso. `azione`, se passata, aggiunge un pulsante dentro
   * al toast (es. "Apri nel Finder" dopo aver salvato un file): in quel
   * caso il toast resta a video più a lungo, e in pausa mentre ci passi
   * sopra il mouse, così fai in tempo a cliccare.
   * azione = { testo, onClick }
   */
  function toast(msg, tipo, azione) {
    const d = document.createElement('div');
    d.className = 'toast ' + (tipo || '');
    const testo = document.createElement('span');
    testo.textContent = msg;
    d.appendChild(testo);
    if (azione) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-azione';
      b.textContent = azione.testo;
      b.addEventListener('click', (e) => { e.stopPropagation(); chiudi(); azione.onClick(); });
      d.appendChild(b);
    }
    $('#toast').appendChild(d);

    const durata = azione ? 7000 : 3000;
    let timer;
    const chiudi = () => { clearTimeout(timer); d.style.opacity = '0'; d.style.transition = '.3s';
      setTimeout(() => d.remove(), 350); };
    const avvia = () => { timer = setTimeout(chiudi, durata); };
    if (azione) {
      d.addEventListener('mouseenter', () => clearTimeout(timer));
      d.addEventListener('mouseleave', avvia);
    }
    avvia();
    return d;
  }

  /* ========================================================== modale ==== */
  function modale(titolo, corpo, azioni) {
    const v = document.createElement('div');
    v.className = 'velo';
    v.innerHTML = `<div class="modale"><h3>${h(titolo)}</h3><div class="body">${corpo}</div>
      <div class="foot">${azioni.map((a, i) =>
        `<button class="btn ${a.pri ? 'pri' : ''}" data-az="${i}">${h(a.et)}</button>`).join('')}</div></div>`;
    v.addEventListener('click', (e) => {
      if (e.target === v) v.remove();
      const b = e.target.closest('[data-az]');
      if (b) { const a = azioni[+b.dataset.az]; if (!a.fn || a.fn(v) !== false) v.remove(); }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { v.remove(); document.removeEventListener('keydown', esc); }
    });
    $('#modali').appendChild(v);
    const primo = v.querySelector('input,select,textarea');
    if (primo) primo.focus();
    return v;
  }

  /* ==================================================== render globale == */
  function render(A) {
    if (!A.periodo) A.periodo = { tipo: 'mese', chiave: A.mese };
    renderPeriodi(A);
    renderSelPeriodo(A);

    const rep = A.periodo.chiave ? E.report(A.stato, A.periodo.chiave, A.periodo.tipo) : null;
    const repMese = A.mese ? E.report(A.stato, A.mese, 'mese') : null;
    renderPannelloAssistente(A, repMese);
    const nDa = repMese ? repMese.daControllare.length : 0;
    $('#tabs').innerHTML = TABS.map((t) =>
      `<button class="tab ${A.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.et}${
        t.id === 'movimenti' && nDa ? `<span class="pill">${nDa}</span>` : ''}</button>`).join('');

    if (!A.stato.movimenti.length) {
      $('#vista').innerHTML = A.tab === 'guida' ? vGuida(null, A) : vistaBenvenuto();
      return;
    }

    // "Soggetti" non dipende da un rep: cerca su misura, in qualunque intervallo
    if (A.tab === 'soggetti') {
      $('#vista').innerHTML = vSoggetti(A);
      A.repCorrente = rep; A.repMeseCorrente = repMese;
      return;
    }

    const repVista = TAB_SOLO_MESE.has(A.tab) ? repMese : rep;
    if (!repVista) { $('#vista').innerHTML = vistaVuoto('Nessun periodo selezionato.'); return; }

    const viste = { riepilogo: vRiepilogo, movimenti: vMovimenti, categorie: vCategorie,
                    note: vNote, importa: vImporta, regole: vRegole, guida: vGuida };
    $('#vista').innerHTML = (viste[A.tab] || vRiepilogo)(repVista, A);
    A.repCorrente = rep;
    A.repMeseCorrente = repMese;
  }

  /** sidebar: interruttore di granularità + elenco dei periodi corrispondenti */
  function renderPeriodi(A) {
    const sw = $('#granSwitch');
    if (sw) $$('button', sw).forEach((b) => b.classList.toggle('on', b.dataset.gran === A.periodo.tipo));

    const elenco = E.periodi(A.stato, A.periodo.tipo);
    if (!elenco.length) {
      $('#listaMesi').innerHTML = '<div class="vuoto-side">Nessun mese in archivio.<br>Importa il primo estratto conto per iniziare.</div>';
      return;
    }
    $('#listaMesi').innerHTML = elenco.map((k) => {
      const r = E.report(A.stato, k, A.periodo.tipo);
      return `<button class="mese-i ${k === A.periodo.chiave ? 'on' : ''}" data-periodo="${k}">
        <b>${h(U.periodoLabel(A.periodo.tipo, k))}</b><span>${U.eur(r.totaleComune)} in comune</span></button>`;
    }).join('');
  }

  function renderSelPeriodo(A) {
    const elenco = E.periodi(A.stato, A.periodo.tipo);
    $('#selPeriodo').innerHTML = elenco.length
      ? elenco.map((k) => `<option value="${k}" ${k === A.periodo.chiave ? 'selected' : ''}>${
          h(U.periodoLabel(A.periodo.tipo, k))}</option>`).join('')
      : '<option>— nessun periodo —</option>';
  }

  /* ======================================================== benvenuto === */
  function vistaBenvenuto() {
    return `<div class="vuoto card" style="padding:44px 30px">
      <span class="em">🏠</span>
      <h3>Benvenuto — iniziamo dal primo mese</h3>
      <p class="muto" style="max-width:520px;margin:8px auto 20px;line-height:1.65">
        Trascina qui gli estratti conto del mese (carta condivisa, carta personale, conto corrente, Telepass):
        l'app riconosce da sola il formato, toglie i doppioni fra conto e carta, assegna le categorie
        e calcola quanto spetta a ciascuno.</p>
      <div class="riga" style="justify-content:center">
        <button class="btn pri" data-azione="scansiona-raw" style="font-size:14px;padding:10px 20px">🔄 Leggi tutto dalla cartella raw/</button>
        <button class="btn" data-azione="apri-file" style="font-size:14px;padding:10px 20px">Scegli i file a mano</button>
      </div>
      <p class="mini muto" style="margin-top:14px">Formati letti: <b>.xlsx</b>, <b>.xls</b> e <b>.pdf</b> — estratto carta, movimenti conto corrente, movimenti Telepass, estratto conto Fineco trimestrale.<br>
      Tutto resta sul tuo computer: nessun dato viene inviato online.</p>
    </div>`;
  }

  const vistaVuoto = (t) => `<div class="vuoto"><span class="em">📭</span><h3>${h(t)}</h3></div>`;

  /* ======================================================== riepilogo === */
  function vRiepilogo(rep, A) {
    const c = rep.config;
    const parola = rep.tipo === 'trimestre' ? 'trimestre' : rep.tipo === 'anno' ? 'anno' : 'mese';
    const delta = rep.esistePrec
      ? `<span class="${rep.deltaComune > 0 ? 'su' : 'giu'}">${rep.deltaComune > 0 ? '▲' : '▼'} ${
          U.eur(Math.abs(rep.deltaComune))}</span> vs ${U.periodoBreve(rep.tipo, rep.mesePrec)}`
      : `primo ${rep.tipo} in archivio`;

    const avvisi = [];
    if (rep.nDuplicati) avvisi.push(['info', '🔁',
      `<b>${rep.nDuplicati} movimenti</b> del conto corrente sono la copia di operazioni già presenti negli estratti carta: li ho esclusi per non contarli due volte.`]);
    if (rep.nGiroconti) avvisi.push(['info', '💳',
      `<b>${rep.nGiroconti} ricariche</b> della carta prepagata escluse dal conteggio: la spesa reale è quella dell'estratto carta.`]);
    if (rep.nContanti) avvisi.push(['warn', '💵',
      `Hai <b>${rep.nContanti} prelievi in contanti</b> in questo ${parola}. Se parte di quel contante è spesa comune, aggiungila con <b>＋ Spesa</b>.`]);
    if (rep.daControllare.length) avvisi.push(['warn', '🔍',
      `<b>${rep.daControllare.length} movimenti</b> da controllare (categoria o quota da confermare). <a href="#" data-azione="vai-controlli">Aprili →</a>`]);
    if (rep.noteDalMesePrec.filter((n) => !n.fatto).length) avvisi.push(['info', '📌',
      `Hai <b>${rep.noteDalMesePrec.filter((n) => !n.fatto).length} promemoria</b> lasciati a ${U.meseBreve(rep.mesePrec)} per questo mese. <a href="#" data-azione="vai-note">Vedili →</a>`]);

    const maxCat = Math.max(...rep.perCategoria.map((x) => x.comune), 0.01);
    const cat = rep.perCategoria.filter((x) => x.comune > 0).map((x) => `
      <div class="catrow" data-filtra-cat="${h(x.nome)}">
        <div style="font-size:15px">${R.icona(x.nome)}</div>
        <div><div class="nm">${h(x.nome)} <span class="mini muto">· ${x.n} mov.</span></div>
             <div class="bar"><i style="width:${x.comune / maxCat * 100}%;background:${R.colore(x.nome)}"></i></div></div>
        <div class="im">${U.eur(x.comune)}</div>
        <div class="dl ${x.delta > 0 ? 'su' : x.delta < 0 ? 'giu' : 'muto'}">${
          rep.esistePrec ? (x.delta > 0 ? '+' : '') + U.eurPlain(x.delta) + ' €' : ''}</div>
      </div>`).join('') || `<p class="muto mini">Nessuna spesa comune in questo ${parola}.</p>`;

    const conti = rep.perConto.map((x) => `
      <div class="catrow" data-filtra-conto="${h(x.nome)}">
        <div style="font-size:15px">${x.nome.startsWith('carta') ? '💳' : x.nome === 'telepass' ? '🛣️' : x.nome === 'contanti' ? '💵' : '🏦'}</div>
        <div><div class="nm">${h(x.etichetta)}</div>
             <div class="mini muto">${x.n} movimenti · ${U.eur(x.totale)} spesi in totale</div></div>
        <div class="im">${U.eur(x.comune)}</div><div></div>
      </div>`).join('');

    const top = rep.perEsercente.slice(0, 8).map((x) => {
      // percentuale media divisa fra le spese comuni: quanto di quello che si è speso lì torna nel conto comune
      const pct = x.totale > 0 ? Math.round(x.comune / x.totale * 100) : 0;
      const classe = pct === 0 ? 'esclusa' : pct === 100 ? 'comune' : 'parziale';
      return `
      <div class="catrow" data-cerca="${h(x.nome)}">
        <div style="font-size:14px">${R.icona(x.movimenti[0].categoria)}</div>
        <div><div class="nm">${h(x.nome)}</div><div class="mini muto">${x.n} volte</div></div>
        <div class="im">${U.eur(x.totale)}</div>
        <span class="quota-pill q-${classe}" data-tip="Quota comune|Di quanto speso da ${h(x.nome)}, il ${pct}% finisce nelle spese da dividere; il resto è personale o escluso.">${pct}%</span>
      </div>`;
    }).join('');

    const personale = c.modalita === 'personale';
    const kpis = personale ? `
    <div class="kpis">
      <div class="kpi big"><div class="et">Totale speso</div>
        <div class="v">${U.eur(rep.totaleSpeso)}</div><div class="d">${delta}</div></div>
      <div class="kpi"><div class="et">Spese categorizzate</div>
        <div class="v">${U.eur(rep.totaleComune)}</div><div class="d">${rep.spese.length} spese conteggiate</div></div>
      <div class="kpi"><div class="et">Escluse dal conteggio</div>
        <div class="v">${rep.esclusi.length}</div><div class="d">duplicati, giroconti, prelievi</div></div>
      <div class="kpi"><div class="et">Movimenti</div>
        <div class="v">${rep.tutti.length}</div><div class="d">nel ${parola}</div></div>
    </div>
    <div class="saldo-box" style="margin-top:14px">
      <div class="ic">🗂️</div>
      <div class="t"><b>Rendicontazione ${h(parola)} pronta</b>
        <span>${rep.tutti.length} movimenti · ${rep.esclusi.length} esclusi dal conteggio · ${rep.spese.length} spese conteggiate</span></div>
      <div class="riga">
        <button class="btn pri" data-azione="report-pdf" data-tip="Report in PDF|Documento completo del periodo, pronto da stampare o archiviare.">📄 PDF</button>
        <button class="btn" data-azione="report-xlsx" data-tip="Report in Excel|Cartella .xlsx con i fogli Riepilogo, Movimenti, Esercenti, Note.">📗 XLSX</button>
        <button class="btn gh" data-azione="report-html" data-tip="Anteprima da stampare|Apre il report nel browser: da lì [Cmd+P] per stampare.">🖨</button>
        <button class="btn gh" data-azione="export-csv" data-tip="Esporta CSV|Solo l'elenco dei movimenti, pronto per Excel o Numbers.">📊</button>
      </div>
    </div>` : `
    <div class="kpis">
      <div class="kpi big"><div class="et">Totale spese in comune</div>
        <div class="v">${U.eur(rep.totaleComune)}</div><div class="d">${delta}</div></div>
      <div class="kpi"><div class="et">Quota ${h(c.nomeMio)} · ${c.quotaMia}%</div>
        <div class="v">${U.eur(rep.dovutoMio)}</div><div class="d">di cui già pagati ${U.eur(rep.pagatoMio)}</div></div>
      <div class="kpi"><div class="et">Quota ${h(c.nomeAltro)} · ${100 - c.quotaMia}%</div>
        <div class="v">${U.eur(rep.dovutoAltro)}</div><div class="d">di cui già pagati ${U.eur(rep.pagatoAltro)}</div></div>
      <div class="kpi"><div class="et">Spese non comuni</div>
        <div class="v">${U.eur(rep.totalePersonale)}</div><div class="d">su ${U.eur(rep.totaleSpeso)} totali del ${parola}</div></div>
    </div>

    <div class="saldo-box" style="margin-top:14px">
      <div class="ic">${Math.abs(rep.saldo) < 0.01 ? '🤝' : '⚖️'}</div>
      <div class="t"><b>${h(E.fraseSaldo(rep))}</b>
        <span>${rep.tutti.length} movimenti nel mese · ${rep.esclusi.length} esclusi dal conteggio · ${rep.spese.length} spese conteggiate</span></div>
      <div class="riga">
        <button class="btn pri" data-azione="report-pdf"
          data-tip="Report in PDF|Documento completo del mese: riquadri, saldo, categorie, promemoria e dettaglio di tutti i movimenti con le righe colorate. Pronto da stampare o da mandare.">📄 PDF</button>
        <button class="btn" data-azione="report-xlsx"
          data-tip="Report in Excel|Cartella .xlsx con quattro fogli — Riepilogo, Movimenti, Esercenti, Note — filtri già attivi, importi in euro e righe evidenziate come nell'app.">📗 XLSX</button>
        <button class="btn gh" data-azione="report-html"
          data-tip="Anteprima da stampare|Apre il report nel browser: da lì [Cmd+P] per stampare. Il PDF vero e proprio è il pulsante accanto.">🖨</button>
        <button class="btn gh" data-azione="export-csv"
          data-tip="Esporta CSV|Solo l'elenco dei movimenti, separato da punto e virgola, pronto per Excel o Numers.">📊</button>
      </div>
    </div>`;

    return `
    ${avvisi.map(([t, i, txt]) => `<div class="avviso ${t === 'info' ? 'info' : ''}"><span class="ic">${i}</span><div>${txt}</div></div>`).join('')}
    ${kpis}

    <h2 class="sez">${personale ? 'Spese per categoria' : 'Spese comuni per categoria'}</h2>
    <div class="card"><div class="catlist">${cat}</div></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px" class="due-col">
      <div><h2 class="sez">Da quale conto</h2><div class="card"><div class="catlist">${conti}</div></div></div>
      <div><h2 class="sez">Dove spendete di più</h2><div class="card"><div class="catlist">${top}</div></div></div>
    </div>
    <style>@media(max-width:760px){.due-col{grid-template-columns:1fr!important}}</style>`;
  }

  /* ======================================================== movimenti === */
  function vMovimenti(rep, A) {
    const f = A.filtri;
    let mov = rep.tutti.slice();
    if (f.cerca) {
      const q = f.cerca.toLowerCase();
      mov = mov.filter((m) => (m.descrizionePulita + ' ' + (m.nota || '')).toLowerCase().includes(q));
    }
    if (f.conto) mov = mov.filter((m) => m.conto === f.conto);
    if (f.categoria) mov = mov.filter((m) => m.categoria === f.categoria);
    if (f.stato === 'conteggiati') mov = mov.filter((m) => !m.escluso && E.quotaComune(m) > 0);
    if (f.stato === 'esclusi') mov = mov.filter((m) => m.escluso);
    if (f.stato === 'personali') mov = mov.filter((m) => !m.escluso && E.quotaComune(m) === 0);
    if (f.stato === 'controllare') mov = mov.filter((m) => rep.daControllare.includes(m));
    mov.sort((a, b) => (b.dataReg || b.data).localeCompare(a.dataReg || a.data) ||
                       b.data.localeCompare(a.data) || Math.abs(b.importo) - Math.abs(a.importo));

    const contiPresenti = [...new Set(rep.tutti.map((m) => m.conto))];
    const catPresenti = [...new Set(rep.tutti.map((m) => m.categoria))].sort();
    const totFiltro = U.arrotonda(mov.reduce((s, m) => s + E.quotaComune(m), 0));

    const righe = mov.map((m) => {
      const qc = E.quotaComune(m);
      const badge = m.escluso ? `<span class="badge ${
        m.motivoEsclusione === 'duplicato-carta' ? 'dup' : m.motivoEsclusione === 'giroconto' ? 'gir' :
        m.motivoEsclusione === 'contanti-da-assegnare' ? 'cnt' : ''}">${h(etichettaEsclusione(m.motivoEsclusione))}</span>` : '';
      const cl = E.classe(m);
      return `<tr class="k-${cl} ${m.escluso ? 'off' : ''}" data-id="${m.id}"
          title="${h(E.ETICHETTA_CLASSE[cl])}">
        <td class="marca"></td>
        <td class="data">${m.data.slice(8)}/${m.data.slice(5, 7)}</td>
        <td class="desc"><b>${h(m.esercente || U.pulisci(m.descrizione))}</b>
          <small>${h(R.contoInfo(m.conto, rep.config.conti).etichetta)}${m.manuale ? ' · inserita a mano' : ''} ${badge}</small>
          ${m.nota ? `<small style="color:var(--acc)">📝 ${h(m.nota)}</small>` : ''}
          ${m.suggerimento && !m.bloccato && (!m.escluso || m.motivoEsclusione === 'contanti-da-assegnare')
            ? `<small style="color:var(--warn)">⚠ ${h(m.suggerimento)}</small>` : ''}</td>
        <td><select data-campo="categoria" style="width:150px;padding:4px 6px;font-size:12px">${
          R.CATEGORIE.map((k) => `<option ${k.nome === m.categoria ? 'selected' : ''}>${k.nome}</option>`).join('')}</select></td>
        <td class="num mono">${U.eur(m.importo)}</td>
        <td class="num"><input type="number" class="qbox" data-campo="quota" min="0" max="100" step="5"
              value="${m.escluso ? 0 : (m.quota || 0)}" ${m.escluso ? 'disabled' : ''}></td>
        <td class="num mono" style="font-weight:600">${qc ? U.eur(qc) : '—'}</td>
        <td><select data-campo="pagatoDa" style="width:96px;padding:4px 6px;font-size:12px">
          <option value="io" ${m.pagatoDa !== 'moglie' ? 'selected' : ''}>${h(rep.config.nomeMio)}</option>
          <option value="moglie" ${m.pagatoDa === 'moglie' ? 'selected' : ''}>${h(rep.config.nomeAltro)}</option></select></td>
        <td class="azioni" style="white-space:nowrap">
          <button class="btn sm gh" data-campo="toggle" title="${m.escluso ? 'Rimetti nel conteggio' : 'Escludi dal conteggio'}">${m.escluso ? '↩' : '🚫'}</button>
          <button class="btn sm gh" data-campo="nota" title="Nota">📝</button>
          <button class="btn sm gh" data-campo="regola" title="Crea una regola da questo movimento">✨</button>
        </td></tr>`;
    }).join('');

    return `
    <div class="filtri">
      <input type="text" class="cerca" id="fCerca" placeholder="Cerca descrizione o nota…" value="${h(f.cerca || '')}">
      <select id="fStato">
        <option value="">Tutti i movimenti</option>
        <option value="conteggiati" ${f.stato === 'conteggiati' ? 'selected' : ''}>Solo spese comuni</option>
        <option value="personali" ${f.stato === 'personali' ? 'selected' : ''}>Solo non comuni</option>
        <option value="esclusi" ${f.stato === 'esclusi' ? 'selected' : ''}>Solo esclusi</option>
        <option value="controllare" ${f.stato === 'controllare' ? 'selected' : ''}>Da controllare (${rep.daControllare.length})</option>
      </select>
      <select id="fConto"><option value="">Tutti i conti</option>${contiPresenti.map((k) =>
        `<option value="${h(k)}" ${f.conto === k ? 'selected' : ''}>${h(R.contoInfo(k, rep.config.conti).etichetta)}</option>`).join('')}</select>
      <select id="fCat"><option value="">Tutte le categorie</option>${catPresenti.map((k) =>
        `<option ${f.categoria === k ? 'selected' : ''}>${h(k)}</option>`).join('')}</select>
      <span class="sp" style="flex:1"></span>
      <span class="mini muto">${mov.length} movimenti · <b>${U.eur(totFiltro)}</b> in comune</span>
    </div>

    <div class="legenda">
      <b><i style="background:var(--v-comune);border-left:3px solid var(--v-comune-b)"></i> spesa comune</b>
      <b><i style="background:var(--v-parziale);border-left:3px solid var(--v-parziale-b)"></i> in parte comune</b>
      <b><i style="background:var(--v-personale);border-left:3px solid var(--v-personale-b)"></i> personale o di lavoro</b>
      <b><i style="border-left:3px solid var(--bordo2)"></i> esclusa dal conteggio</b>
      <span style="flex:1"></span>
      <span class="mini">Le stesse tinte finiscono nel PDF e nel foglio Excel.</span>
    </div>

    <div class="tbl-wrap"><div class="tbl-scroll"><table class="mov">
      <thead><tr><th class="marca"></th><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="num">Importo</th>
        <th class="num">Quota</th><th class="num">In comune</th><th>Pagato da</th><th></th></tr></thead>
      <tbody id="tbodyMov">${righe || '<tr><td colspan="9" style="text-align:center;padding:34px;color:var(--txt2)">Nessun movimento con questi filtri.</td></tr>'}</tbody>
    </table></div></div>
    <p class="mini muto" style="margin-top:9px">La <b>quota</b> è la percentuale dell'importo che entra nelle spese comuni: 100% = tutta comune, 50% = metà, 0% = spesa personale. Ogni modifica a mano viene ricordata e non verrà più sovrascritta dalle regole automatiche.</p>`;
  }

  const etichettaEsclusione = (m) => ({
    'duplicato-carta': 'doppione conto/carta',
    'giroconto': 'giroconto',
    'contanti-da-assegnare': 'contante da assegnare',
    'manuale': 'escluso a mano'
  })[m] || 'escluso';

  /* ======================================================== categorie === */
  function vCategorie(rep) {
    if (!rep.perCategoria.length) return vistaVuoto('Nessuna spesa in questo mese.');
    return rep.perCategoria.map((c) => {
      const perEs = E.raggruppa(c.movimenti, (m) => m.esercente || '—');
      return `<h2 class="sez" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:15px">${R.icona(c.nome)}</span>${h(c.nome)}
          <span style="flex:1"></span>
          <span style="color:var(--txt);font-size:14px">${U.eur(c.comune)} <span class="muto mini">in comune su ${U.eur(c.totale)}</span></span>
        </h2>
        <div class="card"><div class="catlist">${perEs.map((e) => `
          <div class="catrow" data-cerca="${h(e.nome)}" style="grid-template-columns:1fr 110px 90px">
            <div><div class="nm">${h(e.nome)}</div>
              <div class="mini muto">${e.n} movimenti · ${e.movimenti.map((m) => m.data.slice(8)).join(', ')}</div></div>
            <div class="im">${U.eur(e.totale)}</div>
            <div class="im muto mini">${e.comune ? U.eur(e.comune) + ' com.' : 'personale'}</div>
          </div>`).join('')}</div></div>`;
    }).join('');
  }

  /* ========================================================= soggetti === */
  function vSoggetti(A) {
    const r = A.ricercaSoggetto || { testo: '', ambito: 'tutto' };
    const esercenti = E.esercentiConosciuti(A.stato).slice(0, 300);
    const periodoAttuale = A.periodo && A.periodo.chiave
      ? U.periodoLabel(A.periodo.tipo, A.periodo.chiave) : null;

    return `
    <div class="avviso info"><span class="ic">🔎</span><div>
      Cerca un esercente o una controparte — <em>"Decathlon"</em>, <em>"Enel"</em>, <em>"bonifico stipendio"</em> —
      per vedere subito quanto avete speso o incassato con lui, in un periodo qualsiasi o su tutto l'archivio.</div></div>

    <div class="riga" style="margin-bottom:16px">
      <input type="text" id="soggQuery" list="soggElenco" placeholder="Cerca un nome…"
        value="${h(r.testo)}" style="flex:1;min-width:220px" autocomplete="off">
      <datalist id="soggElenco">${esercenti.map((n) => `<option value="${h(n)}">`).join('')}</datalist>
      <select id="soggAmbito">
        <option value="tutto" ${r.ambito === 'tutto' ? 'selected' : ''}>Tutto l'archivio</option>
        ${periodoAttuale ? `<option value="periodo" ${r.ambito === 'periodo' ? 'selected' : ''}>Solo ${h(periodoAttuale)}</option>` : ''}
      </select>
      <button class="btn pri" data-azione="cerca-soggetto"
        data-tip="Cerca|Trova ogni movimento il cui nome esercente contiene il testo scritto, maiuscole e accenti non contano.">Cerca</button>
    </div>

    <div id="esitoSoggetto">${r.risultato ? risultatoSoggetto(r.risultato, A) : `
      <div class="vuoto" style="padding:40px 20px"><span class="em">🧾</span>
        <h3>Scrivi un nome e premi Cerca</h3>
        <p class="mini muto">Puoi anche scegliere dall'elenco a tendina: sono gli esercenti già visti in archivio.</p></div>`}</div>`;
  }

  function risultatoSoggetto(r, A) {
    if (!r.trovati.length) {
      return `<div class="avviso"><span class="ic">🤷</span><div>
        Nessun movimento trovato per <b>"${h(r.testo)}"</b>${
          r.periodo ? ' in ' + h(U.periodoLabel(r.periodo.tipo, r.periodo.chiave)) : ' in tutto l\'archivio'}.
        Controlla come è scritto negli estratti, oppure prova con una parola più corta.</div></div>`;
    }

    const maxTrend = Math.max(...r.perMese.map((x) => Math.max(x.entrate, x.uscite)), 0.01);
    const trend = r.perMese.map((x) => `
      <div class="catrow" style="grid-template-columns:52px 1fr 90px">
        <div class="mini muto">${h(x.etichetta)}</div>
        <div>
          ${x.uscite ? `<div class="bar" style="margin-bottom:2px"><i style="width:${x.uscite / maxTrend * 100}%;background:${R.colore('Imprevisti')}"></i></div>` : ''}
          ${x.entrate ? `<div class="bar"><i style="width:${x.entrate / maxTrend * 100}%;background:${R.colore('Supermercato')}"></i></div>` : ''}
        </div>
        <div class="mini" style="text-align:right">
          ${x.uscite ? `<div>-${U.eurPlain(x.uscite)} €</div>` : ''}
          ${x.entrate ? `<div style="color:var(--ok)">+${U.eurPlain(x.entrate)} €</div>` : ''}
        </div>
      </div>`).join('');

    const righe = r.trovati.slice().sort((a, b) => b.data.localeCompare(a.data)).map((m) => {
      const cl = E.classe(m);
      return `<tr class="k-${cl} ${m.escluso ? 'off' : ''}" title="${h(E.ETICHETTA_CLASSE[cl])}">
        <td class="marca"></td>
        <td class="data">${m.data.slice(8)}/${m.data.slice(5, 7)}/${m.data.slice(0, 4)}</td>
        <td class="desc"><b>${h(U.pulisci(m.descrizione))}</b>
          <small>${h(R.contoInfo(m.conto, A.stato.config.conti).etichetta)}</small></td>
        <td>${h(m.categoria || '')}</td>
        <td class="num mono" style="color:${m.importo > 0 ? 'var(--ok)' : 'inherit'}">${U.eur(m.importo)}</td>
      </tr>`;
    }).join('');

    return `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="et">Uscite</div><div class="v">${U.eur(r.uscite.totale)}</div>
        <div class="d">${r.uscite.n} movimenti${r.uscite.comune ? ' · ' + U.eur(r.uscite.comune) + ' in comune' : ''}</div></div>
      <div class="kpi"><div class="et">Entrate</div><div class="v" style="color:var(--ok)">${U.eur(r.entrate.totale)}</div>
        <div class="d">${r.entrate.n} movimenti</div></div>
      <div class="kpi"><div class="et">Netto</div><div class="v ${r.netto < 0 ? 'su' : r.netto > 0 ? 'giu' : ''}">${U.eur(r.netto)}</div>
        <div class="d">${r.netto >= 0 ? 'a vostro favore' : 'uscito di più di quanto entrato'}</div></div>
      <div class="kpi"><div class="et">Periodo coperto</div><div class="v" style="font-size:16px">${
        r.primo === r.ultimo ? U.meseBreve(r.primo) : `${U.meseBreve(r.primo)} → ${U.meseBreve(r.ultimo)}`}</div>
        <div class="d">${r.trovati.length} movimenti totali${r.esclusi ? `, ${r.esclusi} esclusi dal conteggio` : ''}</div></div>
    </div>

    ${r.varianti.length > 1 ? `<p class="mini muto" style="margin-bottom:14px">Nomi trovati che corrispondono: ${
      r.varianti.map((v) => h(v)).join(' · ')}</p>` : ''}

    <h2 class="sez">Andamento mese per mese</h2>
    <div class="card" style="margin-bottom:8px"><div class="catlist">${trend}</div></div>
    <div class="legenda" style="margin-bottom:16px">
      <b><i style="background:${R.colore('Imprevisti')}"></i> uscite</b>
      <b><i style="background:${R.colore('Supermercato')}"></i> entrate</b>
    </div>

    <h2 class="sez">Movimenti</h2>
    <div class="tbl-wrap"><div class="tbl-scroll"><table class="mov">
      <thead><tr><th class="marca"></th><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="num">Importo</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div></div>`;
  }

  /* ============================================================ note ==== */
  function vNote(rep, A) {
    const listaNote = (arr, mese, ereditate) => arr.length
      ? arr.map((n, i) => `<div class="nota ${n.fatto ? 'fatta' : ''}">
          <input type="checkbox" ${n.fatto ? 'checked' : ''} data-nota-mese="${mese}" data-nota-i="${i}" data-nota-az="fatto">
          <div class="tx">${h(n.testo)}${ereditate ? `<div class="mini muto">scritta a ${U.meseBreve(mese)}</div>` : ''}</div>
          <button class="x" data-nota-mese="${mese}" data-nota-i="${i}" data-nota-az="elimina" title="Elimina">×</button>
        </div>`).join('')
      : '<p class="muto mini" style="padding:6px 2px">Nessuna nota.</p>';

    const ered = rep.noteDalMesePrec;
    return `
    <div class="avviso info"><span class="ic">💡</span><div>
      Usa le note per ricordarti cosa controllare o pagare il mese prossimo: <em>«a settembre arriva l'assicurazione auto, ~€480 da dividere»</em>, <em>«chiedere scontrino del dentista»</em>.
      Le note non spuntate compaiono automaticamente nel riepilogo del mese successivo.</div></div>

    <h2 class="sez">Promemoria per il mese prossimo — scritti a ${h(rep.meseLabel)}</h2>
    <div class="riga" style="margin-bottom:12px">
      <input type="text" id="nuovaNota" placeholder="Scrivi un promemoria e premi Invio…" style="flex:1;min-width:240px">
      <button class="btn pri" data-azione="aggiungi-nota">＋ Aggiungi</button>
    </div>
    ${listaNote(rep.note, rep.mese, false)}

    ${ered.length ? `<h2 class="sez">Arrivati da ${h(U.meseLabel(rep.mesePrec))}</h2>${listaNote(ered, rep.mesePrec, true)}` : ''}

    <h2 class="sez">Spese ricorrenti da non dimenticare</h2>
    <div class="card"><p class="mini muto" style="line-height:1.7">
      Queste voci non compaiono negli estratti della carta condivisa ma vanno spesso divise: aggiungile con <b>＋ Spesa</b> quando arrivano.<br>
      🛡️ Assicurazione auto · 🏛️ Bollo auto · 🔧 Tagliando e gomme · 💡 Bollette luce/gas/acqua ·
      🏛️ TARI e IMU · 💵 Spese in contanti · ⚠️ Imprevisti (idraulico, elettricista) · 🎁 Regali comuni</p></div>`;
  }

  /* ========================================================= importa ==== */
  /** riquadro "cosa manca": per ogni conto, i mesi senza movimenti fra il
   *  primo e l'ultimo mese visto in quel conto — quasi sempre un estratto
   *  che manca ancora, non un mese davvero senza movimenti */
  function blocCopertura(A) {
    const cop = E.copertura(A.stato);
    if (!cop.conti.length) return '';
    const totBuchi = cop.conti.reduce((s, c) => s + c.buchi.length, 0);

    const righe = cop.conti.map((c) => {
      const completo = c.buchi.length === 0;
      return `<div class="catrow" style="grid-template-columns:22px 1fr auto" data-filtra-conto="${h(c.conto)}">
        <div style="font-size:15px">${completo ? '✅' : '⚠️'}</div>
        <div><div class="nm">${h(c.etichetta)}</div>
          <div class="mini muto">${U.meseBreve(c.primo)} → ${U.meseBreve(c.ultimo)} · ${c.nMesi} mesi con dati${
            completo ? ', nessun buco' : ''}</div></div>
        <div class="mini" style="text-align:right;color:${completo ? 'var(--txt3)' : 'var(--warn)'}">${
          completo ? 'completo' : `manca${c.buchi.length > 1 ? 'no' : ''}: ${
            c.buchi.slice(0, 6).map(U.meseBreve).join(', ')}${c.buchi.length > 6 ? ` e altri ${c.buchi.length - 6}` : ''}`}</div>
      </div>`;
    }).join('');

    return `
    <div id="blocCopertura">
    <h2 class="sez">Copertura archivio</h2>
    <div class="avviso ${totBuchi ? '' : 'ok'}" style="margin-bottom:10px">
      <span class="ic">${totBuchi ? '🕳️' : '✅'}</span>
      <div>${totBuchi
        ? `Mancano <b>${totBuchi} mesi</b> di estratti rispetto a quello che l'app ha già trovato, fra ${
            h(U.meseBreve(cop.primo))} e ${h(U.meseBreve(cop.ultimo))}. Sono probabilmente documenti non ancora scaricati o importati, non mesi senza movimenti.`
        : `Nessun buco: ogni conto ha un movimento in ciascun mese fra ${h(U.meseBreve(cop.primo))} e ${h(U.meseBreve(cop.ultimo))}.`}</div>
    </div>
    <div class="card" style="margin-bottom:20px"><div class="catlist">${righe}</div></div>
    </div>`;
  }

  function vImporta(rep, A) {
    const imp = A.stato.importazioni.slice().reverse();
    return `
    ${blocCopertura(A)}
    <div class="card" style="margin-bottom:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <b style="font-size:13.5px">Catalogo dei file in raw/</b>
        <p class="mini muto" style="margin-top:3px;line-height:1.6">Rilegge ogni file di <code>raw/</code> e scrive
          <code>raw/catalogo.csv</code> e <code>raw/catalogo.md</code>: periodo e tipologia di ciascun file, i doppi
          scaricati per sbaglio più volte, quelli che non quadrano. Non tocca l'archivio dell'app.</p>
      </div>
      <button class="btn" data-azione="genera-catalogo"
        data-tip="Genera catalogo|Rilegge tutti i file di raw/ con gli stessi lettori usati per importare e scrive un indice leggibile (CSV + Markdown) di cosa c'è: periodo, tipologia, doppioni, anomalie.">🗂 Genera/aggiorna catalogo</button>
    </div>
    <div class="dz" id="dropzone">
      <span class="em">📥</span>
      <b>Trascina qui gli estratti conto del mese</b>
      <p class="muto mini" style="margin:4px 0 14px">oppure trascina l'intera cartella <code>raw/2026-07/</code> — puoi caricare più file insieme</p>
      <div class="riga" style="justify-content:center">
        <button class="btn pri" data-azione="scansiona-raw">🔄 Leggi tutto da raw/</button>
        <button class="btn" data-azione="apri-file">Scegli i file a mano</button>
      </div>
      <p class="mini muto" style="margin-top:14px;line-height:1.7">
        Riconosciuti automaticamente: <b>estratto carta</b> (.xlsx) · <b>movimenti conto corrente</b> (.xlsx) · <b>movimenti Telepass</b> (.xls) · <b>estratto conto Fineco trimestrale</b> (.pdf) — quest'ultimo da solo copre conto e tutte le carte, ottimo per recuperare anni di storico.<br>
        Reimportare lo stesso file non crea doppioni: i movimenti già presenti vengono riconosciuti e saltati.</p>
    </div>

    <h2 class="sez">Come organizzare i file</h2>
    <div class="card"><p class="mini muto" style="line-height:1.8">
      Ogni mese scarica gli estratti e mettili in una cartella dedicata dentro <code>raw/</code>, per esempio:<br>
      <code style="display:block;margin:8px 0;padding:9px 12px;background:var(--card2);border-radius:6px;line-height:1.9">
      raw/2026-07/carta-1234-condivisa-2026-07.xlsx<br>
      raw/2026-07/carta-5678-personale-2026-07.xlsx<br>
      raw/2026-07/conto-corrente-2026-07.xlsx<br>
      raw/2026-07/telepass-2026-07.xls</code>
      Il nome del file non conta per l'app (il formato è riconosciuto dal contenuto), serve a te per ritrovarlo.
      I report esportati vanno in <code>archivio/</code>.</p></div>

    <h2 class="sez">File già importati</h2>
    ${imp.length ? imp.map((i) => `<div class="file-item">
        <span class="ic">${i.formato === 'telepass' ? '🛣️' : i.formato === 'conto' ? '🏦' : '💳'}</span>
        <div class="t"><b>${h(i.file)}</b><span>${h(i.formatoNome)} · ${i.nuovi} movimenti aggiunti${
          i.saltati ? ', ' + i.saltati + ' già presenti' : ''} · ${h(i.mesi.join(', '))} · importato il ${
          new Date(i.quando).toLocaleDateString('it-IT')}</span></div>
        <button class="btn sm" data-rimuovi-file="${h(i.file)}" data-rimuovi-quando="${i.quando}">Rimuovi</button>
      </div>`).join('') : '<p class="muto mini">Nessun file importato finora.</p>'}`;
  }

  /* ========================================================== regole ==== */
  function vRegole(rep, A) {
    const rg = A.stato.config.regole;
    return `
    <div class="avviso info"><span class="ic">✨</span><div>
      Le regole assegnano <b>categoria</b> e <b>quota comune</b> automaticamente a ogni importazione.
      Vengono lette dall'alto verso il basso: vince la prima che corrisponde. Nel testo puoi elencare più
      parole separate da <code>|</code>. I movimenti che hai modificato a mano non vengono mai toccati dalle regole.
      <div class="mini muto" style="margin-top:6px">Quelle di partenza sono un modello pensato per l'Italia (supermercati,
      carburante, bollette…): personalizzale liberamente, cancella quelle che non ti servono, aggiungi le tue.</div></div></div>

    <div class="riga" style="margin-bottom:12px">
      <button class="btn pri" data-azione="nuova-regola">＋ Nuova regola</button>
      <button class="btn" data-azione="riapplica">🔄 Riapplica a tutto l'archivio</button>
      <span style="flex:1"></span>
      <button class="btn gh mini" data-azione="esporta-regole">⬇ Esporta</button>
      <button class="btn gh mini" data-azione="importa-regole">⬆ Importa</button>
      <button class="btn gh mini" data-azione="reset-regole">Ripristina regole di partenza</button>
    </div>

    <div class="regola" style="background:transparent;border:none;padding:2px 8px">
      <label class="f" style="margin:0">Testo da cercare</label>
      <label class="f" style="margin:0">Categoria</label>
      <label class="f" style="margin:0">Quota</label><div></div></div>

    ${rg.map((r, i) => `<div class="regola" data-regola="${i}">
      <input class="pat" data-rc="m" value="${h(r.m)}" spellcheck="false">
      <select data-rc="cat">${R.CATEGORIE.map((k) => `<option ${k.nome === r.cat ? 'selected' : ''}>${k.nome}</option>`).join('')}</select>
      <input type="number" data-rc="quota" min="0" max="100" step="5" value="${r.quota == null ? '' : r.quota}" placeholder="auto">
      <button class="x btn gh" data-rc="del" title="Elimina">×</button>
    </div>`).join('')}`;
  }

  /* ======================================================= assistente == */
  /** riempie il pannello scorrevole a destra, sempre visibile indipendentemente
   *  dalla scheda che si sta guardando: usa comunque i numeri del mese in corso */
  function renderPannelloAssistente(A, repMese) {
    const el = $('#assistCorpo');
    if (!el) return;
    el.innerHTML = repMese
      ? vAssistente(repMese, A)
      : `<div class="vuoto" style="padding:30px"><span class="em">🤖</span><h3>Nessun dato ancora</h3>
         <p class="mini muto">Importa il primo estratto conto per iniziare a usare l'assistente.</p></div>`;
    const cc = $('#chatCorpo', el);
    if (cc) cc.scrollTop = cc.scrollHeight;
  }

  /** tutte le conversazioni passate, raggruppate per mese, così restano
   *  consultabili nel pannello anche quando si guarda un mese diverso */
  function storicoChatCompleto(A) {
    const chat = A.stato.chat || {};
    const mesi = Object.keys(chat).filter((k) => (chat[k] || []).length).sort();
    if (!mesi.length) return null;
    return mesi.map((k) => `
      <div class="chat-sep"><span>${h(U.meseLabel(k))}</span></div>
      ${chat[k].map(bolla).join('')}`).join('');
  }

  function vAssistente(rep, A) {
    const st = IA.stato();
    const c = rep.config;
    if (!st.attivo) {
      return `<div class="avviso"><span class="ic">🔌</span><div>
        <b>Assistente non collegato.</b> ${st.verificato
          ? 'Il server locale non trova la chiave NVIDIA, oppure l\'app è stata aperta come file invece che da <code>avvia.command</code>.'
          : 'Sto controllando il collegamento…'}
        <div class="mini muto" style="margin-top:8px;line-height:1.7">
          Per collegarlo: vai su <b>⚙ Impostazioni</b> e incolla la chiave NVIDIA (gratis su
          <code>build.nvidia.com</code>) — nessun file da modificare a mano, nessun riavvio.<br>
          Tutto il resto dell'app funziona lo stesso: l'assistente è un aiuto, non un ingranaggio obbligatorio.</div>
      </div></div>`;
    }

    const nonCoperti = esercentiDaClassificare(rep, A);
    const p = A.proposte;

    return `
    <div class="riga" style="margin-bottom:16px">
      <span class="pill-ia">▲ NVIDIA Nemotron</span>
      <span class="mini muto">${h((st.modello || '').replace('nvidia/', ''))} · le richieste passano dal server locale, la chiave non entra nel browser</span>
    </div>

    <h2 class="sez">Motore spese comuni</h2>
    <div class="card">
      <p class="mini muto" style="line-height:1.7;margin-bottom:13px">
        Sulla carta condivisa finiscono anche spese che comuni non sono — abbonamenti AI, servizi di lavoro, acquisti personali.
        Il motore legge <b>i nomi degli esercenti</b> (non i tuoi dati personali, non gli importi singoli riga per riga)
        e propone per ciascuno se è spesa di casa o no. Tu confermi con un clic e la risposta diventa una
        <b>regola permanente</b>: dal mese prossimo è già classificata, senza chiamare più il modello.</p>
      <div class="riga">
        <button class="btn pri" data-azione="analizza-ia" ${nonCoperti.length ? '' : 'disabled'}
          data-tip="Analizza gli esercenti|Manda al modello l'elenco degli esercenti di questo mese non ancora coperti da una regola. Ci vogliono pochi secondi e vedi le proposte prima di applicarle.">
          ✨ Analizza ${nonCoperti.length} esercenti</button>
        ${nonCoperti.length ? '' : '<span class="mini muto">Tutti gli esercenti di questo mese sono già coperti da una regola.</span>'}
      </div>
      <div id="esitoIA">${p ? listaProposte(p, rep) : ''}</div>
    </div>

    <h2 class="sez">Testi pronti</h2>
    <div class="card">
      <div class="riga" style="margin-bottom:12px">
        <button class="btn" data-azione="ia-doc" data-tipo="riepilogo"
          data-tip="Commento del mese|Quattro o cinque righe che spiegano com'è andato il mese. Finiscono in cima al PDF e al foglio Riepilogo di Excel.">📝 Commento del mese</button>
        <button class="btn" data-azione="ia-doc" data-tipo="messaggio"
          data-tip="Messaggio da mandare|Un testo breve e discorsivo da copiare in chat per ${h(c.nomeAltro)}, con il saldo in chiusura.">💬 Messaggio per ${h(c.nomeAltro)}</button>
        <button class="btn" data-azione="ia-doc" data-tipo="note"
          data-tip="Promemoria proposti|Tre-cinque note per il mese prossimo ricavate dai numeri di questo mese. Puoi aggiungerle tutte insieme alla scheda Note.">📌 Proponi promemoria</button>
        <button class="btn" data-azione="ia-doc" data-tipo="anomalie"
          data-tip="Cosa non torna|Cerca importi fuori scala, doppioni sospetti e categorie strane fra i movimenti del mese.">🔍 Cosa non torna</button>
      </div>
      <div id="esitoDoc">${A.documento ? riquadroDocumento(A.documento) : '<p class="mini muto">Scegli un testo da generare: viene scritto usando solo i numeri di questo mese.</p>'}</div>
    </div>

    <h2 class="sez">Report su misura</h2>
    <div class="card">
      <p class="mini muto" style="line-height:1.7;margin-bottom:12px">
        Chiedi una spesa da ritrovare in tutto l'archivio, non solo in questo mese — l'assistente capisce
        la domanda, ti fa vedere cosa ha trovato, e da lì lo esporti in <b>PDF</b> o <b>XLSX</b>.</p>
      <div class="suggeriti" style="margin-bottom:9px">
        ${['Tutte le spese Amazon di quest\'anno', 'Carburante negli ultimi 6 mesi',
           'Spese sopra i 100€ di agosto', 'Spese Telepass dell\'anno scorso'].map((q) =>
          `<button data-domanda-report="${h(q)}">${h(q)}</button>`).join('')}
      </div>
      <div class="chat-riga">
        <textarea id="reportInput" rows="1" placeholder="Es. spese Decathlon del 2025…"></textarea>
        <button class="btn pri" data-azione="report-chiedi" ${A.inAttesaReport ? 'disabled' : ''}
          data-tip="Cerca|[Invio] manda la domanda: l'assistente cerca su tutto l'archivio, non solo sul mese aperto.">
          ${A.inAttesaReport ? '<span class="pensa"><i></i><i></i><i></i></span>' : 'Cerca'}</button>
      </div>
      <div id="esitoReport">${A.reportProposto ? riquadroReport(A.reportProposto) : ''}</div>
    </div>

    <h2 class="sez">Domande sulla gestione</h2>
    <div class="chat">
      <div class="chat-corpo" id="chatCorpo">${
        storicoChatCompleto(A) ||
          `<div class="vuoto" style="padding:30px"><span class="em">💬</span>
             <h3>Chiedi quello che vuoi su ${h(rep.meseLabel)}</h3>
             <p class="mini muto" style="max-width:420px;margin:6px auto 0">
             L'assistente vede i numeri di questo mese — totali, categorie, conti, saldo, promemoria —
             e ha l'ordine di non inventare cifre che non ci sono. Tutte le conversazioni restano qui,
             mese per mese, anche dopo aver chiuso il browser.</p></div>`}</div>
      <div class="chat-piede">
        <div class="suggeriti">
          ${['Perché il saldo è questo?', 'Dove stiamo spendendo troppo?',
             'Quali spese posso togliere dalle comuni?', 'Cosa mi aspetta il mese prossimo?',
             'Riassumimi il mese in tre righe'].map((q) =>
            `<button data-domanda="${h(q)}">${h(q)}</button>`).join('')}
        </div>
        <div class="chat-riga">
          <textarea id="chatInput" rows="1" placeholder="Scrivi una domanda e premi Invio…"></textarea>
          <button class="btn pri" data-azione="chat-invia"
            data-tip="Invia|[Invio] manda la domanda, [Maiusc+Invio] va a capo.">Invia</button>
          <button class="btn gh" data-azione="chat-pulisci"
            data-tip="Svuota la conversazione|Cancella le domande di questo mese. I dati delle spese non vengono toccati.">🗑</button>
        </div>
      </div>
    </div>`;
  }

  const bolla = (m) => `<div class="msg ${m.role === 'user' ? 'io' : ''}">
      <div class="av">${m.role === 'user' ? '🙂' : '▲'}</div>
      <div class="bolla">${U.escapeHtml(m.content)}</div></div>`;

  function riquadroReport(rp) {
    const ris = rp.ris;
    if (!ris.n) {
      return `<div class="avviso" style="margin-top:12px"><span class="ic">🔍</span><div>
        <b>Nessun movimento trovato.</b> ${h(rp.descrizione)}.
        <div class="mini muto" style="margin-top:4px">Prova a essere più generico, o controlla di aver scritto bene il nome.</div>
        <div class="riga" style="margin-top:9px"><button class="btn sm gh" data-azione="report-scarta">Chiudi</button></div>
      </div></div>`;
    }
    const anteprima = ris.movimenti.slice(0, 6).map((m) => `
      <div class="catrow" style="grid-template-columns:56px 1fr 74px">
        <div class="mini muto">${h(m.data.slice(8))}/${h(m.data.slice(5, 7))}</div>
        <div class="nm" style="font-size:12.5px">${h(U.pulisci(m.descrizione))}</div>
        <div class="im" style="font-size:12.5px">${U.eur(Math.abs(m.importo))}</div>
      </div>`).join('');
    return `<div class="avviso ok" style="align-items:flex-start;margin-top:12px"><span class="ic">📊</span>
      <div style="flex:1">
        <b>${h(rp.criteri.titolo || rp.domanda)}</b>
        <div class="mini muto" style="margin:3px 0 10px">${h(rp.descrizione)} — <b>${ris.n} movimenti</b>,
          totale <b>${U.eur(ris.totale)}</b>${ris.comune > 0 ? `, di cui ${U.eur(ris.comune)} in comune` : ''}</div>
        <div class="tbl-wrap" style="margin-bottom:11px">${anteprima}${
          ris.n > 6 ? `<div class="mini muto" style="padding:8px 12px">… e altri ${ris.n - 6} movimenti nel file esportato</div>` : ''}</div>
        <div class="riga">
          <button class="btn sm pri" data-azione="report-pdf-libero">📄 Esporta PDF</button>
          <button class="btn sm" data-azione="report-xlsx-libero">📗 Esporta XLSX</button>
          <button class="btn sm gh" data-azione="report-scarta">Chiudi</button>
        </div>
      </div></div>`;
  }

  function riquadroDocumento(d) {
    return `<div class="avviso ok" style="align-items:flex-start"><span class="ic">${
      d.tipo === 'messaggio' ? '💬' : d.tipo === 'note' ? '📌' : d.tipo === 'anomalie' ? '🔍' : '📝'}</span>
      <div style="flex:1">
        <div style="white-space:pre-wrap;line-height:1.65">${U.escapeHtml(d.testo)}</div>
        <div class="riga" style="margin-top:11px">
          <button class="btn sm" data-azione="copia-doc">📋 Copia</button>
          ${d.tipo === 'riepilogo' ? '<button class="btn sm" data-azione="usa-commento" data-tip="Metti nel report|Il testo viene salvato e compare in cima al PDF e al foglio Riepilogo di Excel di questo mese.">📄 Usa nel report</button>' : ''}
          ${d.tipo === 'note' ? '<button class="btn sm" data-azione="usa-note" data-tip="Aggiungi ai promemoria|Ogni riga diventa una nota nella scheda Note di questo mese.">📌 Aggiungi alle note</button>' : ''}
          <button class="btn sm gh" data-azione="ia-doc" data-tipo="${d.tipo}">🔄 Riscrivi</button>
        </div>
      </div></div>`;
  }

  /** esercenti del mese non ancora coperti da una regola o da una correzione a mano */
  function esercentiDaClassificare(rep, A) {
    const regole = A.stato.config.regole.filter((r) => r.attiva !== false);
    const mappa = new Map();
    for (const m of rep.spese) {
      if (m.bloccato || m.escluso) continue;
      const nome = m.esercente || U.pulisci(m.descrizione);
      if (!nome) continue;
      if (!mappa.has(nome)) {
        mappa.set(nome, { nome, volte: 0, totale: 0, conto: R.contoInfo(m.conto, A.stato.config.conti).etichetta,
                          categoria: m.categoria || 'Altro', esempio: m });
      }
      const g = mappa.get(nome);
      g.volte++; g.totale = U.arrotonda(g.totale + Math.abs(m.importo));
    }
    // via quelli che una regola già riconosce per nome esplicito
    const out = [...mappa.values()].filter((g) => {
      const chiave = U.chiave(g.nome);
      return !regole.some((r) => r.daIA && new RegExp(r.m, 'i').test(g.nome)) &&
             chiave.length > 2;
    });
    out.sort((a, b) => b.totale - a.totale);
    return out.map((g, i) => Object.assign(g, { n: i + 1 }));
  }

  function listaProposte(p, rep) {
    if (!p.length) return '<p class="mini muto" style="margin-top:12px">Il modello non ha restituito proposte utilizzabili. Riprova.</p>';
    const nSi = p.filter((x) => x.accetta).length;
    return `
      <div style="margin-top:16px">
        <div class="riga" style="margin-bottom:10px">
          <b style="font-size:13px">${p.length} proposte</b>
          <span class="mini muto">${p.filter((x) => x.comune).length} da dividere · ${p.filter((x) => !x.comune).length} personali</span>
          <span style="flex:1"></span>
          <button class="btn sm gh" data-azione="prop-tutte">Seleziona tutte</button>
          <button class="btn sm gh" data-azione="prop-nessuna">Nessuna</button>
          <button class="btn sm gh" data-azione="prop-sicure" data-tip="Solo le sicure|Tiene selezionate solo le proposte con fiducia dichiarata sopra l'80%.">Solo le sicure</button>
        </div>
        ${p.map((x, i) => `<div class="prop ${x.comune ? 'si' : 'no'}" data-prop="${i}">
          <input type="checkbox" data-pc="ok" ${x.accetta ? 'checked' : ''}>
          <div><div class="nm">${h(x.nome)}</div>
            <div class="mt">${h(x.motivo)} · ${x.volte} volt${x.volte === 1 ? 'a' : 'e'} · ${U.eur(x.totale)}</div></div>
          <select data-pc="cat">${R.CATEGORIE.map((k) =>
            `<option ${k.nome === x.categoria ? 'selected' : ''}>${k.nome}</option>`).join('')}</select>
          <select data-pc="quota">${[0, 25, 50, 75, 100].map((q) =>
            `<option value="${q}" ${q === x.quota ? 'selected' : ''}>${q}% comune</option>`).join('')}</select>
          <div class="fid">${Math.round(x.fiducia * 100)}%</div>
        </div>`).join('')}
        <div class="riga" style="margin-top:13px">
          <button class="btn pri" data-azione="applica-proposte" ${nSi ? '' : 'disabled'}
            data-tip="Crea le regole|Ogni proposta selezionata diventa una regola permanente e viene applicata subito a tutto l'archivio. Le puoi rivedere o cancellare dalla scheda Regole.">
            ✓ Applica ${nSi} proposte</button>
          <button class="btn gh" data-azione="scarta-proposte">Scarta</button>
        </div>
      </div>`;
  }

  /* ============================================================ guida == */
  function vGuida(rep, A) {
    const c = (A.stato.config) || {};
    const bottone = (icona, nome, testo) =>
      `<div><span class="b">${icona}</span><div><b>${h(nome)}</b><br><span class="muto">${testo}</span></div></div>`;
    return `<div class="guida">
      <div class="avviso info" style="align-items:center">
        <span class="ic">🎓</span>
        <div style="flex:1"><b>Prima volta qui?</b> La visita guidata accende un riflettore su ogni pezzo dell'app, uno alla volta. Dura un minuto.</div>
        <button class="btn pri" data-azione="visita">▶ Avvia la visita guidata</button>
      </div>

      <h3>🗓️ Il giro di ogni mese</h3>
      <ol>
        <li>Scarica dalla banca l'estratto della <b>carta condivisa</b>, quello della <b>carta personale</b>,
            i <b>movimenti del conto corrente</b> e quelli del <b>Telepass</b>.</li>
        <li>Mettili in una cartella nuova dentro <code>raw/</code>, per esempio <code>raw/2026-08/</code>.
            I nomi dei file non contano: il formato viene riconosciuto dal contenuto.</li>
        <li>Apri l'app e premi <b>Importa estratti → Leggi tutto da raw/</b>. Controlla l'anteprima
            (l'app confronta i suoi totali con quelli stampati sull'estratto) e conferma.</li>
        <li>Vai su <b>Assistente</b> e premi <b>Analizza esercenti</b>: le spese di lavoro finite sulla carta di casa
            vengono separate da quelle vere.</li>
        <li>Passa a <b>Movimenti</b>, filtro <b>Da controllare</b>, e sistema quello che resta.</li>
        <li>Aggiungi con <b>＋ Spesa</b> quello che negli estratti non c'è: contanti, assicurazione, bollette, imprevisti.</li>
        <li>Da <b>Riepilogo</b> scarica <b>PDF</b> e <b>XLSX</b> e salvali in <code>archivio/</code>.</li>
        <li>Su <b>Note</b> scrivi i promemoria per il mese prossimo. Poi <b>Salva backup</b>.</li>
      </ol>

      <h3>👥 Condivisa o personale</h3>
      <p>In <b>⚙ Impostazioni</b> scegli la modalità: <b>condivisa</b> (quella di questa guida — dividi le spese con
      qualcuno, con saldo e quote) oppure <b>personale</b>, per chi vuole solo tenere sotto controllo le proprie
      spese senza dividerle con nessuno — Riepilogo e report cambiano linguaggio di conseguenza,
      ma il resto dell'app (regole, categorie, assistente, ricerca per soggetto) funziona identico.</p>

      <h3>📥 Formati letti, anche da banche diverse da Fineco</h3>
      <p>Oltre a estratto carta, movimenti conto corrente, Telepass ed estratto conto Fineco trimestrale in PDF,
      l'app legge anche un <b>CSV generico</b> di qualunque banca: se il formato non è fra quelli conosciuti,
      alla prima importazione ti chiede quale colonna è la data, quale l'importo e quale la descrizione — te lo
      chiede una volta sola per ogni struttura di intestazione, poi la ricorda per i file successivi.</p>

      <h3>🔭 Mese, trimestre, anno</h3>
      <p>L'interruttore <b>Mese · Trimestre · Anno</b> in cima alla colonna a sinistra cambia lo zoom di
      Riepilogo, Movimenti, Categorie e dei report: stessi calcoli, solo raggruppati su un periodo più largo
      — un trimestre è la somma dei suoi tre mesi. <b>Note, chat e Assistente restano sempre sul mese in corso</b>,
      qualunque zoom tu stia guardando: puoi allargare a "Anno 2026" per farti un'idea d'insieme e i tuoi
      promemoria del mese non si spostano da nessuna parte.</p>

      <h3>🔎 Cerca per soggetto</h3>
      <p>La scheda <b>Soggetti</b> risponde a "quanto abbiamo speso da Decathlon?" o "quanto è entrato con
      quel bonifico?". Scrivi un nome, scegli se cercare su tutto l'archivio o solo nel periodo che stai
      guardando, e vedi entrate, uscite, netto, andamento mese per mese e l'elenco dei movimenti trovati —
      utile anche per rintracciare una spesa che non ricordi in che mese fosse.</p>

      <h3>🕳️ Copertura archivio: cosa manca</h3>
      <p>In cima alla scheda <b>Importa</b> l'app guarda, conto per conto e carta per carta, quali mesi
      hanno almeno un movimento e quali no. Un mese senza movimenti ma con mesi pieni intorno è quasi
      sempre un estratto che manca ancora — un conto usato con regolarità non sta mai fermo un mese
      intero. Gli estratti conto Fineco <b>trimestrali in PDF</b> sono il modo più veloce per riempire
      i buchi: un solo file copre tre mesi di conto corrente e di tutte le carte insieme.</p>
      <p>Il pulsante <b>🗂 Genera/aggiorna catalogo</b> subito sotto scrive <code>raw/catalogo.csv</code> e
      <code>raw/catalogo.md</code>: un indice di ogni file — periodo, tipologia, doppioni, anomalie — senza
      toccare l'archivio dell'app. Utile per tenere ordine quando i documenti si accumulano nel tempo.</p>

      <h3>🟢 Come leggere i colori</h3>
      <p>Ogni riga dei movimenti è colorata secondo come viene contata. Le stesse tinte tornano identiche
      nel PDF e nel foglio Excel, così il colpo d'occhio è sempre lo stesso.</p>
      <div class="legenda" style="margin-bottom:14px">
        <b><i style="background:var(--v-comune);border-left:3px solid var(--v-comune-b)"></i> verde — spesa comune, entra tutta nel conteggio</b>
        <b><i style="background:var(--v-parziale);border-left:3px solid var(--v-parziale-b)"></i> verde chiaro — entra in parte (quota fra 1 e 99%)</b>
      </div>
      <div class="legenda">
        <b><i style="background:var(--v-personale);border-left:3px solid var(--v-personale-b)"></i> ambra — personale o di lavoro, non si divide</b>
        <b><i style="border-left:3px solid var(--bordo2)"></i> grigio — esclusa: doppione, giroconto o prelievo</b>
      </div>

      <h3>⚖️ Come nasce la quota</h3>
      <p>La <b>quota</b> è la percentuale dell'importo che finisce nelle spese comuni. Si forma a tre livelli,
      dal più debole al più forte — vince sempre l'ultimo che interviene:</p>
      <ol>
        <li><b>Il conto di provenienza.</b> Carta condivisa e Telepass entrano al 100%, conto corrente e carta personale allo 0%.</li>
        <li><b>Le regole</b> (scheda Regole, e quelle create dall'assistente) — quelle di partenza sono un modello
            pensato per l'Italia, pensato per essere modificato: cancella, aggiungi, o <b>esporta/importa</b> il tuo
            elenco come file .json per riportarlo su un'altra installazione. Una regola non trascina dentro
            una spesa del conto corrente: te la <i>propone</i> in "Da controllare". Fanno eccezione assicurazioni,
            imprevisti, bollette, manutenzione auto e pedaggi, che si dividono sempre.</li>
        <li><b>La tua correzione a mano.</b> Vince su tutto e non viene mai più sovrascritta.</li>
      </ol>
      <p>La somma delle quote è il <b>totale in comune</b>. Viene diviso secondo la percentuale in
      Impostazioni (oggi ${c.quotaMia != null ? c.quotaMia : 50}% a ${h(c.nomeMio || 'te')}) e confrontato con
      quanto ha già pagato ciascuno: la differenza è il saldo.</p>

      <h3>🧹 Cosa viene escluso da solo</h3>
      <ul>
        <li><b>Doppioni conto ↔ carta.</b> Le spese con la carta di debito compaiono sia nel suo estratto sia nei
            movimenti del conto: l'app riconosce la coppia e le conta una volta sola.</li>
        <li><b>Ricariche della prepagata.</b> Sono giroconti, non spese: la spesa vera è nell'estratto della carta.</li>
        <li><b>Prelievi in contanti.</b> Non sono una spesa finché non sai dove sono finiti: l'app te li segnala
            perché tu registri con <b>＋ Spesa</b> la parte comune.</li>
      </ul>

      <h3>🖱️ Cosa fa ogni pulsante</h3>
      <p>Ferma il puntatore sopra un pulsante qualsiasi dell'app per un attimo e compare la spiegazione.
      Qui sotto l'elenco completo.</p>
      <div class="tastiera">
        ${bottone('⬆', 'Importa estratti', 'Apre la scheda Importa e la finestra per scegliere i file.')}
        ${bottone('🔄', 'Leggi tutto da raw/', 'Trova da solo i file dentro raw/ e li importa. Il modo più veloce.')}
        ${bottone('＋', 'Spesa', 'Aggiunge una spesa che negli estratti non c\'è: contanti, assicurazione, bollette.')}
        ${bottone('⚙', 'Impostazioni', 'Modalità, nomi, percentuale di divisione, chiave e modello dell\'assistente.')}
        ${bottone('⬇', 'Esporta regole', 'Salva le tue regole in un file .json, per riportarle su un\'altra installazione.')}
        ${bottone('⬆', 'Importa regole', 'Sostituisce le regole attuali con quelle di un file .json esportato prima.')}
        ${bottone('📌', 'Blocca assistente', 'Tiene il pannello dell\'assistente sempre aperto come barra laterale.')}
        ${bottone('📄', 'PDF', 'Report completo del mese in PDF, pronto da stampare o mandare.')}
        ${bottone('📗', 'XLSX', 'Report in Excel su quattro fogli, con filtri e righe colorate.')}
        ${bottone('🖨', 'Anteprima stampa', 'Apre il report nel browser: da lì Cmd+P.')}
        ${bottone('📊', 'CSV', 'Solo l\'elenco dei movimenti, per Excel o Numbers.')}
        ${bottone('💾', 'Salva backup', 'Scarica tutto l\'archivio in un file .json. Fallo ogni mese.')}
        ${bottone('📂', 'Ripristina backup', 'Ricarica un backup salvato prima, sostituendo l\'archivio attuale.')}
        ${bottone('🚫', 'Escludi', 'Toglie il movimento dal conteggio senza cancellarlo.')}
        ${bottone('↩', 'Rimetti dentro', 'Riporta nel conteggio un movimento escluso.')}
        ${bottone('📝', 'Nota', 'Attacca un commento al singolo movimento. Finisce anche nel report.')}
        ${bottone('✨', 'Crea regola', 'Trasforma questo movimento in una regola valida per tutti i mesi.')}
        ${bottone('✨', 'Analizza esercenti', 'Chiede a Nemotron quali spese sono di casa e quali di lavoro.')}
        ${bottone('🗑', 'Svuota chat', 'Cancella le domande fatte in questo mese. I dati restano.')}
      </div>

      <h3>⌨️ Scorciatoie</h3>
      <div class="tastiera">
        ${bottone('↵', 'Invio nella chat', 'Manda la domanda. Maiusc+Invio va a capo.')}
        ${bottone('↵', 'Invio nelle note', 'Aggiunge il promemoria senza toccare il mouse.')}
        ${bottone('→', 'Frecce nella visita', 'Avanti e indietro fra i passi. Esc chiude.')}
        ${bottone('🖱', 'Clic su una categoria', 'Dal Riepilogo salta ai movimenti già filtrati.')}
      </div>

      <h3>🔐 Dove finiscono i dati</h3>
      <p>Gli estratti conto non escono dal tuo computer: vengono letti dal browser e conservati in locale.
      L'unica cosa che esce è, quando usi l'assistente, <b>l'elenco dei nomi degli esercenti</b> e il
      <b>riassunto numerico</b> del mese, che vanno ai server NVIDIA per generare la risposta. Non escono
      numeri di carta, IBAN, né i file originali. Se preferisci non usarlo, l'app funziona identica senza.</p>

      <h3>💾 Il backup, l'unica cosa da ricordare</h3>
      <p>L'archivio vive dentro il browser. Sopravvive alla chiusura, <b>non</b> alla cancellazione dei dati
      del browser né a un cambio di computer. Una volta al mese premi <b>Salva backup</b> e metti il file
      <code>.json</code> nella cartella <code>archivio/</code>: con <b>Ripristina backup</b> torna tutto com'era.</p>
    </div>`;
  }

  /* ================================================ modale nuova spesa == */
  function modaleSpesa(A, salva) {
    const oggi = A.mese ? A.mese + '-15' : new Date().toISOString().slice(0, 10);
    const c = A.stato.config;
    modale('Aggiungi una spesa', `
      <div class="avviso info" style="margin-bottom:14px"><span class="ic">💡</span><div class="mini">
        Serve per le spese che non compaiono negli estratti della carta condivisa: contanti,
        assicurazione auto pagata dal conto, bollette, imprevisti, rimborsi.</div></div>
      <div class="g2">
        <div class="campo"><label class="f">Data</label><input type="date" id="mData" value="${oggi}"></div>
        <div class="campo"><label class="f">Importo €</label><input type="number" id="mImporto" step="0.01" min="0" placeholder="480,00"></div>
      </div>
      <div class="campo"><label class="f">Descrizione</label>
        <input type="text" id="mDesc" placeholder="Assicurazione auto Panda — semestre"></div>
      <div class="g2">
        <div class="campo"><label class="f">Categoria</label><select id="mCat">${
          R.CATEGORIE.map((k) => `<option ${k.nome === 'Imprevisti' ? '' : ''}>${k.nome}</option>`).join('')}</select></div>
        <div class="campo"><label class="f">Da dove</label><select id="mConto">
          <option value="contanti">Contanti</option>
          <option value="conto">Conto corrente</option>
          <option value="carta:5678">Carta personale 5678</option>
          <option value="carta:1234">Carta condivisa 1234</option>
          <option value="altro">Altro</option></select></div>
      </div>
      <div class="g2">
        <div class="campo"><label class="f">Quota in comune %</label>
          <input type="number" id="mQuota" value="100" min="0" max="100" step="5"></div>
        <div class="campo"><label class="f">Pagata da</label><select id="mPagata">
          <option value="io">${h(c.nomeMio)}</option><option value="moglie">${h(c.nomeAltro)}</option></select></div>
      </div>
      <div class="campo"><label class="f">Nota (facoltativa)</label>
        <input type="text" id="mNota" placeholder="Rata 1 di 2, scadenza prossima a febbraio"></div>`,
      [{ et: 'Annulla' }, { et: 'Aggiungi spesa', pri: true, fn: (v) => {
        const d = {
          data: $('#mData', v).value,
          importo: $('#mImporto', v).value,
          descrizione: $('#mDesc', v).value.trim(),
          categoria: $('#mCat', v).value,
          conto: $('#mConto', v).value,
          quota: $('#mQuota', v).value,
          pagatoDa: $('#mPagata', v).value,
          nota: $('#mNota', v).value.trim()
        };
        if (!d.data || !d.descrizione || !(U.num(d.importo) > 0)) {
          toast('Servono data, descrizione e un importo maggiore di zero', 'err');
          return false;
        }
        salva(d);
      } }]);
  }

  /* =============================================== modale impostazioni == */
  /** select con i modelli Nemotron disponibili, valorizzato con quello scelto
   *  (o "predefinito" se non c'è ancora una preferenza) */
  function selectModelli(id, modelli, scelto) {
    const opz = ['<option value="">Predefinito del server</option>']
      .concat((modelli || []).map((m) => `<option value="${h(m.id)}">${h(m.etichetta || m.id)}</option>`));
    return `<select id="${id}">${opz.join('')}</select>`;
  }

  function modaleImpostazioni(A, salva) {
    const c = A.stato.config;
    const conti = Object.entries(c.conti);
    const st = IA.stato();
    const personale = c.modalita === 'personale';
    modale('Impostazioni', `
      <div class="campo"><label class="f">Modalità</label>
        <select id="sModalita">
          <option value="condivisa" ${!personale ? 'selected' : ''}>Condivisa — dividi le spese con qualcuno</option>
          <option value="personale" ${personale ? 'selected' : ''}>Personale — solo rendicontazione, senza divisione</option>
        </select></div>

      <div id="sBloccoCondivisa">
        <div class="g2">
          <div class="campo"><label class="f">Come mi chiamo</label><input type="text" id="sNomeMio" value="${h(c.nomeMio)}"></div>
          <div class="campo"><label class="f">Come si chiama l'altra persona</label><input type="text" id="sNomeAltro" value="${h(c.nomeAltro)}"></div>
        </div>
        <div class="campo"><label class="f">Come dividete le spese comuni</label>
          <div class="riga"><input type="range" id="sQuota" min="0" max="100" step="5" value="${c.quotaMia}" style="flex:1">
            <span id="sQuotaEt" class="mono" style="min-width:118px;text-align:right;font-size:12.5px"></span></div>
          <p class="mini muto" style="margin-top:6px">Sposta a 0% se le spese della carta condivisa sono interamente a carico dell'altra persona.</p></div>
      </div>

      <div class="campo"><label class="f">A quale mese assegnare un movimento</label>
        <select id="sComp">
          <option value="contabile" ${c.competenza !== 'operazione' ? 'selected' : ''}>Data contabile — come raggruppa l'estratto (consigliato)</option>
          <option value="operazione" ${c.competenza === 'operazione' ? 'selected' : ''}>Data dell'operazione — quando hai speso davvero</option>
        </select>
        <p class="mini muto" style="margin-top:6px">Con la data contabile i totali del report coincidono con quelli stampati sull'estratto conto, comprese le spese di fine mese addebitate dopo.</p></div>

      <label class="f" style="margin-top:16px">Comportamento predefinito di ogni conto</label>
      ${conti.map(([k, v]) => `<div class="riga" style="margin-bottom:7px;gap:10px">
        <div style="flex:1"><input type="text" data-conto-et="${h(k)}" value="${h(v.etichetta)}" style="font-size:12.5px;padding:5px 8px">
          <div class="mini muto" style="margin-top:2px">${h(v.descrizione || '')}</div></div>
        <input type="number" data-conto-q="${h(k)}" value="${v.quotaBase}" min="0" max="100" step="5" style="width:76px;text-align:right">
        <span class="mini muto">% comune</span></div>`).join('')}
      <p class="mini muto" style="margin-top:10px">Vale solo per i movimenti nuovi che non incontrano nessuna regola.</p>

      <hr style="border:none;border-top:1px solid var(--bordo);margin:18px 0">
      <label class="f">Assistente NVIDIA</label>
      <div class="campo"><label class="f" style="font-weight:400">Chiave API</label>
        <input type="password" id="sChiave" placeholder="${st.chiave ? 'Configurata: ' + st.chiave + ' — lascia vuoto per non cambiarla' : 'nvapi-…'}">
        <p class="mini muto" style="margin-top:5px">Si ottiene gratis su <code>build.nvidia.com</code>. Resta solo su questo computer, non entra mai nel browser.</p></div>
      <div class="campo"><label class="f" style="font-weight:400">Modello</label>
        ${selectModelli('sModello', A.modelliLLM, c.modelloLLM)}</div>

      <hr style="border:none;border-top:1px solid var(--bordo);margin:18px 0">
      <button class="btn" data-azione="azzera-tutto" style="color:var(--bad)">🗑 Svuota tutto l'archivio</button>`,
      [{ et: 'Annulla' }, { et: 'Salva', pri: true, fn: (v) => {
        const nuovo = {
          modalita: $('#sModalita', v).value,
          nomeMio: $('#sNomeMio', v).value.trim() || 'Io',
          nomeAltro: $('#sNomeAltro', v).value.trim() || 'Lei',
          quotaMia: Number($('#sQuota', v).value),
          competenza: $('#sComp', v).value,
          modelloLLM: $('#sModello', v).value || null,
          conti: {}
        };
        for (const [k, val] of conti) {
          nuovo.conti[k] = Object.assign({}, val, {
            etichetta: $(`[data-conto-et="${k}"]`, v).value.trim() || val.etichetta,
            quotaBase: Number($(`[data-conto-q="${k}"]`, v).value)
          });
        }
        salva(nuovo, $('#sChiave', v).value.trim());
      } }]);

    if (A.modelliLLM) $('#sModello').value = c.modelloLLM || '';
    const aggQuota = () => {
      const q = Number($('#sQuota').value);
      $('#sQuotaEt').textContent = `${$('#sNomeMio').value || 'Io'} ${q}% · ${$('#sNomeAltro').value || 'Lei'} ${100 - q}%`;
    };
    const aggModalita = () => {
      $('#sBloccoCondivisa').style.display = $('#sModalita').value === 'personale' ? 'none' : '';
    };
    $('#sQuota').addEventListener('input', aggQuota);
    $('#sNomeMio').addEventListener('input', aggQuota);
    $('#sNomeAltro').addEventListener('input', aggQuota);
    $('#sModalita').addEventListener('change', aggModalita);
    aggQuota(); aggModalita();
  }

  /* ==================================================== wizard di avvio == */
  /** primo avvio: due domande essenziali, tutto il resto resta modificabile
   *  dopo da Impostazioni — non deve sembrare un modulo da compilare */
  function modaleWizard(A, onFine) {
    const v = document.createElement('div');
    v.className = 'velo';
    v.innerHTML = `<div class="modale" style="max-width:460px">
      <h3>Benvenuto in Spese di casa 👋</h3>
      <div class="body">
        <p class="mini muto" style="line-height:1.7;margin-bottom:14px">
          Due domande e sei pronto. Puoi cambiare tutto in qualunque momento da ⚙ Impostazioni.</p>

        <div class="campo"><label class="f">Come vuoi usarla?</label>
          <select id="wModalita">
            <option value="condivisa">Condivido le spese con qualcuno (coppia, conviventi…)</option>
            <option value="personale">Solo per me — nessuna divisione</option>
          </select></div>

        <div id="wBloccoCondivisa">
          <div class="g2" style="margin-top:10px">
            <div class="campo"><label class="f">Come ti chiami</label><input type="text" id="wNomeMio" value="Io"></div>
            <div class="campo"><label class="f">Come si chiama l'altra persona</label><input type="text" id="wNomeAltro" value="Lei"></div>
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--bordo);margin:16px 0">
        <div class="campo"><label class="f">Assistente NVIDIA (facoltativo)</label>
          <input type="password" id="wChiave" placeholder="nvapi-… — puoi aggiungerla anche più tardi">
          <p class="mini muto" style="margin-top:5px">Gratis su <code>build.nvidia.com</code>. Senza chiave l'app funziona lo stesso: l'assistente è un aiuto, non un ingranaggio obbligatorio.</p></div>
      </div>
      <div class="foot">
        <button class="btn pri" data-az="fine">Inizia →</button>
      </div>
    </div>`;
    document.body.appendChild(v);

    $('#wModalita', v).addEventListener('change', () => {
      $('#wBloccoCondivisa', v).style.display = $('#wModalita', v).value === 'personale' ? 'none' : '';
    });

    v.addEventListener('click', (e) => {
      if (!e.target.closest('[data-az="fine"]')) return;
      const modalita = $('#wModalita', v).value;
      const nuovo = {
        modalita,
        nomeMio: (modalita === 'personale' ? $('#wNomeMio', v).value : $('#wNomeMio', v).value).trim() || 'Io',
        nomeAltro: $('#wNomeAltro', v).value.trim() || 'Lei',
        wizardCompletato: true
      };
      const chiave = $('#wChiave', v).value.trim();
      v.remove();
      onFine(nuovo, chiave);
    });
  }

  /* ============================================== modale anteprima import */
  /** una sola volta per struttura di intestazione: chiede quali colonne del
   *  CSV sono data / importo / descrizione, e se gli importi vanno invertiti */
  function modaleMappaCsv(ris, onConferma) {
    const opz = ris.intestazioni.map((et, i) => `<option value="${i}">${h(et || `colonna ${i + 1}`)}</option>`).join('');
    const indovina = (parole) => {
      const i = ris.intestazioni.findIndex((et) => parole.some((p) => norm(et).includes(p)));
      return i > -1 ? i : 0;
    };
    const norm = (s) => String(s || '').toLowerCase();
    const iData = indovina(['data']);
    const iImp = indovina(['importo', 'amount', 'valore']);
    const iDesc = indovina(['descriz', 'causale', 'memo', 'description']);
    const righeAnteprima = ris.anteprimaRighe.map((r) =>
      `<tr>${ris.intestazioni.map((_, i) => `<td class="mini">${h(String(r[i] == null ? '' : r[i]))}</td>`).join('')}</tr>`).join('');

    modale(`Colonne di "${ris.file}"`, `
      <p class="mini muto" style="line-height:1.7;margin-bottom:12px">
        Non riconosco questo formato: probabilmente è l'estratto di una banca diversa da quelle previste.
        Dimmi tu quali colonne usare — te lo chiedo una volta sola per questo tipo di file, poi lo ricordo.</p>
      <div class="tbl-wrap" style="margin-bottom:14px;overflow-x:auto">
        <table class="mov"><thead><tr>${ris.intestazioni.map((et) => `<th>${h(et || '—')}</th>`).join('')}</tr></thead>
        <tbody>${righeAnteprima}</tbody></table>
      </div>
      <div class="g2">
        <div class="campo"><label class="f">Colonna data</label><select id="mapData">${opz}</select></div>
        <div class="campo"><label class="f">Colonna importo</label><select id="mapImporto">${opz}</select></div>
      </div>
      <div class="campo"><label class="f">Colonna descrizione</label><select id="mapDesc">${opz}</select></div>
      <div class="campo"><label class="f">Nome da dare a questo conto</label>
        <input type="text" id="mapConto" value="Importato" placeholder="Es. Conto Widiba, Carta N26…"></div>
      <label class="riga" style="gap:8px;margin-top:4px">
        <input type="checkbox" id="mapSegno">
        <span class="mini">Nel file gli importi positivi sono spese (capita in alcuni export bancari)</span>
      </label>`,
      [{ et: 'Annulla', fn: () => onConferma(null) }, { et: 'Importa con questa mappatura', pri: true, fn: (v) => {
        const mapp = {
          idxData: Number($('#mapData', v).value), idxImporto: Number($('#mapImporto', v).value),
          idxDescrizione: Number($('#mapDesc', v).value),
          nomeConto: $('#mapConto', v).value.trim() || 'Importato',
          segnoInvertito: $('#mapSegno', v).checked
        };
        onConferma(mapp);
      } }]);
    $('#mapData').value = iData; $('#mapImporto').value = iImp; $('#mapDesc').value = iDesc;
  }

  function modaleAnteprima(risultati, conferma) {
    const ok = risultati.filter((r) => !r.errore);
    const ko = risultati.filter((r) => r.errore);
    const totMov = ok.reduce((s, r) => s + r.movimenti.length, 0);
    modale('Anteprima importazione', `
      ${ok.map((r) => `<div class="file-item ${r.quadra === false ? 'err' : ''}">
        <span class="ic">${r.quadra === false ? '⚠️' : r.formato === 'telepass' ? '🛣️' : r.formato === 'conto' ? '🏦' : '💳'}</span>
        <div class="t"><b>${h(r.file)}</b><span>${h(r.formatoNome)} · ${r.movimenti.length} movimenti · ${
          h(r.mesi.map(U.meseBreve).join(', '))} · totale ${U.eur(r.totale)}${
          r.quadra === true ? ' · <span style="color:var(--ok)">✓ quadra con il totale dell\'estratto</span>' : ''}</span>
          ${(r.avvisi || []).map((a) => `<div class="mini" style="color:var(--warn);margin-top:3px">${h(a)}</div>`).join('')}</div></div>`).join('')}
      ${ko.map((r) => `<div class="file-item err"><span class="ic">⚠️</span>
        <div class="t"><b>${h(r.file)}</b><span>${h(r.errore)}</span></div></div>`).join('')}
      ${totMov ? `<p class="mini muto" style="margin-top:14px;line-height:1.6">
        Dopo l'importazione l'app toglierà automaticamente i doppioni fra conto corrente e carte,
        escluderà le ricariche della prepagata e applicherà le regole di categoria.</p>` : ''}`,
      [{ et: 'Annulla' },
       { et: totMov ? `Importa ${totMov} movimenti` : 'Chiudi', pri: true,
         fn: () => { if (totMov) conferma(ok); } }]);
  }

  return { render, toast, modale, modaleSpesa, modaleImpostazioni, modaleAnteprima, modaleMappaCsv, modaleWizard,
           listaProposte, esercentiDaClassificare, riquadroDocumento, bolla, $, $$ };
})();
