/* app.js — avvio, eventi, flusso di importazione ed esportazione */
(function () {
  'use strict';
  const $ = V.$, $$ = V.$$;

  const A = {
    stato: null,
    mese: null,
    periodo: null,        // { tipo: 'mese'|'trimestre'|'anno', chiave } — guida Riepilogo/Movimenti/Categorie/export
    tab: 'riepilogo',
    filtri: { cerca: '', conto: '', categoria: '', stato: '' },
    repCorrente: null,     // rep del periodo attuale (segue A.periodo)
    repMeseCorrente: null, // rep del mese in corso (segue sempre A.mese, per Note/Assistente/+Spesa)
    ricercaSoggetto: null, // { testo, ambito, risultato } della scheda Soggetti
    ordineMov: { campo: 'data', dir: 'desc' }, // ordinamento della tabella Movimenti
    proposte: null,      // esito del motore spese comuni, in attesa di conferma
    documento: null,     // ultimo testo generato dall'assistente
    inAttesa: false,
    inAttesaReport: false,
    reportProposto: null, // { domanda, criteri, ris, descrizione } in attesa di essere esportato
    assistente: { aperto: false, fissato: localStorage.getItem('spese-assist-fissato') === '1' },
    modelliLLM: null      // elenco modelli Nemotron disponibili, caricato al bisogno (Impostazioni/wizard)
  };
  window.A = A;

  /* ---------------------------------------------------- pannello IA ---- */
  function stileAssistente() {
    const app = document.querySelector('.app');
    const attivo = A.assistente.aperto || A.assistente.fissato;
    document.body.classList.toggle('assist-attivo', attivo);
    app.classList.toggle('assist-fissato', A.assistente.fissato);
    $('#assistPanel').classList.toggle('aperto', attivo);
    $('#assistBackdrop').classList.toggle('aperto', A.assistente.aperto && !A.assistente.fissato);
    $('#btnFissaAssist').classList.toggle('on', A.assistente.fissato);
  }
  function apriAssistente() { A.assistente.aperto = true; stileAssistente(); }
  function chiudiAssistente() { A.assistente.aperto = false; stileAssistente(); }
  function fissaAssistente() {
    A.assistente.fissato = !A.assistente.fissato;
    if (A.assistente.fissato) A.assistente.aperto = true;
    try { localStorage.setItem('spese-assist-fissato', A.assistente.fissato ? '1' : '0'); } catch (_) {}
    stileAssistente();
  }

  /** imposta il mese "attivo" (Note/Assistente/+Spesa) e riporta anche la vista
   *  principale sul singolo mese — il punto naturale dopo un'importazione,
   *  una spesa manuale o un ripristino: sai esattamente cosa stai guardando */
  function impostaMese(nuovoMese) {
    A.mese = nuovoMese;
    A.periodo = { tipo: 'mese', chiave: nuovoMese };
  }

  /* ------------------------------------------------------------- avvio -- */
  (async function avvia() {
    A.stato = await S.carica();
    ricalcola(false);
    const mesi = E.mesi(A.stato);
    impostaMese(mesi[0] || null);
    if (!A.stato.movimenti.length) A.tab = 'riepilogo';
    V.render(A);
    stileAssistente();
    collega();
    G.attivaTooltip();
    IA.verifica().then(() => V.render(A));
    if (!A.stato.config.wizardCompletato) {
      A.modelliLLM = await IA.modelli();
      V.modaleWizard(A, async (nuovo, chiaveNuova) => {
        Object.assign(A.stato.config, nuovo);
        ricalcola(); V.render(A);
        if (chiaveNuova) {
          try { await IA.salvaChiave(chiaveNuova); await IA.verifica(); V.render(A); }
          catch (e) { V.toast('La chiave non si è salvata: ' + e.message, 'err'); }
        }
        if (!G.giaVista() && A.stato.movimenti.length) setTimeout(() => G.avvia(vaiA), 400);
      });
    } else if (!G.giaVista() && A.stato.movimenti.length) {
      setTimeout(() => G.avvia(vaiA), 900);
    }
  })();

  /** cambia scheda dall'esterno (usata dalla visita guidata) */
  function vaiA(tab) {
    if (tab === 'assistente') { apriAssistente(); return; }
    A.tab = tab; V.render(A);
  }

  /** riapplica regole + deduplica su tutto l'archivio */
  function ricalcola(salva) {
    R.applica(A.stato.movimenti, A.stato.config);
    R.deduplica(A.stato.movimenti);
    if (salva !== false) S.salva(A.stato);
  }

  const aggiorna = () => { S.salva(A.stato); V.render(A); };

  /* ---------------------------------------------------------- eventi ---- */
  function collega() {
    // navigazione
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { A.tab = tab.dataset.tab; V.render(A); return; }

      const per = e.target.closest('[data-periodo]');
      if (per) {
        A.periodo = { tipo: A.periodo.tipo, chiave: per.dataset.periodo };
        if (A.periodo.tipo === 'mese') A.mese = per.dataset.periodo;
        V.render(A);
        return;
      }
      const gr = e.target.closest('[data-gran]');
      if (gr) {
        const tipo = gr.dataset.gran;
        const chiave = tipo === 'mese' ? (A.mese || E.mesi(A.stato)[0] || null)
          : tipo === 'trimestre' ? (A.mese ? U.trimestreDiMese(A.mese) : E.trimestri(A.stato)[0] || null)
          : (A.mese ? U.annoDiMese(A.mese) : E.anni(A.stato)[0] || null);
        A.periodo = { tipo, chiave };
        V.render(A);
        return;
      }

      const az = e.target.closest('[data-azione]');
      if (az) { e.preventDefault(); azione(az.dataset.azione, az); return; }

      const ord = e.target.closest('[data-ordina]');
      if (ord) {
        const campo = ord.dataset.ordina;
        if (A.ordineMov.campo === campo) A.ordineMov.dir = A.ordineMov.dir === 'asc' ? 'desc' : 'asc';
        else { A.ordineMov.campo = campo; A.ordineMov.dir = campo === 'data' ? 'desc' : 'asc'; }
        V.render(A);
        return;
      }

      // scorciatoie dal riepilogo verso i movimenti filtrati
      const fc = e.target.closest('[data-filtra-cat]');
      if (fc) { A.filtri = { cerca: '', conto: '', categoria: fc.dataset.filtraCat, stato: '' }; A.tab = 'movimenti'; V.render(A); return; }
      const fk = e.target.closest('[data-filtra-conto]');
      if (fk) { A.filtri = { cerca: '', conto: fk.dataset.filtraConto, categoria: '', stato: '' }; A.tab = 'movimenti'; V.render(A); return; }
      const fs = e.target.closest('[data-cerca]');
      if (fs) { A.filtri = { cerca: fs.dataset.cerca, conto: '', categoria: '', stato: '' }; A.tab = 'movimenti'; V.render(A); return; }

      // note
      const nt = e.target.closest('[data-nota-az]');
      if (nt) { gestisciNota(nt); return; }

      // regole: elimina
      const rd = e.target.closest('[data-rc="del"]');
      if (rd) {
        A.stato.config.regole.splice(+rd.closest('[data-regola]').dataset.regola, 1);
        ricalcola(); V.render(A); V.toast('Regola eliminata'); return;
      }

      // rimozione di un file importato
      const rf = e.target.closest('[data-rimuovi-file]');
      if (rf) { rimuoviImportazione(rf.dataset.rimuoviFile, +rf.dataset.rimuoviQuando); return; }

      // riga movimento: pulsanti
      const camp = e.target.closest('[data-campo]');
      if (camp && camp.tagName === 'BUTTON') { azioneMovimento(camp); return; }

      const dom = e.target.closest('[data-domanda]');
      if (dom) { inviaChat(dom.dataset.domanda); return; }
      const domr = e.target.closest('[data-domanda-report]');
      if (domr) { richiediReport(domr.dataset.domandaReport); return; }
    });

    // modifiche inline (select / number / checkbox)
    document.addEventListener('change', (e) => {
      const camp = e.target.closest('[data-campo]');
      if (camp && camp.tagName !== 'BUTTON') { modificaMovimento(camp); return; }

      const rc = e.target.closest('[data-rc]');
      if (rc) { modificaRegola(rc); return; }

      const pc = e.target.closest('[data-pc]');
      if (pc) {
        const p = A.proposte[+pc.closest('[data-prop]').dataset.prop];
        const k = pc.dataset.pc;
        if (k === 'ok') p.accetta = pc.checked;
        else if (k === 'quota') { p.quota = Number(pc.value); p.comune = p.quota > 0; }
        else p.categoria = pc.value;
        V.render(A);
        return;
      }

      if (e.target.id === 'fStato')  { A.filtri.stato = e.target.value; V.render(A); }
      if (e.target.id === 'fConto')  { A.filtri.conto = e.target.value; V.render(A); }
      if (e.target.id === 'fCat')    { A.filtri.categoria = e.target.value; V.render(A); }
      if (e.target.id === 'selPeriodo') {
        A.periodo.chiave = e.target.value;
        if (A.periodo.tipo === 'mese') A.mese = e.target.value;
        V.render(A);
      }
    });

    // ricerca con debounce, senza perdere il focus
    let tCerca;
    document.addEventListener('input', (e) => {
      if (e.target.id !== 'fCerca') return;
      clearTimeout(tCerca);
      const v = e.target.value;
      tCerca = setTimeout(() => {
        A.filtri.cerca = v;
        V.render(A);
        const c = $('#fCerca');
        if (c) { c.focus(); c.setSelectionRange(v.length, v.length); }
      }, 260);
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'nuovaNota' && e.key === 'Enter') { e.preventDefault(); aggiungiNota(); }
      if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); inviaChat();
      }
      if (e.target.id === 'reportInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); richiediReport();
      }
      if (e.target.id === 'soggQuery' && e.key === 'Enter') { e.preventDefault(); cercaSoggetto(); }
    });

    // pulsanti fissi in alto
    $('#btnImporta').onclick = () => { A.tab = 'importa'; V.render(A); $('#filePicker').click(); };
    $('#btnManuale').onclick = () => V.modaleSpesa(A, aggiungiSpesaManuale);
    $('#btnImpostazioni').onclick = async () => {
      if (!A.modelliLLM) A.modelliLLM = await IA.modelli();
      V.modaleImpostazioni(A, async (nuovo, chiaveNuova) => {
        Object.assign(A.stato.config, nuovo);
        ricalcola(); V.render(A);
        if (chiaveNuova) {
          try { await IA.salvaChiave(chiaveNuova); await IA.verifica(); V.render(A); V.toast('Impostazioni salvate, chiave aggiornata', 'ok'); }
          catch (e) { V.toast('Impostazioni salvate, ma la chiave non si è salvata: ' + e.message, 'err'); }
        } else {
          V.toast('Impostazioni salvate', 'ok');
        }
      });
    };
    $('#btnGuida').onclick = () => { A.tab = 'guida'; V.render(A); };
    $('#btnBackup').onclick = backup;
    $('#btnRipristina').onclick = () => $('#backupPicker').click();

    $('#filePicker').onchange = (e) => { importaFile([...e.target.files]); e.target.value = ''; };
    $('#backupPicker').onchange = (e) => { ripristina(e.target.files[0]); e.target.value = ''; };
    $('#regolePicker').onchange = (e) => { importaRegole(e.target.files[0]); e.target.value = ''; };

    // trascinamento file su tutta la finestra
    let dragN = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; hot(true); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('dragleave', () => { if (--dragN <= 0) hot(false); });
    window.addEventListener('drop', (e) => {
      e.preventDefault(); dragN = 0; hot(false);
      const files = [...(e.dataTransfer.files || [])]
        .filter((f) => /\.(xlsx|xls|csv|pdf)$/i.test(f.name));
      if (files.length) importaFile(files);
      else if (e.dataTransfer.files.length) V.toast('Trascina file .xlsx, .xls o .csv', 'err');
    });
    const hot = (on) => { const d = $('#dropzone'); if (d) d.classList.toggle('hot', on); };

    document.addEventListener('archivio-salvato', () => {
      const el = $('#statoSalvataggio');
      if (el) el.innerHTML = `✓ Archivio salvato<br>${A.stato.movimenti.length} movimenti · ${
        E.mesi(A.stato).length} mesi`;
    });
  }

  /* ---------------------------------------------------------- azioni ---- */
  function azione(nome, el) {
    const rep = A.repCorrente;
    const repMese = A.repMeseCorrente;
    switch (nome) {
      case 'apri-file': $('#filePicker').click(); break;
      case 'scansiona-raw': scansionaRaw(); break;
      case 'genera-catalogo': generaCatalogo(); break;
      case 'visita': G.avvia(vaiA); break;
      case 'report-pdf': esportaPdf(rep); break;
      case 'report-xlsx': esportaXlsx(rep); break;
      case 'analizza-ia': analizzaConIA(repMese); break;
      case 'applica-proposte': applicaProposte(); break;
      case 'scarta-proposte': A.proposte = null; V.render(A); break;
      case 'prop-tutte': A.proposte.forEach((p) => (p.accetta = true)); V.render(A); break;
      case 'prop-nessuna': A.proposte.forEach((p) => (p.accetta = false)); V.render(A); break;
      case 'prop-sicure': A.proposte.forEach((p) => (p.accetta = p.fiducia >= 0.8)); V.render(A); break;
      case 'ia-doc': generaDocumento(el.dataset.tipo, repMese); break;
      case 'cerca-soggetto': cercaSoggetto(); break;
      case 'copia-doc':
        navigator.clipboard.writeText(A.documento.testo)
          .then(() => V.toast('Testo copiato', 'ok'))
          .catch(() => V.toast('Non riesco a copiare: selezionalo a mano', 'err'));
        break;
      case 'usa-commento':
        A.stato.commenti = A.stato.commenti || {};
        A.stato.commenti[A.mese] = A.documento.testo;
        S.salva(A.stato);
        V.toast('Commento salvato: comparirà in cima al PDF e al foglio Excel', 'ok');
        break;
      case 'usa-note': {
        const righe = A.documento.testo.split('\n')
          .map((r) => r.replace(/^[-*•\d.)\s]+/, '').trim()).filter((r) => r.length > 3);
        A.stato.note[A.mese] = A.stato.note[A.mese] || [];
        for (const t of righe) A.stato.note[A.mese].push({ testo: t, fatto: false, creata: Date.now() });
        A.tab = 'note'; aggiorna();
        V.toast(righe.length + ' promemoria aggiunti', 'ok');
        break;
      }
      case 'chat-invia': inviaChat(); break;
      case 'chat-pulisci':
        if (A.stato.chat) delete A.stato.chat[A.mese];
        aggiorna(); break;
      case 'assist-apri': apriAssistente(); break;
      case 'assist-chiudi': chiudiAssistente(); break;
      case 'assist-fissa': fissaAssistente(); break;
      case 'report-chiedi': richiediReport(); break;
      case 'report-scarta': A.reportProposto = null; V.render(A); break;
      case 'report-pdf-libero': esportaReportPdf(); break;
      case 'report-xlsx-libero': esportaReportXlsx(); break;
      case 'vai-controlli': A.filtri = { cerca: '', conto: '', categoria: '', stato: 'controllare' };
        A.tab = 'movimenti'; V.render(A); break;
      case 'vai-note': A.tab = 'note'; V.render(A); break;
      case 'aggiungi-nota': aggiungiNota(); break;
      case 'report-html': apriReport(rep); break;
      case 'export-csv': esportaCsv(rep); break;
      case 'nuova-regola':
        A.stato.config.regole.unshift({ m: 'NUOVO TESTO', cat: 'Altro', quota: 100 });
        ricalcola(); V.render(A); break;
      case 'riapplica':
        for (const m of A.stato.movimenti) m.bloccato = m.manuale;
        ricalcola(); V.render(A);
        V.toast('Regole riapplicate a tutto l\'archivio (le modifiche manuali sono state ripristinate)', 'ok'); break;
      case 'esporta-regole':
        U.scarica('regole-spese-di-casa.json', JSON.stringify(A.stato.config.regole, null, 2), 'application/json');
        V.toast('Regole esportate', 'ok');
        break;
      case 'importa-regole': $('#regolePicker').click(); break;
      case 'esporta-regole-md': {
        const md = R.regoleMarkdown(A.stato.config.regole, A.stato.config.conti);
        U.scarica('regole-spese-di-casa.md', md, 'text/markdown;charset=utf-8');
        V.toast('Regole esportate in Markdown', 'ok');
        break;
      }
      case 'reset-regole':
        V.modale('Ripristinare le regole di partenza?',
          '<p class="mini muto">Le regole che hai aggiunto o modificato andranno perse. I movimenti che hai corretto a mano restano come sono.</p>',
          [{ et: 'Annulla' }, { et: 'Ripristina', pri: true, fn: () => {
            A.stato.config.regole = JSON.parse(JSON.stringify(R.REGOLE_DEFAULT));
            ricalcola(); V.render(A); V.toast('Regole ripristinate', 'ok');
          } }]);
        break;
      case 'azzera-tutto':
        V.modale('Svuotare tutto l\'archivio?',
          '<p class="mini muto">Verranno cancellati tutti i movimenti, le note e le regole. Operazione non annullabile: salva prima un backup.</p>',
          [{ et: 'Annulla' }, { et: 'Svuota tutto', pri: true, fn: async () => {
            await S.azzera();
            A.stato = S.VUOTO(); impostaMese(null); A.tab = 'riepilogo';
            S.salva(A.stato); V.render(A); V.toast('Archivio svuotato');
            $$('.velo').forEach((v) => v.remove());
          } }]);
        break;
    }
  }

  /* ------------------------------------------- scansione cartella raw/ -- */

  /** legge l'elenco dei file da una cartella servita dal server locale */
  async function elenco(percorso) {
    const r = await fetch(percorso, { cache: 'no-store' });
    if (!r.ok) throw new Error('cartella non raggiungibile (' + r.status + ')');
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const voci = [...doc.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !href.startsWith('..') && !href.startsWith('/') &&
                        !href.startsWith('?') && !href.startsWith('#'));
    return [...new Set(voci)];
  }

  /** scarica ricorsivamente raw/ e importa tutto quello che trova (max 2 livelli) */
  async function scansionaRaw() {
    if (location.protocol === 'file:') {
      V.modale('Serve avviare l\'app dal server locale', `
        <p class="mini muto" style="line-height:1.7">Per leggere da sola la cartella <code>raw/</code> l'app deve girare su un
        indirizzo <code>http://localhost</code>, non aperta come file.<br><br>
        Chiudi questa finestra e fai <b>doppio clic su <code>avvia.command</code></b> nella cartella del progetto:
        si apre da solo il browser all'indirizzo giusto.<br><br>
        In alternativa puoi sempre trascinare i file qui dentro a mano: funziona in ogni caso.</p>`,
        [{ et: 'Ho capito', pri: true }]);
      return;
    }
    V.toast('Cerco i file dentro raw/…');
    let percorsi = [];
    try {
      for (const v of await elenco('raw/')) {
        if (v.endsWith('/')) {
          for (const f of await elenco('raw/' + v)) {
            if (/\.(xlsx|xls|csv|pdf)$/i.test(f) && !/^catalogo\.(csv|md)$/i.test(f)) percorsi.push('raw/' + v + f);
          }
        } else if (/\.(xlsx|xls|csv|pdf)$/i.test(v) && !/^catalogo\.(csv|md)$/i.test(v)) percorsi.push('raw/' + v);
      }
    } catch (e) {
      V.toast('Non riesco a leggere la cartella raw/: ' + e.message, 'err');
      return;
    }
    if (!percorsi.length) {
      V.modale('Cartella raw/ vuota', `
        <p class="mini muto" style="line-height:1.7">Non ho trovato nessun file <code>.xlsx</code>, <code>.xls</code> o <code>.csv</code>.<br><br>
        Crea una sottocartella per il mese (per esempio <code>raw/2026-08/</code>), metti dentro
        gli estratti scaricati dalla banca e dal Telepass, poi riprova.</p>`,
        [{ et: 'Chiudi', pri: true }]);
      return;
    }
    const files = [];
    for (const p of percorsi) {
      try {
        const b = await (await fetch(p, { cache: 'no-store' })).blob();
        const f = new File([b], decodeURIComponent(p.replace(/^raw\//, '')));
        files.push(f);
      } catch (e) { console.warn('salto', p, e); }
    }
    if (!files.length) { V.toast('Nessun file scaricabile da raw/', 'err'); return; }
    importaFile(files);
  }

  /* --------------------------------------------------- catalogo di raw/ -- */
  const ETICHETTA_CONTO_CATALOGO = {
    conto: 'Conto corrente', 'carta:1234': 'Carta condivisa 1234', 'carta:5678': 'Carta personale 5678',
    telepass: 'Telepass'
  };
  const etichettaContoCatalogo = (c) => ETICHETTA_CONTO_CATALOGO[c] ||
    (c.startsWith('carta:') ? 'Carta ' + c.slice(6) : c);
  /** raggruppa i formati "Estratto conto Fineco (PDF, gen-mar 2020)" sotto un'unica voce */
  const categoriaCatalogo = (f) => (f || 'non riconosciuto').replace(/\s*\(PDF,.*?\)/, ' (PDF)');

  /**
   * Rilegge ogni file trovato in raw/ con gli stessi lettori usati per
   * importare, e scrive due file — catalogo.csv e catalogo.md — con il
   * periodo e la tipologia di ciascuno. Non tocca l'archivio dell'app: serve
   * solo a tenere un riferimento leggibile di cosa c'è dentro raw/, anche
   * fuori dal browser.
   */
  async function generaCatalogo() {
    if (location.protocol === 'file:') {
      V.toast('Serve avviare l\'app con avvia.command per leggere raw/', 'err');
      return;
    }
    V.toast('Rileggo tutti i file di raw/ per aggiornare il catalogo…');

    let percorsi = [];
    try {
      for (const v of await elenco('raw/')) {
        if (v.endsWith('/')) {
          for (const f of await elenco('raw/' + v)) {
            const nomeDecodificato = decodeURIComponent(f);
            if (/\.(xlsx|xls|csv|pdf)$/i.test(nomeDecodificato) && !/^catalogo\.(csv|md)$/i.test(nomeDecodificato)) {
              percorsi.push({ cartella: decodeURIComponent(v).replace(/\/$/, ''), nome: nomeDecodificato, path: 'raw/' + v + f });
            }
          }
        } else if (/\.(xlsx|xls|csv|pdf)$/i.test(v) && !/^catalogo\.(csv|md)$/i.test(decodeURIComponent(v))) {
          percorsi.push({ cartella: '(raw/)', nome: decodeURIComponent(v), path: 'raw/' + v });
        }
      }
    } catch (e) {
      V.toast('Non riesco a leggere la cartella raw/: ' + e.message, 'err');
      return;
    }
    if (!percorsi.length) { V.toast('Cartella raw/ vuota: niente da catalogare', 'err'); return; }

    const righe = [];
    for (const { cartella, nome, path } of percorsi) {
      let r;
      try {
        const blob = await (await fetch(path, { cache: 'no-store' })).blob();
        r = await P.analizza(new File([blob], nome));
      } catch (e) {
        r = { errore: 'eccezione: ' + e.message };
      }
      righe.push({
        cartella, file: nome, formato: r.formatoNome || null, errore: r.errore || null,
        mesi: r.mesi || [], conti: r.conti || [],
        nMovimenti: r.movimenti ? r.movimenti.length : 0,
        totale: r.totale != null ? r.totale : null, quadra: r.quadra
      });
    }

    // trova i file scaricati più volte con lo stesso contenuto (stesso formato,
    // stessi mesi, stesso totale, stesso numero di movimenti)
    const gruppi = new Map();
    for (const r of righe) {
      const k = [r.formato, r.mesi.join(','), [...r.conti].sort().join(','), r.totale, r.nMovimenti].join('|');
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(r.file);
    }
    for (const r of righe) {
      const k = [r.formato, r.mesi.join(','), [...r.conti].sort().join(','), r.totale, r.nMovimenti].join('|');
      r.duplicatoDi = gruppi.get(k).filter((f) => f !== r.file);
    }

    righe.sort((a, b) => (a.mesi[0] || '9999').localeCompare(b.mesi[0] || '9999') ||
                          a.cartella.localeCompare(b.cartella) || a.file.localeCompare(b.file));

    // ---- catalogo.csv ----
    const csvRighe = [['Cartella', 'File', 'Formato', 'Periodo (mesi coperti)', 'Tipologie/conti',
                       'N. movimenti', 'Totale €', 'Quadratura', 'Duplicato di', 'Note']];
    for (const r of righe) {
      const quadra = r.quadra === true ? 'OK' : r.quadra === false ? 'NON QUADRA' : '—';
      const nota = r.errore || (r.duplicatoDi.length ? 'file scaricato più volte, stesso contenuto' : '');
      csvRighe.push([r.cartella, r.file, r.formato || 'non riconosciuto', r.mesi.join(', '),
        r.conti.map(etichettaContoCatalogo).join(', '), r.nMovimenti,
        r.totale != null ? U.eurPlain(r.totale) : '', quadra, r.duplicatoDi.join(', '), nota]);
    }
    const csv = '﻿' + csvRighe.map((riga) => riga.map((c) => {
      const s = String(c == null ? '' : c);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');

    // ---- catalogo.md ----
    const perTipo = new Map();
    for (const r of righe) {
      const t = categoriaCatalogo(r.formato);
      if (!perTipo.has(t)) perTipo.set(t, { file: 0, mov: 0, mesi: new Set() });
      const s = perTipo.get(t);
      s.file++; s.mov += r.nMovimenti; r.mesi.forEach((m) => s.mesi.add(m));
    }
    const tuttiMesi = [...new Set(righe.flatMap((r) => r.mesi))].sort();
    const nonQuadra = righe.filter((r) => r.quadra === false);
    const fattiDup = new Set();
    const gruppiDup = [];
    for (const r of righe) {
      if (!r.duplicatoDi.length) continue;
      const g = [r.file, ...r.duplicatoDi].sort();
      const gk = g.join('|');
      if (fattiDup.has(gk)) continue;
      fattiDup.add(gk);
      gruppiDup.push({ file: g, r });
    }

    const md = [];
    md.push('# Catalogo dei file in `raw/`\n');
    md.push(`Generato il ${new Date().toLocaleDateString('it-IT')} leggendo **${righe.length} file** con gli stessi ` +
      'lettori usati dall\'app (`js/parser.js`, `js/parserpdf.js`, `js/parsertelepass.js`) — non è un elenco a mano, ' +
      'è il risultato vero dell\'analisi di ogni file.\n');
    if (tuttiMesi.length) {
      md.push(`Periodo complessivo coperto da almeno un file: **${tuttiMesi[0]} → ${tuttiMesi[tuttiMesi.length - 1]}** ` +
        `(${tuttiMesi.length} mesi diversi).\n`);
    }
    md.push('## Per tipologia\n');
    md.push('| Formato | File | Movimenti letti | Mesi diversi toccati |');
    md.push('|---|---:|---:|---:|');
    for (const [t, s] of [...perTipo].sort((a, b) => b[1].mov - a[1].mov)) {
      md.push(`| ${t} | ${s.file} | ${s.mov} | ${s.mesi.size} |`);
    }
    md.push('');
    md.push('## File doppi (stesso contenuto scaricato più volte)\n');
    if (gruppiDup.length) {
      for (const { file, r } of gruppiDup) {
        md.push(`- **${file.join(', ')}** — ${r.formato}, ${r.mesi[0]}${r.mesi.length > 1 ? ' → ' + r.mesi[r.mesi.length - 1] : ''} ` +
          `(${r.nMovimenti} mov., ${U.eur(r.totale)}). Non è un problema: l'app li riconosce come lo stesso movimento e non li conta due volte.`);
      }
    } else md.push('Nessuno trovato.');
    md.push('');
    md.push('## File che non quadrano con il totale dichiarato\n');
    if (nonQuadra.length) {
      for (const r of nonQuadra) {
        md.push(`- **${r.cartella}/${r.file}** — ${r.formato}, ${r.mesi[0] || '?'}: letti ${U.eur(r.totale)} ` +
          'contro un totale diverso dichiarato dalla banca. Da controllare (l\'app lo segnala di nuovo in anteprima quando lo importi).');
      }
    } else md.push('Nessuno: tutti i file con un totale dichiarato dalla banca coincidono con quanto letto.');
    md.push('');
    md.push('## Dettaglio completo\n');
    md.push('Il dettaglio riga per riga — periodo esatto e tipologia di ciascun file — è nel file ' +
      '**`catalogo.csv`** nella stessa cartella, apribile con Excel o Numbers.\n');

    const r1 = await U.salvaRaw('catalogo.csv', csv, 'text/csv;charset=utf-8');
    const r2 = await U.salvaRaw('catalogo.md', md.join('\n') + '\n', 'text/markdown;charset=utf-8');
    if (r1.salvatoSulServer && r2.salvatoSulServer) {
      V.toast(`Catalogo aggiornato: ${righe.length} file, ${gruppiDup.length} doppi, ${nonQuadra.length} da controllare`, 'ok',
        { testo: '📂 Apri nel Finder', onClick: () => apriNelFinder(r1.percorso) });
    } else {
      V.toast('Catalogo scaricato (il server locale non era raggiungibile per uno dei due file)', 'err');
    }
    if (A.tab === 'importa') V.render(A);
  }

  /* ------------------------------------------------------ importazione -- */
  async function importaFile(files) {
    V.toast(`Lettura di ${files.length} file…`);
    const risultati = [];
    for (const f of files) risultati.push(await P.analizza(f));
    await risolviMappatureCsv(risultati);
    const validi = risultati.filter((r) => !r.errore);
    if (!validi.length) {
      V.modaleAnteprima(risultati, () => {});
      return;
    }
    V.modaleAnteprima(risultati, conferma);
  }

  /** file CSV non riconosciuti: usa la mappatura già nota per questa intestazione,
   *  oppure la chiede una volta (e la ricorda per la prossima volta) */
  async function risolviMappatureCsv(risultati) {
    for (let i = 0; i < risultati.length; i++) {
      const r = risultati[i];
      if (!r.richiedeMappatura) continue;
      A.stato.config.mappatureCsv = A.stato.config.mappatureCsv || {};
      const nota = A.stato.config.mappatureCsv[r.fingerprint];
      if (nota) {
        risultati[i] = P.costruisciDaMappatura(r.righeComplete, r.rigaIntestazione, nota, r.file);
        continue;
      }
      const mapp = await new Promise((res) => V.modaleMappaCsv(r, res));
      if (!mapp) { risultati[i] = { file: r.file, errore: 'Importazione annullata: colonne non indicate.' }; continue; }
      A.stato.config.mappatureCsv[r.fingerprint] = mapp;
      if (!A.stato.config.conti[mapp.nomeConto]) {
        A.stato.config.conti[mapp.nomeConto] = { etichetta: mapp.nomeConto, quotaBase: 0, pagatoDa: 'io',
          descrizione: 'Importato da un CSV generico: per default resta fuori dalle spese comuni.' };
      }
      S.salva(A.stato);
      risultati[i] = P.costruisciDaMappatura(r.righeComplete, r.rigaIntestazione, mapp, r.file);
    }
  }

  /** "ROSSI MARIO" -> "Mario" (nei tracciati bancari italiani il nome è l'ultima parola) */
  function nomeDaIntestatario(txt) {
    const parti = String(txt || '').trim().split(/\s+/).filter(Boolean);
    if (!parti.length) return null;
    const n = parti[parti.length - 1];
    return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  }

  function conferma(risultati) {
    if (A.stato.config.nomeMio === 'Io') {
      const intest = risultati.map((r) => r.intestatario).find(Boolean);
      const nome = nomeDaIntestatario(intest);
      if (nome) A.stato.config.nomeMio = nome;
    }
    const esistenti = new Set(A.stato.movimenti.map((m) => m.id));
    let nuoviTot = 0, saltatiTot = 0;
    for (const r of risultati) {
      let nuovi = 0, saltati = 0;
      for (const m of r.movimenti) {
        if (esistenti.has(m.id)) { saltati++; continue; }
        esistenti.add(m.id);
        A.stato.movimenti.push(m);
        nuovi++;
      }
      nuoviTot += nuovi; saltatiTot += saltati;
      A.stato.importazioni.push({
        file: r.file, formato: r.formato, formatoNome: r.formatoNome,
        mesi: r.mesi, nuovi, saltati, quando: Date.now()
      });
    }
    ricalcola();
    const mesi = E.mesi(A.stato);
    const nuoviMesi = [...new Set(risultati.flatMap((r) => r.mesi))].sort().reverse();
    impostaMese(nuoviMesi[0] || mesi[0]);
    A.tab = 'riepilogo';
    V.render(A);
    V.toast(`${nuoviTot} movimenti importati${saltatiTot ? `, ${saltatiTot} già presenti` : ''}`, 'ok');
  }

  function rimuoviImportazione(file, quando) {
    V.modale('Rimuovere questo file?',
      `<p class="mini muto">Verranno tolti dall'archivio i movimenti importati da <b>${U.escapeHtml(file)}</b>.
       Le spese inserite a mano non vengono toccate.</p>`,
      [{ et: 'Annulla' }, { et: 'Rimuovi', pri: true, fn: () => {
        const prima = A.stato.movimenti.length;
        A.stato.movimenti = A.stato.movimenti.filter((m) => m.manuale || m.nomeFile !== file);
        A.stato.importazioni = A.stato.importazioni.filter((i) => !(i.file === file && i.quando === quando));
        ricalcola();
        if (!A.stato.movimenti.some((m) => m.mese === A.mese)) impostaMese(E.mesi(A.stato)[0] || null);
        V.render(A);
        V.toast(`${prima - A.stato.movimenti.length} movimenti rimossi`);
      } }]);
  }

  /* ------------------------------------------------ modifiche movimenti -- */
  const trovaMov = (el) => {
    const id = el.closest('[data-id]').dataset.id;
    return A.stato.movimenti.find((m) => m.id === id);
  };

  function modificaMovimento(el) {
    const m = trovaMov(el);
    if (!m) return;
    const campo = el.dataset.campo;
    if (campo === 'quota') m.quota = Math.max(0, Math.min(100, Number(el.value) || 0));
    else m[campo] = el.value;
    m.bloccato = true;
    m.suggerimento = null;
    aggiorna();
  }

  function azioneMovimento(btn) {
    const m = trovaMov(btn);
    if (!m) return;
    const campo = btn.dataset.campo;
    if (campo === 'toggle') {
      m.escluso = !m.escluso;
      m.motivoEsclusione = m.escluso ? 'manuale' : null;
      m.bloccato = true; m.suggerimento = null;
      aggiorna();
    } else if (campo === 'nota') {
      V.modale('Nota sul movimento',
        `<p class="mini muto" style="margin-bottom:10px">${U.escapeHtml(U.pulisci(m.descrizione))} · ${U.eur(m.importo)}</p>
         <textarea id="nMov" rows="3" placeholder="Es. metà è un regalo per mia madre">${U.escapeHtml(m.nota || '')}</textarea>`,
        [{ et: 'Annulla' }, { et: 'Salva', pri: true, fn: (v) => {
          m.nota = $('#nMov', v).value.trim(); m.bloccato = true; aggiorna();
        } }]);
    } else if (campo === 'regola') {
      const testo = (m.esercente || U.pulisci(m.descrizione)).split(' ').slice(0, 2).join(' ').toUpperCase();
      V.modale('Nuova regola da questo movimento', `
        <div class="campo"><label class="f">Testo da cercare nella descrizione</label>
          <input type="text" id="rM" value="${U.escapeHtml(testo)}">
          <p class="mini muto" style="margin-top:5px">Più parole separate da <code>|</code>. Attuale: <em>${U.escapeHtml(U.pulisci(m.descrizione))}</em></p></div>
        <div class="g2">
          <div class="campo"><label class="f">Categoria</label><select id="rC">${
            R.CATEGORIE.map((k) => `<option ${k.nome === m.categoria ? 'selected' : ''}>${k.nome}</option>`).join('')}</select></div>
          <div class="campo"><label class="f">Quota comune %</label>
            <input type="number" id="rQ" value="${m.quota || 0}" min="0" max="100" step="5"></div>
        </div>`,
        [{ et: 'Annulla' }, { et: 'Crea regola', pri: true, fn: (v) => {
          const pat = $('#rM', v).value.trim();
          if (!pat) return false;
          A.stato.config.regole.unshift({ m: pat, cat: $('#rC', v).value, quota: Number($('#rQ', v).value) });
          // sblocca i movimenti simili perché la nuova regola li ricategorizzi
          const re = new RegExp(pat, 'i');
          let n = 0;
          for (const x of A.stato.movimenti) {
            if (!x.manuale && re.test(x.descrizionePulita)) { x.bloccato = false; n++; }
          }
          ricalcola(); V.render(A);
          V.toast(`Regola creata e applicata a ${n} movimenti`, 'ok');
        } }]);
    }
  }

  function modificaRegola(el) {
    const i = +el.closest('[data-regola]').dataset.regola;
    const r = A.stato.config.regole[i];
    const k = el.dataset.rc;
    if (k === 'quota') r.quota = el.value === '' ? null : Number(el.value);
    else r[k] = el.value;
    ricalcola(); V.render(A);
  }

  /* ------------------------------------------------------- spesa a mano -- */
  function aggiungiSpesaManuale(d) {
    const m = P.manuale(d);
    A.stato.movimenti.push(m);
    R.deduplica(A.stato.movimenti);
    impostaMese(m.mese);
    A.tab = 'movimenti';
    A.filtri = { cerca: '', conto: '', categoria: '', stato: '' };
    aggiorna();
    V.toast(`Spesa aggiunta a ${U.meseLabel(m.mese)}`, 'ok');
  }

  /* --------------------------------------------------------- soggetti --- */
  function cercaSoggetto() {
    const testo = ($('#soggQuery') && $('#soggQuery').value || '').trim();
    const ambito = ($('#soggAmbito') && $('#soggAmbito').value) || 'tutto';
    if (!testo) { A.ricercaSoggetto = null; V.render(A); return; }
    const periodo = ambito === 'periodo' ? A.periodo : null;
    A.ricercaSoggetto = { testo, ambito, risultato: E.cercaSoggetto(A.stato, testo, periodo) };
    V.render(A);
    setTimeout(() => { const i = $('#soggQuery'); if (i) { i.focus(); i.setSelectionRange(testo.length, testo.length); } }, 30);
  }

  /* -------------------------------------------------------------- note --- */
  function aggiungiNota() {
    const inp = $('#nuovaNota');
    if (!inp || !inp.value.trim()) return;
    A.stato.note[A.mese] = A.stato.note[A.mese] || [];
    A.stato.note[A.mese].push({ testo: inp.value.trim(), fatto: false, creata: Date.now() });
    inp.value = '';
    aggiorna();
    setTimeout(() => { const i = $('#nuovaNota'); if (i) i.focus(); }, 30);
  }

  function gestisciNota(el) {
    const mese = el.dataset.notaMese, i = +el.dataset.notaI;
    const arr = A.stato.note[mese];
    if (!arr || !arr[i]) return;
    if (el.dataset.notaAz === 'fatto') arr[i].fatto = el.checked;
    else arr.splice(i, 1);
    aggiorna();
  }

  /* --------------------------------------------------------- backup ------ */
  async function backup() {
    const oggi = new Date().toISOString().slice(0, 10);
    const nome = `${oggi} - Backup.json`;
    V.toast('Salvo il backup…');
    const r = await U.salva('Backup', nome, S.esporta(A.stato), 'application/json');
    avvisaSalvataggio(r, 'Backup');
  }

  function ripristina(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const doc = S.importa(r.result);
        V.modale('Ripristinare questo backup?',
          `<p class="mini muto">Contiene <b>${doc.movimenti.length} movimenti</b> su ${
            [...new Set(doc.movimenti.map((m) => m.mese))].length} mesi.
            L'archivio attuale verrà sostituito.</p>`,
          [{ et: 'Annulla' }, { et: 'Ripristina', pri: true, fn: () => {
            A.stato = doc;
            ricalcola();
            impostaMese(E.mesi(A.stato)[0] || null);
            V.render(A);
            V.toast('Backup ripristinato', 'ok');
          } }]);
      } catch (e) { V.toast('Backup non valido: ' + e.message, 'err'); }
    };
    r.readAsText(file);
  }

  /** importa un elenco di regole da un .json esportato in precedenza (da questa
   *  app o da un'altra installazione): sostituisce interamente quelle attuali */
  function importaRegole(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let regole;
      try { regole = JSON.parse(r.result); } catch (e) { V.toast('File non valido: ' + e.message, 'err'); return; }
      if (!Array.isArray(regole) || !regole.every((x) => x && typeof x.m === 'string' && typeof x.cat === 'string')) {
        V.toast('Il file non contiene un elenco di regole valido', 'err'); return;
      }
      V.modale('Sostituire le regole attuali?',
        `<p class="mini muto">Il file contiene <b>${regole.length} regole</b>. Quelle attuali (comprese le modifiche fatte a mano) verranno sostituite.</p>`,
        [{ et: 'Annulla' }, { et: 'Importa', pri: true, fn: () => {
          A.stato.config.regole = regole;
          ricalcola(); V.render(A);
          V.toast(`${regole.length} regole importate`, 'ok');
        } }]);
    };
    r.readAsText(file);
  }

  /* --------------------------------------------- report PDF e XLSX ------ */
  const commentoDelMese = () => (A.stato.commenti || {})[A.mese] || null;

  /** oggi in formato gg-mm-aaaa, sicuro da mettere in un nome file */
  const dataOggiBreve = () => {
    const d = new Date();
    return `${U.p2(d.getDate())}-${U.p2(d.getMonth() + 1)}-${d.getFullYear()}`;
  };

  /** true se il rep è esattamente il mese più recente in archivio: quello ancora
   *  aperto, di cui puoi ricevere altri movimenti da un giorno all'altro — un
   *  report generato ora è per forza parziale, non l'ultima parola su quel mese */
  const meseInCorso = (rep) => rep.tipo === 'mese' && rep.mese === (E.mesi(A.stato)[0] || null);

  /** stesso schema di nomi per ogni esportazione: <mese> - <tipo> (<parziale> · <saldo>).<estensione>,
   *  dentro archivio/<anno>/ — così l'archivio resta sempre ordinato da solo, e chi apre
   *  la cartella vede subito se il mese è ancora aperto e chi deve quanto a chi senza aprire il file */
  const nomeReport = (rep, tipo, ext) => {
    const parti = [];
    if (meseInCorso(rep)) parti.push(`parziale al ${dataOggiBreve()}`);
    if (rep.config.modalita !== 'personale' && Math.abs(rep.saldo) >= 0.01) parti.push(E.fraseSaldo(rep));
    const suffisso = parti.length ? ` (${parti.join(' · ')})` : '';
    return `${rep.mese} - ${tipo}${suffisso}.${ext}`;
  };
  /** una sola cartella per anno dentro archivio/ (es. "2026"), invece di una per mese:
   *  rep.mese è la chiave del periodo qualunque sia la granularità ("2026-08", "2026-T3", "2026") —
   *  i primi 4 caratteri sono sempre l'anno */
  const cartellaAnno = (rep) => rep.mese.slice(0, 4);

  function avvisaSalvataggio(r, cosa) {
    if (r.salvatoSulServer) {
      V.toast(`${cosa} salvato in ${r.percorso}${r.sostituito ? ' (sostituito)' : ''}`, 'ok',
        { testo: '📂 Apri nel Finder', onClick: () => apriNelFinder(r.percorso) });
    } else {
      V.toast(`${cosa} scaricato nella cartella Download: il server locale non era raggiungibile ` +
        `(${r.errore}). Spostalo a mano in archivio/, oppure riavvia avvia.command.`, 'err');
    }
  }

  /** mostra un file già salvato dentro il Finder — funziona solo per i file
   *  che il server ha scritto lui stesso dentro archivio/ */
  async function apriNelFinder(percorso) {
    try {
      const r = await fetch('/api/apri', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percorso })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errore || ('errore ' + r.status));
    } catch (e) {
      V.toast('Non riesco ad aprire il Finder: ' + e.message, 'err');
    }
  }

  async function esportaPdf(rep) {
    try {
      V.toast('Preparo il PDF…');
      const blob = REP.pdf(rep, { commento: commentoDelMese(), parziale: meseInCorso(rep) ? dataOggiBreve() : null });
      const r = await U.salva(cartellaAnno(rep), nomeReport(rep, 'Report spese comuni', 'pdf'), blob, 'application/pdf');
      avvisaSalvataggio(r, 'PDF');
    } catch (e) {
      console.error(e);
      V.toast('Non riesco a generare il PDF: ' + e.message, 'err');
    }
  }

  async function esportaCsv(rep) {
    try {
      V.toast('Preparo il CSV…');
      const r = await U.salva(cartellaAnno(rep), nomeReport(rep, 'Movimenti', 'csv'), E.csv(rep), 'text/csv;charset=utf-8');
      avvisaSalvataggio(r, 'CSV');
    } catch (e) {
      console.error(e);
      V.toast('Non riesco a generare il CSV: ' + e.message, 'err');
    }
  }

  async function esportaXlsx(rep) {
    try {
      V.toast('Preparo il foglio Excel…');
      const blob = await REP.xlsx(rep, { commento: commentoDelMese(), parziale: meseInCorso(rep) ? dataOggiBreve() : null });
      const r = await U.salva(cartellaAnno(rep), nomeReport(rep, 'Report spese comuni', 'xlsx'), blob,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      avvisaSalvataggio(r, 'XLSX');
    } catch (e) {
      console.error(e);
      V.toast('Non riesco a generare il file Excel: ' + e.message, 'err');
    }
  }

  /* ------------------------------------------- report su misura --------- */
  /** manda la domanda all'assistente, la traduce in un filtro e mostra l'anteprima */
  async function richiediReport(testoFisso) {
    if (A.inAttesaReport) return;
    const inp = $('#reportInput');
    const domanda = (testoFisso || (inp && inp.value) || '').trim();
    if (!domanda) return;
    if (inp) inp.value = '';

    A.inAttesaReport = true;
    A.reportProposto = null;
    V.render(A);
    try {
      const mesi = E.mesi(A.stato);
      const contesto = {
        oggi: new Date().toISOString().slice(0, 10),
        mesiDisponibili: [mesi[0] || U.mese(new Date()), mesi[mesi.length - 1] || U.mese(new Date())],
        categorie: R.CATEGORIE.map((c) => c.nome),
        conti: [...new Set(A.stato.movimenti.map((m) => m.conto))],
        nomeMio: A.stato.config.nomeMio, nomeAltro: A.stato.config.nomeAltro
      };
      const criteri = await IA.interpretaReport(domanda, contesto, A.stato.config.modelloLLM);
      const ris = E.filtraLibero(A.stato, criteri);
      const descrizione = E.descriviCriteri(criteri, A.stato.config);
      A.reportProposto = { domanda, criteri, ris, descrizione };
    } catch (e) {
      V.toast('Non riesco a capire la richiesta: ' + e.message, 'err');
    }
    A.inAttesaReport = false;
    V.render(A);
  }

  async function esportaReportPdf() {
    const rp = A.reportProposto;
    if (!rp) return;
    try {
      V.toast('Preparo il PDF…');
      const blob = REP.pdfPersonale(rp.ris, A.stato.config, rp.descrizione);
      const nome = `${new Date().toISOString().slice(0, 10)} - ${U.nomePulito(rp.criteri.titolo || rp.domanda)}.pdf`;
      const r = await U.salva('report-su-misura', nome, blob, 'application/pdf');
      avvisaSalvataggio(r, 'PDF');
    } catch (e) {
      console.error(e);
      V.toast('Non riesco a generare il PDF: ' + e.message, 'err');
    }
  }

  async function esportaReportXlsx() {
    const rp = A.reportProposto;
    if (!rp) return;
    try {
      V.toast('Preparo il foglio Excel…');
      const blob = await REP.xlsxPersonale(rp.ris, A.stato.config, rp.descrizione);
      const nome = `${new Date().toISOString().slice(0, 10)} - ${U.nomePulito(rp.criteri.titolo || rp.domanda)}.xlsx`;
      const r = await U.salva('report-su-misura', nome, blob,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      avvisaSalvataggio(r, 'XLSX');
    } catch (e) {
      console.error(e);
      V.toast('Non riesco a generare il file Excel: ' + e.message, 'err');
    }
  }

  /* ------------------------------------------ motore spese comuni ------- */
  async function analizzaConIA(rep) {
    if (A.inAttesa) return;
    const voci = V.esercentiDaClassificare(rep, A);
    if (!voci.length) { V.toast('Niente da analizzare: sono già tutti coperti da una regola'); return; }
    A.inAttesa = true;
    const box = $('#esitoIA');
    if (box) box.innerHTML = `<div style="margin-top:16px">
      <div class="riga mini muto"><span class="pensa"><i></i><i></i><i></i></span>
      Sto chiedendo a Nemotron di classificare ${voci.length} esercenti…</div>
      <div class="barra-avanz"><i style="width:35%"></i></div></div>`;
    try {
      const esito = await IA.classificaEsercenti(voci, { modello: A.stato.config.modelloLLM });
      const perN = new Map(esito.map((e) => [e.n, e]));
      A.proposte = voci.map((v) => {
        const e = perN.get(v.n) || { comune: null, quota: v.esempio.quota || 0, fiducia: 0, motivo: 'nessuna risposta' };
        return {
          nome: v.nome, volte: v.volte, totale: v.totale,
          categoria: e.comune === false && /AI|api|cloud|software/i.test(e.motivo || '')
            ? 'Lavoro e software' : v.categoria,
          comune: !!e.comune, quota: e.quota, fiducia: e.fiducia, motivo: e.motivo,
          accetta: e.fiducia >= 0.6
        };
      }).filter((p) => p.motivo !== 'nessuna risposta');
      if (!A.proposte.length) V.toast('Il modello non ha restituito proposte valide', 'err');
    } catch (e) {
      console.error(e);
      A.proposte = null;
      V.toast('Assistente non raggiungibile: ' + e.message, 'err');
    }
    A.inAttesa = false;
    V.render(A);
  }

  /** trasforma le proposte accettate in regole permanenti */
  function applicaProposte() {
    const scelte = (A.proposte || []).filter((p) => p.accetta);
    if (!scelte.length) return;
    let n = 0;
    for (const p of scelte) {
      const pattern = p.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
      if (!pattern) continue;
      const esistente = A.stato.config.regole.find((r) => r.m === pattern);
      if (esistente) { esistente.cat = p.categoria; esistente.quota = p.quota; esistente.anche = true; }
      else {
        A.stato.config.regole.unshift({
          m: pattern, cat: p.categoria, quota: p.quota, anche: true, daIA: true,
          nota: null
        });
      }
      const re = new RegExp(pattern, 'i');
      for (const m of A.stato.movimenti) {
        if (!m.manuale && re.test(m.descrizionePulita)) { m.bloccato = false; n++; }
      }
    }
    A.proposte = null;
    ricalcola();
    V.render(A);
    V.toast(`${scelte.length} regole create e applicate a ${n} movimenti`, 'ok');
  }

  /* ------------------------------------------------ testi generati ------ */
  async function generaDocumento(tipo, rep) {
    if (A.inAttesa) return;
    A.inAttesa = true;
    const box = $('#esitoDoc');
    if (box) box.innerHTML = '<div class="riga mini muto"><span class="pensa"><i></i><i></i><i></i></span> Sto scrivendo…</div>';
    try {
      const ctx = E.contesto(A.stato, A.mese);
      const testo = await IA.documento(tipo, ctx, A.stato.config.modelloLLM);
      A.documento = { tipo, testo: testo.trim() };
    } catch (e) {
      V.toast('Assistente non raggiungibile: ' + e.message, 'err');
      A.documento = null;
    }
    A.inAttesa = false;
    V.render(A);
  }

  /* --------------------------------------------------------- chat ------- */
  async function inviaChat(testoFisso) {
    if (A.inAttesa) return;
    const inp = $('#chatInput');
    const testo = (testoFisso || (inp && inp.value) || '').trim();
    if (!testo) return;
    if (inp) inp.value = '';

    A.stato.chat = A.stato.chat || {};
    const storico = (A.stato.chat[A.mese] = A.stato.chat[A.mese] || []);
    storico.push({ role: 'user', content: testo });
    A.inAttesa = true;
    V.render(A);

    const corpo = $('#chatCorpo');
    const risposta = document.createElement('div');
    risposta.className = 'msg';
    risposta.innerHTML = '<div class="av">▲</div><div class="bolla"><span class="pensa"><i></i><i></i><i></i></span></div>';
    if (corpo) { corpo.appendChild(risposta); corpo.scrollTop = corpo.scrollHeight; }
    const bolla = risposta.querySelector('.bolla');

    try {
      const ctx = E.contesto(A.stato, A.mese);
      // si manda solo un pezzo di storico: bastano gli ultimi scambi
      const recenti = storico.slice(-8);
      const finale = await IA.chat(ctx, recenti, (_, tutto) => {
        bolla.textContent = tutto;
        if (corpo) corpo.scrollTop = corpo.scrollHeight;
      }, A.stato.config.modelloLLM);
      storico.push({ role: 'assistant', content: (finale || '').trim() || '(nessuna risposta)' });
    } catch (e) {
      storico.push({ role: 'assistant', content: 'Non riesco a rispondere: ' + e.message });
    }
    A.inAttesa = false;
    S.salva(A.stato);
    V.render(A);
    setTimeout(() => {
      const c = $('#chatCorpo');
      if (c) c.scrollTop = c.scrollHeight;
      const i = $('#chatInput');
      if (i) i.focus();
    }, 40);
  }

  /* -------------------------------------------------- report stampabile -- */
  function apriReport(rep) {
    const w = window.open('', '_blank');
    if (!w) { // popup bloccati: scarica il file
      U.scarica(`report-${rep.mese}.html`, E.html(rep), 'text/html;charset=utf-8');
      V.toast('Report scaricato (il browser ha bloccato la finestra)', 'ok');
      return;
    }
    w.document.write(E.html(rep));
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 400);
  }
})();
