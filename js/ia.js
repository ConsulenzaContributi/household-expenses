/* ia.js — assistente NVIDIA Nemotron.
   Le chiamate passano dal server locale (server.py): l'API NVIDIA non manda
   gli header CORS e così la chiave non entra mai nel browser. */
window.IA = (function () {
  'use strict';

  let stato = { attivo: false, modello: null, modelloVeloce: null, verificato: false };

  async function verifica() {
    try {
      const r = await fetch('/api/llm/stato', { cache: 'no-store' });
      if (!r.ok) throw new Error('stato ' + r.status);
      stato = Object.assign(await r.json(), { verificato: true });
    } catch (_) {
      stato = { attivo: false, verificato: true, motivo: 'server locale non raggiungibile' };
    }
    return stato;
  }

  const disponibile = () => stato.attivo === true;

  /** elenco dei modelli Nemotron fra cui scegliere in Impostazioni */
  async function modelli() {
    try {
      const r = await fetch('/api/llm/modelli', { cache: 'no-store' });
      if (!r.ok) return [];
      return (await r.json()).modelli || [];
    } catch (_) { return []; }
  }

  /** scrive la chiave API sul server locale (chiave-nvidia.txt): non torna mai indietro */
  async function salvaChiave(chiaveNuova) {
    const r = await fetch('/api/llm/chiave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chiave: chiaveNuova })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.errore || ('errore ' + r.status));
    return d;
  }

  /* --------------------------------------------------------- chiamata --- */
  async function completa(messaggi, opz) {
    opz = opz || {};
    const r = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opz.modello || stato.modello,
        messages: messaggi,
        temperature: opz.temperatura != null ? opz.temperatura : 0.15,
        max_tokens: opz.maxTokens || 3000,
        stream: false
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.errore || ('errore ' + r.status));
    return (d.choices && d.choices[0].message.content || '').trim();
  }

  /** chat in streaming: onPezzo riceve il testo mano a mano che arriva */
  async function completaStream(messaggi, onPezzo, opz) {
    opz = opz || {};
    const r = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opz.modello || stato.modello,
        messages: messaggi,
        temperature: opz.temperatura != null ? opz.temperatura : 0.3,
        max_tokens: opz.maxTokens || 1500,
        stream: true
      })
    });
    if (!r.ok) {
      let e = 'errore ' + r.status;
      try { e = (await r.json()).errore || e; } catch (_) {}
      throw new Error(e);
    }
    const lettore = r.body.getReader();
    const dec = new TextDecoder();
    let buffer = '', tutto = '';
    while (true) {
      const { done, value } = await lettore.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const righe = buffer.split('\n');
      buffer = righe.pop();
      for (const riga of righe) {
        if (!riga.startsWith('data:')) continue;
        const dati = riga.slice(5).trim();
        if (!dati || dati === '[DONE]') continue;
        try {
          const j = JSON.parse(dati);
          const pezzo = j.choices && j.choices[0] && j.choices[0].delta &&
                        j.choices[0].delta.content;
          if (pezzo) { tutto += pezzo; onPezzo(pezzo, tutto); }
        } catch (_) {}
      }
    }
    return tutto;
  }

  /** estrae il primo oggetto JSON da una risposta, anche se è avvolto in ``` */
  function estraiJson(testo) {
    const pulito = testo.replace(/```json|```/g, '');
    const a = pulito.indexOf('{'), b = pulito.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('risposta senza JSON');
    return JSON.parse(pulito.slice(a, b + 1));
  }

  /* ============================ motore spese comuni ==================== */

  const SISTEMA_CLASSIFICA =
    'Sei il motore di classificazione di "Spese di casa", una webapp italiana che divide le spese ' +
    'fra due coniugi. Ricevi nomi di esercenti presi dagli estratti conto e decidi se una spesa ' +
    'appartiene alla vita di casa (da dividere) oppure è personale o di lavoro (da NON dividere).\n' +
    'Regole di giudizio:\n' +
    '- Spesa comune: alimentari, casa, igiene, farmacia, benzina e auto, pedaggi, bollette, ' +
    'ristoranti e uscite insieme, spesa per i figli, arredamento, assicurazioni, imprevisti.\n' +
    '- NON comune: servizi e software professionali (API, cloud, AI, corsi, hosting, licenze), ' +
    'abbonamenti usati da una sola persona, hobby individuali, gioco e scommesse, sigarette, ' +
    'regali personali, spese di lavoro.\n' +
    '- Quota 50 quando il servizio è di casa ma lo usa una persona sola a metà tempo ' +
    '(streaming TV, telefonia).\n' +
    'Rispondi SEMPRE e SOLO con JSON valido, senza testo prima o dopo.';

  /**
   * Classifica un elenco di esercenti.
   * voci: [{ n, nome, categoria, totale, conto, volte }]
   * Ritorna: [{ n, comune, quota, fiducia, motivo }]
   */
  async function classificaEsercenti(voci, opz) {
    opz = opz || {};
    const elenco = voci.map((v) =>
      `${v.n}. "${v.nome}" — ${v.volte} volt${v.volte === 1 ? 'a' : 'e'}, ` +
      `${U.eur(v.totale)} totali, carta: ${v.conto}, categoria attuale: ${v.categoria}`).join('\n');

    const utente =
      'Classifica questi esercenti trovati negli estratti conto di una famiglia italiana ' +
      '(lui è architetto e usa servizi digitali per lavoro, spesso pagati con la carta di casa).\n\n' +
      elenco + '\n\n' +
      'Rispondi con questo JSON, un oggetto per ogni numero della lista:\n' +
      '{"voci":[{"n":1,"comune":true,"quota":100,"fiducia":0.9,"motivo":"spesa alimentare"}]}\n' +
      '- "comune": true se va divisa fra i coniugi, false se è personale o di lavoro\n' +
      '- "quota": 100 tutta comune, 50 a metà, 0 personale (coerente con "comune")\n' +
      '- "fiducia": da 0 a 1, quanto sei sicuro\n' +
      '- "motivo": massimo 6 parole in italiano, minuscolo';

    const testo = await completa(
      [{ role: 'system', content: SISTEMA_CLASSIFICA }, { role: 'user', content: utente }],
      { maxTokens: Math.min(9000, 260 + voci.length * 60), temperatura: 0.1, modello: opz.modello });

    const j = estraiJson(testo);
    const out = [];
    for (const v of (j.voci || [])) {
      const n = Number(v.n);
      if (!voci.some((x) => x.n === n)) continue;
      const comune = v.comune === true || v.comune === 'true';
      let quota = Number(v.quota);
      if (isNaN(quota)) quota = comune ? 100 : 0;
      quota = Math.max(0, Math.min(100, Math.round(quota / 5) * 5));
      if (!comune) quota = 0;
      if (comune && quota === 0) quota = 100;
      out.push({ n, comune, quota,
                 fiducia: Math.max(0, Math.min(1, Number(v.fiducia) || 0.5)),
                 motivo: String(v.motivo || '').slice(0, 60) });
    }
    return out;
  }

  /* ==================================== chat sulla gestione ============ */

  const SISTEMA_CHAT = (contesto) =>
    'Sei l\'assistente di "Spese di casa", la webapp con cui ' + contesto.nomeMio +
    ' e ' + contesto.nomeAltro + ' dividono le spese familiari. Rispondi in italiano, ' +
    'in modo breve e concreto, come un contabile di famiglia pratico.\n\n' +
    'REGOLA ASSOLUTA: usa solo i numeri che trovi nei DATI qui sotto. Non inventare mai ' +
    'cifre, percentuali o confronti che non puoi ricavare dai DATI. Se un dato non c\'è, ' +
    'dillo chiaramente ("questo dato non ce l\'ho") invece di stimarlo.\n' +
    'Formatta gli importi all\'italiana (1.234,56 €). Niente elenchi lunghi: al massimo 5 punti.\n\n' +
    '=== DATI ===\n' + contesto.testo + '\n=== FINE DATI ===';

  const chat = (contesto, storico, onPezzo, modello) =>
    completaStream([{ role: 'system', content: SISTEMA_CHAT(contesto) }].concat(storico),
                   onPezzo, { temperatura: 0.35, maxTokens: 1200, modello });

  /* ================================= testi e documenti ================= */

  /** genera un testo (riassunto del mese, messaggio da mandare, nota) */
  function documento(tipo, contesto, modello) {
    const richieste = {
      riepilogo:
        'Scrivi il commento di apertura del report mensile: 4-6 righe che spieghino come è andato ' +
        'il mese, cosa è cambiato rispetto al mese prima e su cosa vale la pena stare attenti. ' +
        'Tono asciutto e concreto, niente titoli, niente elenchi puntati.',
      messaggio:
        'Scrivi un messaggio breve e gentile da mandare a ' + contesto.nomeAltro +
        ' per riepilogare le spese del mese e il saldo. Massimo 6 righe, tono familiare, ' +
        'niente formalismi da ufficio. Chiudi con la cifra del saldo.',
      note:
        'Proponi da 3 a 5 promemoria per il mese prossimo, ricavati dai dati: scadenze che ' +
        'torneranno, spese anomale da verificare, categorie in crescita. ' +
        'Una riga ciascuno, senza numerazione, inizia ogni riga con "- ".',
      anomalie:
        'Elenca le cose che non tornano o che meritano un controllo: importi fuori scala, ' +
        'doppioni sospetti, categorie strane, spese che di solito non ci sono. ' +
        'Massimo 5 punti, ognuno con l\'importo. Se è tutto regolare dillo in una riga.'
    };
    return completa(
      [{ role: 'system', content: SISTEMA_CHAT(contesto) },
       { role: 'user', content: richieste[tipo] || richieste.riepilogo }],
      { temperatura: 0.4, maxTokens: 800, modello });
  }

  /* ============================== report su misura ====================== */

  const SISTEMA_REPORT =
    'Sei il motore che trasforma una domanda in italiano in un filtro strutturato per cercare ' +
    'movimenti dentro l\'archivio di "Spese di casa". Non calcoli nulla tu: estrai solo i criteri ' +
    'di ricerca, che verranno applicati dall\'app sui dati veri.\n' +
    'Rispondi SEMPRE e SOLO con un JSON valido, senza testo prima o dopo, con questa forma ' +
    '(ometti i campi che la domanda non specifica, non inventare valori):\n' +
    '{"soggetto":"nome esercente o parte di esso","categoria":"una delle categorie elencate",' +
    '"conto":"conto o carta citati","dataDa":"YYYY-MM-DD","dataA":"YYYY-MM-DD",' +
    '"importoMin":numero,"importoMax":numero,"tipo":"spesa|entrata|tutti",' +
    '"soloComune":true|false,"pagatoDa":"io|moglie","titolo":"titolo breve del report, max 8 parole"}';

  /**
   * Interpreta una domanda ("le spese Amazon del 2025", "carburante negli
   * ultimi 6 mesi") in un oggetto criteri da passare a E.filtraLibero.
   * contesto = { categorie, conti, mesiDisponibili: [primo, ultimo], oggi, nomeMio, nomeAltro }
   */
  async function interpretaReport(domanda, contesto, modello) {
    const utente =
      `Oggi è il ${contesto.oggi}. Archivio disponibile dal mese ${contesto.mesiDisponibili[1]} ` +
      `al mese ${contesto.mesiDisponibili[0]} (formato AAAA-MM).\n` +
      `Categorie esistenti: ${contesto.categorie.join(', ')}.\n` +
      `Conti/carte esistenti: ${contesto.conti.join(', ')}.\n` +
      `"io" = ${contesto.nomeMio}, "moglie" = ${contesto.nomeAltro}.\n\n` +
      `Domanda: "${domanda}"`;

    const testo = await completa(
      [{ role: 'system', content: SISTEMA_REPORT }, { role: 'user', content: utente }],
      { temperatura: 0.1, maxTokens: 400, modello });

    const j = estraiJson(testo);
    const criteri = {};
    if (j.soggetto) criteri.soggetto = String(j.soggetto).slice(0, 60);
    if (j.categoria) criteri.categoria = String(j.categoria).slice(0, 40);
    if (j.conto) criteri.conto = String(j.conto).slice(0, 40);
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(j.dataDa || '')) criteri.dataDa = j.dataDa.length === 7 ? j.dataDa + '-01' : j.dataDa;
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(j.dataA || '')) criteri.dataA = j.dataA.length === 7 ? j.dataA + '-28' : j.dataA;
    if (j.importoMin != null && !isNaN(Number(j.importoMin))) criteri.importoMin = Number(j.importoMin);
    if (j.importoMax != null && !isNaN(Number(j.importoMax))) criteri.importoMax = Number(j.importoMax);
    if (j.tipo === 'entrata' || j.tipo === 'tutti') criteri.tipo = j.tipo;
    if (j.soloComune === true || j.soloComune === 'true') criteri.soloComune = true;
    if (j.pagatoDa === 'io' || j.pagatoDa === 'moglie') criteri.pagatoDa = j.pagatoDa;
    criteri.titolo = String(j.titolo || domanda).slice(0, 80);
    return criteri;
  }

  return { verifica, disponibile, stato: () => stato, completa, completaStream,
           classificaEsercenti, chat, documento, estraiJson, interpretaReport, modelli, salvaChiave };
})();
