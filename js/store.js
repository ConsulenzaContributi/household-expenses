/* store.js — archivio locale (IndexedDB) + backup su file */
window.S = (function () {
  'use strict';

  const DB_NOME = 'spese-condivise';
  const STORE = 'stato';
  const CHIAVE = 'documento';
  let db = null;

  function apri() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NOME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => { db = req.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }

  const VUOTO = () => ({
    versione: 3,
    movimenti: [],
    importazioni: [],          // storico dei file caricati
    note: {},                  // { "2026-07": [{testo, fatto, creata}] }
    chat: {},                  // { "2026-07": [{role, content}] } domande all'assistente
    commenti: {},              // { "2026-07": "testo scritto dall'assistente per il report" }
    config: {
      regole: JSON.parse(JSON.stringify(R.REGOLE_DEFAULT)),
      conti: JSON.parse(JSON.stringify(R.CONTI_DEFAULT)),
      modalita: 'condivisa',   // 'condivisa' = due persone che dividono le spese, 'personale' = solo rendicontazione, senza divisione
      quotaMia: 50,            // % delle spese comuni a mio carico (solo modalità 'condivisa')
      competenza: 'contabile', // 'contabile' = come li raggruppa l'estratto, 'operazione' = per data spesa
      nomeMio: 'Io',
      nomeAltro: 'Moglie',
      arrotondaSaldo: false,
      modelloLLM: null,        // null = usa il modello predefinito del server
      mappatureCsv: {},        // { impronta_intestazione: {idxData,idxImporto,idxDescrizione,segnoInvertito,nomeConto} }
      wizardCompletato: false  // true dopo il primo avvio configurato (o per chi aggiorna da una versione precedente)
    },
    aggiornato: null
  });

  async function carica() {
    try {
      const d = await apri();
      const doc = await new Promise((res, rej) => {
        const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(CHIAVE);
        t.onsuccess = () => res(t.result);
        t.onerror = () => rej(t.error);
      });
      if (!doc) return VUOTO();
      return migra(doc);
    } catch (e) {
      console.warn('IndexedDB non disponibile, uso localStorage', e);
      try { return migra(JSON.parse(localStorage.getItem(DB_NOME))) || VUOTO(); }
      catch (_) { return VUOTO(); }
    }
  }

  let timer = null;
  function salva(stato) {
    stato.aggiornato = new Date().toISOString();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const d = await apri();
        await new Promise((res, rej) => {
          const t = d.transaction(STORE, 'readwrite').objectStore(STORE).put(stato, CHIAVE);
          t.onsuccess = res; t.onerror = () => rej(t.error);
        });
      } catch (e) {
        try { localStorage.setItem(DB_NOME, JSON.stringify(stato)); } catch (_) {}
      }
      document.dispatchEvent(new CustomEvent('archivio-salvato'));
    }, 250);
  }

  function migra(doc) {
    if (!doc) return VUOTO();
    const v = VUOTO();
    // un archivio che esisteva già prima di questa versione (con dati o impostazioni proprie)
    // non deve mai vedersi proporre il wizard di primo avvio, pensato solo per chi parte da zero
    const eraGiaConfigurato = !doc.config || doc.config.wizardCompletato == null;
    doc.config = Object.assign({}, v.config, doc.config || {});
    if (eraGiaConfigurato) doc.config.wizardCompletato = true;
    doc.note = doc.note || {};
    doc.chat = doc.chat || {};
    doc.commenti = doc.commenti || {};
    doc.importazioni = doc.importazioni || [];
    doc.movimenti = doc.movimenti || [];
    // aggiunge le regole nuove introdotte con gli aggiornamenti dell'app
    const presenti = new Set((doc.config.regole || []).map((r) => r.m));
    for (const r of R.REGOLE_DEFAULT) if (!presenti.has(r.m)) doc.config.regole.push(Object.assign({}, r));
    return doc;
  }

  async function azzera() {
    try {
      const d = await apri();
      await new Promise((res) => {
        const t = d.transaction(STORE, 'readwrite').objectStore(STORE).delete(CHIAVE);
        t.onsuccess = res; t.onerror = res;
      });
    } catch (_) {}
    try { localStorage.removeItem(DB_NOME); } catch (_) {}
  }

  const esporta = (stato) => JSON.stringify(stato, null, 2);

  function importa(testo) {
    const doc = JSON.parse(testo);
    if (!doc || !Array.isArray(doc.movimenti)) throw new Error('File di backup non valido');
    return migra(doc);
  }

  return { carica, salva, azzera, esporta, importa, VUOTO };
})();
