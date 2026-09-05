/* rules.js — categorie, regole automatiche, deduplica fra fonti */
window.R = (function () {
  'use strict';

  const CATEGORIE = [
    { nome: 'Supermercato',       colore: '#4ade80', icona: '🛒' },
    { nome: 'Casa e igiene',      colore: '#38bdf8', icona: '🧴' },
    { nome: 'Farmacia e salute',  colore: '#f472b6', icona: '💊' },
    { nome: 'Ristoranti e bar',   colore: '#fb923c', icona: '🍕' },
    { nome: 'Carburante',         colore: '#facc15', icona: '⛽' },
    { nome: 'Auto e manutenzione',colore: '#a78bfa', icona: '🔧' },
    { nome: 'Pedaggi',            colore: '#60a5fa', icona: '🛣️' },
    { nome: 'Trasporti e sosta',  colore: '#22d3ee', icona: '🅿️' },
    { nome: 'Abbonamenti',        colore: '#c084fc', icona: '📺' },
    { nome: 'Lavoro e software',  colore: '#94a3b8', icona: '💻' },
    { nome: 'Shopping online',    colore: '#fbbf24', icona: '📦' },
    { nome: 'Abbigliamento',      colore: '#f87171', icona: '👕' },
    { nome: 'Telefonia',          colore: '#2dd4bf', icona: '📱' },
    { nome: 'Casa: bollette',     colore: '#818cf8', icona: '💡' },
    { nome: 'Assicurazioni',      colore: '#34d399', icona: '🛡️' },
    { nome: 'Viaggi e vacanze',   colore: '#f0abfc', icona: '✈️' },
    { nome: 'Tempo libero',       colore: '#fda4af', icona: '🎟️' },
    { nome: 'Tasse e imposte',    colore: '#cbd5e1', icona: '🏛️' },
    { nome: 'Spese bancarie',     colore: '#9ca3af', icona: '🏦' },
    { nome: 'Giroconti',          colore: '#6b7280', icona: '🔁' },
    { nome: 'Contanti',           colore: '#d6d3d1', icona: '💵' },
    { nome: 'Imprevisti',         colore: '#fb7185', icona: '⚠️' },
    { nome: 'Altro',              colore: '#71717a', icona: '❓' }
  ];

  /**
   * Regole di default, valutate dall'alto verso il basso: vince la prima che corrisponde.
   * `quota` = percentuale dell'importo che entra nelle spese comuni.
   * quota null = usa il valore predefinito del conto.
   */
  const REGOLE_DEFAULT = [
    // --- giroconti e movimenti che NON sono spese ------------------------
    { m: 'Ricarica Carta|Ricarica carta ricaricabile|Giroconto|Bonifico a favore di ROSSI', cat: 'Giroconti', quota: 0, escludi: 'giroconto', nota: 'Ricarica della prepagata: la spesa vera è nell\'estratto della carta' },
    { m: 'Prelievo Bancomat|Prelevamento|Prelievo contant',  cat: 'Contanti', quota: 0, escludi: 'contanti-da-assegnare', nota: 'Contante prelevato: registra a mano come lo hai speso' },

    // --- spesa quotidiana -------------------------------------------------
    { m: 'DECO SUPERMERCATI|SOLE 365|SUPE SUPERSTORE|CONAD|LIDL|EUROSPIN|CARREFOUR|ESSELUNGA|COOP|PENNY|MD SPA|TERRA FELIX|BOUTIQUE DELLA FRUTTA|SIGMA SRL', cat: 'Supermercato', quota: 100 },
    { m: 'ACQUA E SAPONE|TIGOTA|DM DROGERIE|BORRIELLO FERRAMENTA|LEROY MERLIN|IKEA|BRICO|OBI ITALIA', cat: 'Casa e igiene', quota: 100 },
    { m: 'FARMACIA|PARAFARMACIA|LLOYDS|DOTT\\.|LABORATORIO ANALISI|POLIAMBULATORIO', cat: 'Farmacia e salute', quota: 100 },

    // --- fuori casa -------------------------------------------------------
    { m: 'PIZZERIA|RISTORANTE|TRATTORIA|OSTERIA|BAR |BARRIO|SUSHI|BURGER|MCDONALD|POKE|GELAT|PASTICC|CAFF|TARANTELLA|CHEN RONG|FOOD & DELIGHTS|SPEEDY PI|ALI BABA|STAIRS|AURELIO|UMI |OPERA NAPOLI|LIDO ', cat: 'Ristoranti e bar', quota: 100 },

    // --- auto -------------------------------------------------------------
    { m: 'PETROLMAR|PETROLI|ENI |Q8|IP |TAMOIL|ESSO|AGIP|EASY SERVICE|DISTRIBUTORE|CARBURANT', cat: 'Carburante', quota: 100 },
    { m: 'AUTORICAMBI|OFFICINA|GOMMIST|CARROZZERIA|REVISIONE|AUTOFFICINA|BOLLO AUTO', cat: 'Auto e manutenzione', quota: 100, anche: true },
    { m: 'Pedaggio|TELEPASS|AUTOSTRAD', cat: 'Pedaggi', quota: 100, anche: true },
    { m: 'ANM PARK|PARK |PARCHEGGIO|UNICOCAMPANIA|TRENITALIA|ITALO|ANM |METRO|SOSTA', cat: 'Trasporti e sosta', quota: 100 },
    { m: 'ASSICURA|GENERALI|UNIPOL|ALLIANZ|AXA |ZURICH|VERTI|QUIXA|PRIMA\\.IT|LINEAR', cat: 'Assicurazioni', quota: 100, anche: true },

    // --- personali di default (entrano al 0% nelle comuni) ----------------
    { m: 'ANTHROPIC|OPENROUTER|OPENAI|SKOOL|LAYLA|GITHUB|CURSOR|MIDJOURNEY|NOTION|ADOBE|JETBRAINS|VERCEL|AWS |GOOGLE CLOUD|DIGITALOCEAN', cat: 'Lavoro e software', quota: 0, nota: 'Strumenti di lavoro: fuori dalle spese comuni' },
    { m: 'NETFLIX|DISNEY|SPOTIFY|PRIME VIDEO|DAZN|NOW TV|SKY |APPLE\\.COM/BILL|GOOGLE\\*|MICROSOFT|SCRIBD|AUDIBLE|YOUTUBE', cat: 'Abbonamenti', quota: 50, nota: 'Abbonamenti di casa: metà a testa (modifica la quota se serve)' },
    { m: 'sisal|TABACCHERIA|LOTTOMATICA|SNAI|G2A\\.COM|STEAM|PLAYSTATION|NINTENDO', cat: 'Tempo libero', quota: 0 },

    // --- resto ------------------------------------------------------------
    { m: 'AMAZON|AMZN|EBAY|ZALANDO|SHEIN|TEMU|ALIEXPRESS', cat: 'Shopping online', quota: 100, nota: 'Verifica: gli acquisti online non sono sempre comuni' },
    { m: 'OVS|ZARA|H&M|DECATHLON|PRIMARK|CALZEDONIA|SCARPE', cat: 'Abbigliamento', quota: 100 },
    { m: 'HO-MOBILE|HO\\.MOBILE|TIM |VODAFONE|WINDTRE|ILIAD|FASTWEB', cat: 'Telefonia', quota: 50 },
    { m: 'ENEL|ENI GAS|HERA|A2A|ACEA|ABC NAPOLI|IREN|SORGENIA|luce|gas', cat: 'Casa: bollette', quota: 100, anche: true },
    { m: 'MSC Cruises|BOOKING|AIRBNB|RYANAIR|EASYJET|ITA AIRWAYS|HOTEL|VILLAGGIO|CROCIER|TRIVAGO', cat: 'Viaggi e vacanze', quota: 50, nota: 'Vacanze: di solito 50/50, controlla' },
    { m: 'AGENZIA DELLE ENTRATE|F24|IMU|TARI|IMPOSTA|TRIBUT', cat: 'Tasse e imposte', quota: 0 },
    { m: 'Canone Mensile|imposta di bollo|COMMISSION|SPESE TENUTA|Bollo Dossier', cat: 'Spese bancarie', quota: 0 },
    { m: 'ATM-DOMOTIC|IDRAULIC|ELETTRICIST|RIPARAZIONE|URGENZA|IMPREVIST', cat: 'Imprevisti', quota: 100, anche: true }
  ];

  /** Impostazioni predefinite: come si comporta ciascun conto */
  const CONTI_DEFAULT = {
    'carta:1234': { etichetta: 'Carta condivisa 1234', quotaBase: 100, pagatoDa: 'io',
                    descrizione: 'Carta usata per le spese di casa: entra tutta nelle spese comuni.' },
    'telepass':   { etichetta: 'Telepass',             quotaBase: 100, pagatoDa: 'io',
                    descrizione: 'Pedaggi autostradali: spesa comune al 100%.' },
    'conto':      { etichetta: 'Conto corrente',       quotaBase: 0,   pagatoDa: 'io',
                    descrizione: 'Fuori dalle comuni salvo eccezioni (assicurazione, imprevisti...).' },
    'contanti':   { etichetta: 'Contanti',             quotaBase: 100, pagatoDa: 'io',
                    descrizione: 'Spese in contanti aggiunte a mano.' }
  };

  function contoInfo(chiaveConto, conti) {
    const c = (conti || {})[chiaveConto];
    if (c) return c;
    if (chiaveConto.startsWith('carta:')) {
      return { etichetta: 'Carta ' + chiaveConto.slice(6), quotaBase: 0, pagatoDa: 'io',
               descrizione: 'Carta personale: fuori dalle spese comuni salvo eccezioni.' };
    }
    return { etichetta: chiaveConto, quotaBase: 0, pagatoDa: 'io', descrizione: '' };
  }

  const cacheRegex = new Map();
  function regex(pattern) {
    if (!cacheRegex.has(pattern)) cacheRegex.set(pattern, new RegExp(pattern, 'i'));
    return cacheRegex.get(pattern);
  }

  /**
   * Applica regole + impostazioni conto a ogni movimento.
   * I movimenti con `bloccato: true` (modificati a mano) non vengono toccati.
   */
  function applica(movimenti, config) {
    const regole = config.regole || REGOLE_DEFAULT;
    const conti = config.conti || CONTI_DEFAULT;
    const perData = config.competenza === 'operazione';
    for (const m of movimenti) {
      // mese di competenza: come lo raggruppa l'estratto (data contabile) oppure
      // per data dell'operazione. Cambiando l'impostazione i mesi si ricalcolano.
      if (!m.manuale) m.mese = perData ? U.mese(m.data) : U.mese(m.dataReg || m.data);
      if (m.bloccato) continue;
      const info = contoInfo(m.conto, conti);
      const grande = Math.abs(m.importo);
      const testo = m.descrizionePulita + ' ' + (m.tipoOperazione || '');
      let regolaVinta = null;
      for (const r of regole) {
        if (r.attiva === false) continue;
        if (regex(r.m).test(testo)) { regolaVinta = r; break; }
      }
      if (regolaVinta) {
        m.categoria = regolaVinta.cat;
        m.regolaApplicata = regolaVinta.m.slice(0, 30);
        m.suggerimento = regolaVinta.nota || null;
        const q = regolaVinta.quota;
        if (q == null) {
          m.quota = info.quotaBase;
        } else if (q === 0 || info.quotaBase > 0 || regolaVinta.anche) {
          // la regola vale: o azzera, o il conto è già dentro le comuni, o è una voce
          // che si divide sempre (assicurazione, imprevisti, bollette...)
          m.quota = q;
        } else {
          // spesa su un conto che di norma resta fuori: la propongo, non la impongo.
          // Solo sopra una certa cifra, altrimenti la lista dei controlli diventa illeggibile.
          m.quota = 0;
          m.suggerimento = grande >= 25
            ? `Spesa da "${info.etichetta}" di ${U.eur(grande)}: se è comune alza la quota al ${q}%`
            : null;
        }
        if (regolaVinta.escludi) { m.escluso = true; m.motivoEsclusione = regolaVinta.escludi; }
        else if (m.motivoEsclusione && m.motivoEsclusione !== 'duplicato-carta') {
          m.escluso = false; m.motivoEsclusione = null;
        }
      } else {
        m.categoria = 'Altro';
        m.quota = info.quotaBase;
        m.regolaApplicata = null;
        m.suggerimento = grande >= 10 ? 'Nessuna regola: controlla categoria e quota' : null;
      }
      m.pagatoDa = m.pagatoDa || info.pagatoDa || 'io';
      if (m.importo > 0) { m.quota = 0; m.categoria = m.categoria || 'Altro'; } // entrate: mai spese comuni
    }
    return movimenti;
  }

  /**
   * Riconosce lo stesso movimento presente su due fonti (tipico: la carta di debito
   * compare sia nell'estratto carta sia nei movimenti del conto corrente)
   * e disattiva la copia sul conto corrente, così non viene contata due volte.
   *
   * L'incrocio è per importo + inizio della descrizione, TOLLERANDO qualche
   * giorno di scarto sulla data: l'addebito sul conto arriva spesso qualche
   * giorno dopo la data dell'operazione sulla carta (weekend, fine mese,
   * banche diverse...), quindi pretendere la data esatta lascia sfuggire
   * doppioni veri. La vicinanza di date resta comunque richiesta, per non
   * incrociare per sbaglio due spese diverse allo stesso esercente con lo
   * stesso importo ma in giorni lontani.
   */
  const FINESTRA_GIORNI_DOPPIONE = 6;
  const chiaveApprox = (m) => [Math.abs(m.importo).toFixed(2), U.chiave(m.descrizione).slice(0, 16)].join('|');
  const giornoIndice = (m) => {
    const t = Date.parse(m.data);
    return isNaN(t) ? null : Math.floor(t / 86400000);
  };
  const vicine = (a, b) => a != null && b != null && Math.abs(a - b) <= FINESTRA_GIORNI_DOPPIONE;

  function deduplica(movimenti) {
    const gruppi = new Map();
    for (const m of movimenti) {
      if (m.manuale) continue;
      const k = chiaveApprox(m);
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(m);
    }
    let n = 0;
    for (const gruppo of gruppi.values()) {
      if (gruppo.length < 2) continue;
      const daCarta = gruppo.filter((m) => m.fonte === 'carta' || m.fonte === 'telepass');
      const daConto = gruppo.filter((m) => m.fonte === 'conto');
      if (!daCarta.length || !daConto.length) continue;
      for (const m of daConto) {
        if (m.bloccato) continue;
        const gc = giornoIndice(m);
        const gemello = daCarta.find((x) => vicine(gc, giornoIndice(x)));
        if (!gemello) continue;
        m.escluso = true;
        m.motivoEsclusione = 'duplicato-carta';
        m.duplicatoDi = gemello.id;
        n++;
      }
    }
    // ripristina i movimenti del conto che non hanno più un gemello vicino
    // (es. estratto carta rimosso, o non c'è più nulla entro la finestra di giorni)
    for (const m of movimenti) {
      if (m.motivoEsclusione === 'duplicato-carta' && !m.bloccato) {
        const g = gruppi.get(chiaveApprox(m)) || [];
        const gc = giornoIndice(m);
        const haGemello = g.some((x) => (x.fonte === 'carta' || x.fonte === 'telepass') && vicine(gc, giornoIndice(x)));
        if (!haGemello) { m.escluso = false; m.motivoEsclusione = null; m.duplicatoDi = null; }
      }
    }
    return n;
  }

  const colore = (cat) => (CATEGORIE.find((c) => c.nome === cat) || {}).colore || '#71717a';
  const icona  = (cat) => (CATEGORIE.find((c) => c.nome === cat) || {}).icona  || '❓';

  /* ============================================ regole in formato .md === */
  /** dentro una cella di tabella markdown: niente "|" (spezza la tabella)
   *  né newline, così patterns con più parole "a|b|c" restano leggibili */
  const cella = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';

  /**
   * Documento leggibile con tutte le regole in vigore: categorizzazione,
   * comportamento dei conti, e il criterio con cui si riconoscono i doppioni
   * fra conto corrente e carta. Pensato per essere letto, confrontato,
   * discusso e migliorato da una persona — l'unico formato che l'app importa
   * davvero dentro l'archivio resta il .json (scheda Regole, pulsante Importa),
   * pensato per essere scritto da una macchina, non da chi legge questo file.
   */
  function regoleMarkdown(regole, conti) {
    const oggi = new Date().toISOString().slice(0, 10);
    const righeRegole = regole.map((r, i) => `| ${i + 1} | \`${cella(r.m)}\` | ${cella(r.cat)} | ${
      r.quota == null ? 'del conto' : r.quota + '%'} | ${r.anche ? 'sì' : 'no'} | ${cella(r.escludi)} | ${cella(r.nota)} |`).join('\n');

    const righeConti = Object.entries(conti || CONTI_DEFAULT).map(([k, v]) =>
      `| \`${cella(k)}\` | ${cella(v.etichetta)} | ${v.quotaBase}% | ${cella(v.descrizione)} |`).join('\n');

    return `# Regole di "Spese di casa"

Generato il ${oggi}. Documenta **tutte** le regole con cui l'app decide, da sola, categoria e
quota comune di ogni spesa — così puoi leggerle, confrontarle e migliorarle senza aprire il
codice. Per portare delle modifiche dentro l'app usa il formato \`.json\` (scheda **Regole**,
pulsante **⬆ Importa**): questo \`.md\` è pensato per essere letto da una persona, non importato
da una macchina.

## Come funziona il riconoscimento

Ogni movimento viene confrontato con le regole **dall'alto verso il basso**: vince la prima il
cui testo (una o più parole separate da \`|\`, senza distinguere maiuscole/minuscole) trova
corrispondenza nella descrizione. Se nessuna regola corrisponde, la spesa prende la categoria
"Altro" e la quota predefinita del conto da cui arriva.

- **Quota**: percentuale dell'importo che entra nelle spese comuni (100% = tutta comune, 0% = personale).
  "del conto" = usa il comportamento predefinito del conto, senza imporre un valore fisso.
- **Vale sempre**: se "sì", la regola si applica anche sui conti che di norma restano fuori dalle
  spese comuni (tipico di assicurazioni, bollette, imprevisti: sono comuni indipendentemente da
  dove sono state pagate).
- **Escludi**: se presente, il movimento viene tolto del tutto dal conteggio (giroconti, ricariche,
  prelievi da assegnare a mano).

## Regole di categorizzazione

| # | Pattern | Categoria | Quota | Vale sempre | Escludi | Nota |
|---|---|---|---|---|---|---|
${righeRegole}

## Comportamento predefinito dei conti

Si applica solo ai movimenti che non incontrano nessuna regola sopra.

| Conto | Etichetta | Quota base | Descrizione |
|---|---|---|---|
${righeConti}

## Doppioni fra conto corrente e carta

La stessa spesa arriva spesso da **due fonti**: l'estratto della carta (data dell'acquisto) e
i movimenti del conto corrente (data dell'addebito, quasi sempre qualche giorno dopo). Per non
contarla due volte, l'app riconosce due movimenti come lo stesso doppione quando **tutte** queste
condizioni sono vere:

1. **stesso importo** (in valore assoluto);
2. le **prime 16 lettere/cifre** della descrizione coincidono (ignorando maiuscole, accenti e
   punteggiatura);
3. le **date sono vicine entro 6 giorni** — non deve essere lo stesso giorno esatto, perché
   l'addebito sul conto arriva quasi sempre con un piccolo ritardo rispetto alla carta.

Quando tutte e tre corrispondono, il movimento del **conto corrente** viene escluso dal conteggio
(motivo "duplicato-carta") e resta valido solo quello della **carta**, che è la fonte più
affidabile per data e descrizione dell'acquisto vero. Se in seguito rimuovi l'estratto della
carta, il movimento del conto corrente torna automaticamente a essere contato.
`;
  }

  return { CATEGORIE, REGOLE_DEFAULT, CONTI_DEFAULT, applica, deduplica, contoInfo, colore, icona, regoleMarkdown };
})();
