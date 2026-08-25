/* parser.js — riconosce il formato di un estratto conto e lo normalizza */
window.P = (function () {
  'use strict';

  /* ---- riconoscimento formato: si basa sul contenuto, non sul nome file ---- */
  const FORMATI = [
    {
      id: 'carta',
      nome: 'Estratto conto carta',
      test: (h) => h.includes('intestatario carta') && h.includes('numero carta'),
      col: { intestatario: 'intestatario carta', carta: 'numero carta', data: 'data operazione', dataReg: 'data registrazione',
             desc: 'descrizione', tipo: 'tipo operazione', importo: 'importo',
             stato: 'stato operazione', circuito: 'circuito' }
    },
    {
      id: 'conto',
      nome: 'Movimenti conto corrente',
      test: (h) => h.includes('data_operazione') && (h.includes('descrizione_completa') || h.includes('uscite')),
      col: { data: 'data_operazione', valuta: 'data_valuta', entrate: 'entrate', uscite: 'uscite',
             desc: 'descrizione', descLunga: 'descrizione_completa', stato: 'stato' }
    },
    {
      id: 'telepass',
      nome: 'Movimenti Telepass',
      test: (h) => h.includes('numero dispositivo') && h.includes('classe'),
      col: { disp: 'numero dispositivo', data: 'data e ora', desc: 'descrizione',
             classe: 'classe', importo: 'importo' }
    }
  ];

  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

  /** cerca la riga di intestazione nelle prime 40 righe */
  function trovaHeader(righe) {
    for (let i = 0; i < Math.min(righe.length, 40); i++) {
      const h = (righe[i] || []).map(norm).filter(Boolean);
      if (h.length < 3) continue;
      for (const f of FORMATI) if (f.test(h)) return { formato: f, riga: i };
    }
    return null;
  }

  /* ---------------------------- lettura file ---------------------------- */
  function leggiArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  /** .xls e formati legacy: qui la libreria esterna va bene */
  function viaLibreria(buf) {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
    return wb.SheetNames.map((nome) => ({
      nome,
      righe: XLSX.utils.sheet_to_json(wb.Sheets[nome],
        { header: 1, blankrows: true, defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
    }));
  }

  /**
   * Legge il file e restituisce i fogli come matrice di celle.
   * Per i .xlsx si usa il lettore interno: alcune banche generano zip "in streaming"
   * che le librerie generiche troncano in silenzio.
   */
  async function fogliDi(file) {
    const buf = await leggiArrayBuffer(file);
    const eXlsx = /\.xlsx$/i.test(file.name) ||
      (new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 1, 1)[0] === 0x4b);
    if (eXlsx && XL.disponibile()) {
      try { return (await XL.leggi(buf)).fogli; }
      catch (e) { console.warn('Lettore interno fallito, provo con la libreria:', e.message); }
    }
    return viaLibreria(buf);
  }

  /** cerca nel foglio il totale stampato dalla banca, per poterlo confrontare */
  function totaleDichiarato(righe) {
    for (let i = righe.length - 1; i >= 0; i--) {
      const riga = righe[i] || [];
      const testo = riga.map((c) => String(c == null ? '' : c)).join(' ').toLowerCase();
      if (!/totale movimenti|importo totale|totale spese/.test(testo)) continue;
      for (let j = riga.length - 1; j >= 0; j--) {
        const n = U.num(riga[j]);
        if (!isNaN(n) && n !== 0) return Math.abs(n);
      }
    }
    return null;
  }

  /** aspetta che il modulo di lettura PDF (caricato in modo asincrono) sia pronto */
  function aspettaPDFR() {
    if (window.PDFR && window.PDFR.pronto) return Promise.resolve();
    return new Promise((res) => {
      const gia = () => { document.removeEventListener('pdfr-pronto', gia); res(); };
      document.addEventListener('pdfr-pronto', gia);
      setTimeout(gia, 6000);   // non aspettare all'infinito se qualcosa va storto
    });
  }

  const NOMI_TELEPASS = { autostrade: 'Rendicontazione pedaggi Telepass (PDF)',
                           canone: 'Fattura canone Telepass (PDF)',
                           parcheggio: 'Rendicontazione parcheggi Telepass (PDF)' };

  /** costruisce il risultato di un PDF Telepass (pedaggi, canone o parcheggi) */
  function analizzaPdfTelepass(file, pagine, tipo) {
    const estratto = PTEL.estrai(pagine, tipo);
    const out = [];
    const conteggio = {};
    for (const mv of estratto.movimenti) {
      const m = base(Object.assign({ nomeFile: file.name }, mv));
      const chiave = [m.fonte, m.conto, m.data, m.importo.toFixed(2), U.chiave(m.descrizione)].join('|');
      conteggio[chiave] = (conteggio[chiave] || 0) + 1;
      m.id = U.hash(chiave + '#' + conteggio[chiave]);
      out.push(m);
    }
    const totale = U.arrotonda(out.reduce((s, m) => s + m.importo, 0));
    const avvisi = [];
    let quadra = null;
    if (estratto.totaleDichiarato != null) {
      quadra = Math.abs(Math.abs(totale) - estratto.totaleDichiarato) < 0.02;
      if (!quadra) {
        avvisi.push(`Attenzione: il documento dichiara un totale di ${U.eur(estratto.totaleDichiarato)} ma ho letto ${
          U.eur(Math.abs(totale))}. Controlla che il PDF sia completo.`);
      }
    }
    if (!out.length) avvisi.push('Nessun movimento riconosciuto in questo PDF.');

    return {
      file: file.name, formato: 'pdf-telepass-' + tipo, formatoNome: NOMI_TELEPASS[tipo],
      foglio: null, movimenti: out, avvisi, quadra, totaleDichiarato: estratto.totaleDichiarato,
      intestatario: null,
      mesi: [...new Set(out.map((m) => m.mese))].sort(),
      conti: [...new Set(out.map((m) => m.conto))],
      totale
    };
  }

  /**
   * Analizza un estratto conto Fineco in PDF (trimestrale): contiene sia i
   * movimenti del conto corrente sia, in sezioni separate, quelli di ogni
   * carta collegata. Non è una tabella sola come gli .xlsx, quindi qui non
   * si passa dal riconoscimento colonne di trovaHeader().
   */
  async function analizzaPdf(file, buf) {
    await aspettaPDFR();
    if (!window.PDFR || !window.PPDF) {
      return { file: file.name, errore: 'Il lettore PDF non si è caricato in tempo: riprova, oppure ricarica la pagina.' };
    }
    let pagine;
    try {
      ({ pagine } = await PDFR.leggiRighe(buf));
    } catch (e) {
      return { file: file.name, errore: 'PDF non leggibile: ' + e.message };
    }

    // prima si prova come rendicontazione Telepass (pedaggi, canone o parcheggi):
    // è un documento più semplice dell'estratto conto Fineco, si riconosce da poche parole chiave
    const tipoTelepass = window.PTEL && PTEL.rileva(pagine);
    if (tipoTelepass) return analizzaPdfTelepass(file, pagine, tipoTelepass);

    let estratto;
    try {
      estratto = PPDF.estrai(pagine);
    } catch (e) {
      return { file: file.name, errore: 'PDF non leggibile: ' + e.message };
    }
    if (!estratto.periodo) {
      return { file: file.name, errore: 'Non riconosco questo PDF: non è né un estratto conto Fineco trimestrale né una rendicontazione Telepass.' };
    }

    const out = [];
    const conteggio = {};
    for (const mv of estratto.movimenti) {
      // stessa corrispondenza di colonne usata per gli .xlsx dello stesso conto,
      // così un movimento letto dal PDF e lo stesso letto da un file .xlsx
      // producono lo stesso id e non vengono mai contati due volte
      const m = mv.fonte === 'conto'
        ? base({ data: mv.dataAltra, dataReg: mv.dataOperazione, importo: mv.importo,
                 descrizione: mv.descrizione, tipoOperazione: 'conto', fonte: 'conto',
                 conto: 'conto', nomeFile: file.name })
        : base({ data: mv.dataOperazione, dataReg: mv.dataAltra, importo: mv.importo,
                 descrizione: mv.descrizione, tipoOperazione: 'pagamento', fonte: 'carta',
                 conto: mv.conto, last4: mv.conto.slice(-4), nomeFile: file.name });
      const chiave = [m.fonte, m.conto, m.data, m.importo.toFixed(2), U.chiave(m.descrizione)].join('|');
      conteggio[chiave] = (conteggio[chiave] || 0) + 1;
      m.id = U.hash(chiave + '#' + conteggio[chiave]);
      out.push(m);
    }

    const totale = U.arrotonda(out.reduce((s, m) => s + m.importo, 0));
    const somma = U.arrotonda(out.filter((m) => m.conto === 'conto').reduce((s, m) => s + m.importo, 0));
    const avvisi = [];
    let quadra = null;
    if (estratto.saldoIniziale != null && estratto.saldoFinale != null) {
      const atteso = U.arrotonda(estratto.saldoFinale - estratto.saldoIniziale);
      quadra = Math.abs(somma - atteso) < 0.02;
      if (!quadra) {
        avvisi.push(`Attenzione: dal saldo iniziale (${U.eur(estratto.saldoIniziale)}) a quello finale ` +
          `(${U.eur(estratto.saldoFinale)}) dichiarati sul documento manca ${U.eur(atteso - somma)}: ` +
          'controlla che il PDF sia completo (pagine mancanti, scansione parziale...).');
      }
    }
    if (estratto.paginaDichiarata && estratto.paginaDichiarata.di !== estratto.nPagine) {
      avvisi.push(`Il documento ha ${estratto.nPagine} pagine ma l'ultima dichiara "DI ${
        estratto.paginaDichiarata.di}": probabilmente contiene anche altri fogli oltre all'estratto conto, normale se ci sono informative allegate.`);
    }
    if (!out.length) avvisi.push('Nessun movimento riconosciuto in questo PDF.');

    const MESI3 = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    const nomeTrimestre = `${MESI3[estratto.periodo.mesi[0] - 1]}-${MESI3[estratto.periodo.mesi[2] - 1]} ${estratto.periodo.anno}`;

    return {
      file: file.name, formato: 'pdf-estratto', formatoNome: 'Estratto conto Fineco (PDF, ' + nomeTrimestre + ')',
      foglio: null, movimenti: out, avvisi, quadra,
      totaleDichiarato: estratto.saldoFinale != null ? Math.abs(estratto.saldoFinale) : null,
      intestatario: null,
      mesi: [...new Set(out.map((m) => m.mese))].sort(),
      conti: [...new Set(out.map((m) => m.conto))],
      totale
    };
  }

  /**
   * Analizza un File (.xlsx / .xls / .pdf) e restituisce
   * { file, formato, movimenti[], avvisi[] }  oppure  { file, errore }
   */
  async function analizza(file) {
    if (/\.pdf$/i.test(file.name)) {
      let buf;
      try { buf = new Uint8Array(await leggiArrayBuffer(file)); }
      catch (e) { return { file: file.name, errore: 'File non leggibile: ' + e.message }; }
      return analizzaPdf(file, buf);
    }

    let fogli;
    try {
      fogli = await fogliDi(file);
    } catch (e) {
      return { file: file.name, errore: 'File non leggibile: ' + e.message };
    }

    for (const foglio of fogli) {
      const righe = foglio.righe;
      const found = trovaHeader(righe);
      if (!found) continue;

      const { formato, riga } = found;
      const head = (righe[riga] || []).map(norm);
      const idx = {};
      for (const [k, etichetta] of Object.entries(formato.col)) idx[k] = head.indexOf(etichetta);

      const out = [];
      const conteggio = {};   // rende unici i movimenti identici nello stesso file
      const avvisi = [];

      for (const r of righe.slice(riga + 1)) {
        const mov = COSTRUTTORI[formato.id](r, idx, file.name);
        if (!mov) continue;
        const base = [mov.fonte, mov.conto, mov.data, mov.importo.toFixed(2), U.chiave(mov.descrizione)].join('|');
        conteggio[base] = (conteggio[base] || 0) + 1;
        mov.id = U.hash(base + '#' + conteggio[base]);
        out.push(mov);
      }

      const totale = U.arrotonda(out.reduce((s, m) => s + m.importo, 0));

      // nome dell'intestatario: serve per dare del "tu" nei report invece di scrivere "Io"
      let intestatario = null;
      if (idx.intestatario > -1) {
        const conNome = righe.slice(riga + 1).find((r) => String(r[idx.intestatario] || '').trim());
        if (conNome) intestatario = String(conNome[idx.intestatario]).trim();
      }

      // controllo di quadratura: se la banca stampa un totale, deve coincidere
      const atteso = totaleDichiarato(righe);
      let quadra = null;
      if (atteso != null) {
        quadra = Math.abs(Math.abs(totale) - atteso) < 0.02;
        if (!quadra) {
          avvisi.push(`Attenzione: il file dichiara un totale di ${U.eur(atteso)} ma ho letto ${
            U.eur(Math.abs(totale))}. Controlla che l'estratto sia completo prima di usarlo.`);
        }
      }
      if (!out.length) avvisi.push('Nessun movimento riconosciuto nel foglio "' + foglio.nome + '".');

      return {
        file: file.name, formato: formato.id, formatoNome: formato.nome, foglio: foglio.nome,
        movimenti: out, avvisi, quadra, totaleDichiarato: atteso, intestatario,
        mesi: [...new Set(out.map((m) => m.mese))].sort(),
        conti: [...new Set(out.map((m) => m.conto))],
        totale
      };
    }
    // nessuno dei formati conosciuti corrisponde: per i .csv proviamo la via
    // generica, chiedendo (una volta sola per ogni struttura di intestazione)
    // quali colonne usare
    if (/\.csv$/i.test(file.name) && fogli.length && fogli[0].righe.length > 1) {
      const righe = fogli[0].righe;
      const rigaIntestazione = righe.findIndex((r) => (r || []).filter((c) => String(c || '').trim()).length >= 2);
      if (rigaIntestazione > -1 && rigaIntestazione < 15) {
        const intestazioni = (righe[rigaIntestazione] || []).map((c) => String(c == null ? '' : c).trim());
        const fingerprint = U.hash(intestazioni.map(norm).join('|'));
        return {
          file: file.name, richiedeMappatura: true, fingerprint, intestazioni,
          anteprimaRighe: righe.slice(rigaIntestazione + 1, rigaIntestazione + 4),
          righeComplete: righe, rigaIntestazione
        };
      }
    }
    return { file: file.name, errore: 'Formato non riconosciuto. Formati supportati: estratto carta, movimenti conto corrente, movimenti Telepass, oppure un CSV generico con colonne data/importo/descrizione.' };
  }

  /**
   * Costruisce i movimenti da un CSV generico (banca non riconosciuta) usando
   * la mappatura di colonne scelta una volta dall'utente per questa struttura
   * di intestazione — vedi `richiedeMappatura` sopra e mappaCsv() in app.js.
   */
  function costruisciDaMappatura(righeComplete, rigaIntestazione, mapp, fileName) {
    const out = [];
    const conteggio = {};
    for (const r of righeComplete.slice(rigaIntestazione + 1)) {
      const dataV = U.iso(r[mapp.idxData]);
      let importo = U.num(r[mapp.idxImporto]);
      const desc = String(r[mapp.idxDescrizione] == null ? '' : r[mapp.idxDescrizione]).trim();
      if (!dataV || isNaN(importo) || importo === 0 || !desc) continue;
      if (mapp.segnoInvertito) importo = -importo;
      const m = base({
        data: dataV, dataReg: dataV, importo, descrizione: desc,
        fonte: 'csv', conto: mapp.nomeConto || 'importato', tipoOperazione: 'csv', nomeFile: fileName
      });
      const chiave = [m.fonte, m.conto, m.data, m.importo.toFixed(2), U.chiave(m.descrizione)].join('|');
      conteggio[chiave] = (conteggio[chiave] || 0) + 1;
      m.id = U.hash(chiave + '#' + conteggio[chiave]);
      out.push(m);
    }
    const totale = U.arrotonda(out.reduce((s, m) => s + m.importo, 0));
    return {
      file: fileName, formato: 'libero', formatoNome: 'Estratto generico (CSV)', foglio: null,
      movimenti: out, avvisi: out.length ? [] : ['Nessun movimento riconosciuto con questa mappatura di colonne.'],
      quadra: null, totaleDichiarato: null, intestatario: null,
      mesi: [...new Set(out.map((m) => m.mese))].sort(),
      conti: [...new Set(out.map((m) => m.conto))], totale
    };
  }

  /* ------------------------ costruttori per formato ------------------------ */
  const COSTRUTTORI = {
    carta(r, i, nomeFile) {
      const data = U.iso(r[i.data]);
      const importo = U.num(r[i.importo]);
      if (!data || isNaN(importo) || importo === 0) return null;
      const numCarta = String(r[i.carta] || '');
      const last4 = (numCarta.match(/(\d{4})\s*$/) || [, '????'])[1];
      const desc = String(r[i.desc] || '').trim();
      if (!desc) return null;
      return base({
        data, dataReg: U.iso(r[i.dataReg]) || data,
        importo: importo > 0 ? -importo : importo,   // sull'estratto carta le spese sono negative
        descrizione: desc,
        fonte: 'carta', conto: 'carta:' + last4, last4,
        tipoOperazione: String(r[i.tipo] || '').trim(),
        stato: String(r[i.stato] || '').trim(),
        nomeFile
      });
    },

    conto(r, i, nomeFile) {
      const data = U.iso(r[i.data]);
      if (!data) return null;
      const entrate = U.num(r[i.entrate]);
      const uscite = U.num(r[i.uscite]);
      let importo = !isNaN(uscite) && uscite !== 0 ? uscite : (!isNaN(entrate) ? entrate : NaN);
      if (isNaN(importo) || importo === 0) return null;
      if (!isNaN(uscite) && uscite > 0) importo = -uscite;   // alcune banche esportano le uscite positive
      const descLunga = String(r[i.descLunga] || '').trim();
      const desc = String(r[i.desc] || '').trim();
      if (!desc && !descLunga) return null;
      return base({
        data: U.iso(r[i.valuta]) || data,     // la data valuta corrisponde alla data operazione della carta
        dataReg: data,
        importo,
        descrizione: descLunga || desc,
        tipoOperazione: desc,
        fonte: 'conto', conto: 'conto',
        stato: String(r[i.stato] || '').trim(),
        nomeFile
      });
    },

    telepass(r, i, nomeFile) {
      const data = U.iso(r[i.data]);
      const importo = U.num(r[i.importo]);
      if (!data || isNaN(importo) || importo === 0) return null;
      const tratta = String(r[i.desc] || '').replace(/\s+/g, ' ').trim();
      if (!tratta) return null;
      const ora = (String(r[i.data]).match(/(\d{2})[.:](\d{2})\s*$/) || []).slice(1, 3).join(':');
      return base({
        data, dataReg: data,
        importo: importo > 0 ? -importo : importo,   // sul Telepass gli importi sono positivi
        descrizione: 'Pedaggio ' + tratta + (ora ? ' (' + ora + ')' : ''),
        tipoOperazione: 'pedaggio',
        fonte: 'telepass', conto: 'telepass',
        classe: String(r[i.classe] || '').trim(),
        nomeFile
      });
    }
  };

  /** campi comuni a ogni movimento normalizzato */
  function base(m) {
    m.descrizionePulita = U.pulisci(m.descrizione);
    m.esercente = U.esercente(m.descrizione);
    m.mese = U.mese(m.dataReg || m.data);
    // chiave usata per riconoscere lo stesso movimento su fonti diverse
    m.chiaveIncrocio = [Math.abs(m.importo).toFixed(2), m.data,
                        U.chiave(m.descrizione).slice(0, 16)].join('|');
    m.categoria = null;      // assegnata dal motore regole
    m.quota = null;          // % che entra nelle spese comuni
    m.pagatoDa = null;
    m.escluso = false;
    m.motivoEsclusione = null;
    m.manuale = false;
    m.bloccato = false;      // true = modificato a mano, le regole non lo toccano più
    m.nota = '';
    return m;
  }

  /** crea un movimento inserito a mano (contanti, spesa dal conto, rimborso...) */
  function manuale(dati) {
    const m = base({
      data: dati.data,
      dataReg: dati.data,
      importo: -Math.abs(U.num(dati.importo)),
      descrizione: dati.descrizione,
      tipoOperazione: dati.tipoOperazione || 'manuale',
      fonte: 'manuale',
      conto: dati.conto || 'contanti',
      nomeFile: '(inserimento manuale)'
    });
    if (dati.entrata) m.importo = Math.abs(U.num(dati.importo));
    m.manuale = true;
    m.bloccato = true;
    m.categoria = dati.categoria || 'Altro';
    m.quota = dati.quota != null ? Number(dati.quota) : 100;
    m.pagatoDa = dati.pagatoDa || 'io';
    m.nota = dati.nota || '';
    m.id = U.hash(['manuale', m.data, m.importo.toFixed(2), m.descrizione, Date.now(), Math.random()].join('|'));
    return m;
  }

  return { analizza, manuale, FORMATI, costruisciDaMappatura };
})();
