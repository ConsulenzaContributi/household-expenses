/* guida.js — spiegazioni al passaggio del mouse e visita guidata dell'app */
window.G = (function () {
  'use strict';

  /* ====================================================== tooltip ====== */
  let elTip = null, timer = null, ancora = null;

  function creaTip() {
    if (elTip) return elTip;
    elTip = document.createElement('div');
    elTip.id = 'tip';
    document.body.appendChild(elTip);
    return elTip;
  }

  function mostra(el) {
    const dati = el.getAttribute('data-tip');
    if (!dati) return;
    const [titolo, ...resto] = dati.split('|');
    const t = creaTip();
    t.innerHTML = '<b>' + U.escapeHtml(titolo.trim()) + '</b>' +
      (resto.length ? '<span>' + resto.join('|').trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>') + '</span>' : '');
    t.style.visibility = 'hidden';
    t.classList.add('on');
    const r = el.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    let y = r.bottom + 9;
    if (y + tr.height > innerHeight - 8) y = r.top - tr.height - 9;
    x = Math.max(8, Math.min(x, innerWidth - tr.width - 8));
    t.style.left = Math.round(x) + 'px';
    t.style.top = Math.round(y) + 'px';
    t.style.visibility = 'visible';
    ancora = el;
  }

  function nascondi() {
    clearTimeout(timer);
    ancora = null;
    if (elTip) elTip.classList.remove('on');
  }

  function attivaTooltip() {
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el || el === ancora) return;
      clearTimeout(timer);
      timer = setTimeout(() => mostra(el), 320);
    });
    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el) nascondi();
    });
    document.addEventListener('click', nascondi, true);
    window.addEventListener('scroll', nascondi, true);
    window.addEventListener('blur', nascondi);
  }

  /* ================================================= visita guidata ==== */
  const PASSI = [
    { sel: '#btnImporta', tab: null, titolo: 'Si parte da qui',
      testo: 'Ogni mese scarichi gli estratti dalla banca e dal Telepass e li porti dentro l\'app. ' +
             'Puoi anche trascinarli direttamente sulla finestra: funziona da qualunque schermata.' },
    { sel: '[data-azione="scansiona-raw"]', tab: 'importa', titolo: 'Il modo più veloce',
      testo: 'Se hai messo i file nella cartella <code>raw/2026-08/</code>, questo pulsante li trova e li legge da solo. ' +
             'Prima di importare vedi sempre un\'anteprima con il controllo dei totali. Legge anche i <b>PDF</b> — l\'estratto ' +
             'conto trimestrale di Fineco, che da solo copre conto corrente e tutte le carte insieme — e un <b>CSV di qualunque ' +
             'banca</b>: se il formato non è tra quelli conosciuti, ti chiede una volta sola quali colonne usare e se lo ricorda.' },
    { sel: '#btnImpostazioni', tab: null, titolo: 'Modalità, chiave, modello',
      testo: 'Da qui cambi tutto quello scelto al primo avvio: <b>modalità</b> (condivisa o solo personale), nomi, ' +
             'come dividete le spese, la <b>chiave dell\'assistente NVIDIA</b> e quale modello Nemotron usare. ' +
             'Niente di tutto questo è definitivo: puoi tornarci quando vuoi.' },
    { sel: '#blocCopertura', tab: 'importa', titolo: 'Cosa manca ancora',
      testo: 'Prima di importare, questo riquadro guarda cosa hai già e ti dice quali mesi sembrano mancare, ' +
             'conto per conto. Un buco fra due mesi pieni è quasi sempre un estratto non ancora scaricato.' },
    { sel: '#granSwitch', tab: null, titolo: 'Mese, trimestre o anno',
      testo: 'Riepilogo, Movimenti, Categorie e i report seguono questo interruttore: stessi numeri, ' +
             'zoom diverso. Note, chat e assistente restano sempre ancorati al mese in corso, qualunque zoom tu scelga.' },
    { sel: '#selPeriodo', tab: null, titolo: 'Il periodo che stai guardando',
      testo: 'Tutte le schede mostrano il periodo scelto qui. Nella colonna a sinistra hai l\'elenco completo: ' +
             'un clic e salti da un periodo all\'altro.' },
    { sel: '[data-tab="riepilogo"]', tab: 'riepilogo', titolo: 'Riepilogo',
      testo: 'La risposta alla domanda "quanto ci dobbiamo?". In alto i numeri del periodo, poi il saldo, ' +
             'poi le categorie. Cliccando su una categoria salti ai movimenti già filtrati.' },
    { sel: '[data-tab="movimenti"]', tab: 'movimenti', titolo: 'Movimenti',
      testo: 'Qui correggi. Le righe <b>verdi</b> sono spese comuni, quelle <b>ambra</b> personali, ' +
             'quelle grigie escluse. Il numero rosso sulla linguetta conta le voci da confermare.' },
    { sel: '#tbodyMov tr', tab: 'movimenti', titolo: 'Una riga alla volta',
      testo: 'Cambia categoria, quota e chi ha pagato direttamente sulla riga. La <b>quota</b> è la percentuale ' +
             'che finisce nelle spese comuni: 100 tutta, 50 metà, 0 personale. Quello che tocchi a mano resta com\'è per sempre.' },
    { sel: '[data-tab="soggetti"]', tab: 'soggetti', titolo: 'Cerca per soggetto',
      testo: 'Quanto avete speso da un negozio, o incassato da una controparte, in tutto l\'archivio o in un periodo ' +
             'preciso? Scrivi il nome e vedi entrate, uscite e andamento mese per mese in un colpo solo.' },
    { sel: '#assistPanel', tab: 'assistente', titolo: 'L\'assistente Nemotron',
      testo: 'Scorre da destra: un modello NVIDIA legge i nomi degli esercenti e propone quali spese sono di casa ' +
             'e quali di lavoro. Tu confermi, e le risposte diventano regole permanenti. Il 📌 in alto lo blocca ' +
             'come barra fissa, e tutte le conversazioni passate restano lì, mese per mese.' },
    { sel: '[data-tab="note"]', tab: 'note', titolo: 'Note per il mese prossimo',
      testo: 'Il posto per "a settembre arriva il bollo". I promemoria non spuntati ricompaiono da soli ' +
             'nel riepilogo del mese successivo e finiscono nel report.' },
    { sel: '[data-azione="report-pdf"]', tab: 'riepilogo', titolo: 'Il report del mese',
      testo: 'PDF da stampare o mandare, XLSX per lavorarci in Excel con le righe già colorate. ' +
             'Salvali nella cartella <code>archivio/</code>.' },
    { sel: '#btnBackup', tab: null, titolo: 'Non saltare questo',
      testo: 'I dati vivono nel browser. Una volta al mese salva il backup <code>.json</code> in <code>archivio/</code>: ' +
             'è l\'unica copia che sopravvive a un cambio di computer.' }
  ];

  let indice = 0, velo = null, buco = null, carta = null, cambiaTab = null;

  function avvia(fnCambiaTab) {
    cambiaTab = fnCambiaTab;
    indice = 0;
    if (!velo) {
      velo = document.createElement('div'); velo.id = 'velo-guida';
      buco = document.createElement('div'); buco.id = 'buco-guida';
      carta = document.createElement('div'); carta.id = 'carta-guida';
      document.body.append(velo, buco, carta);
      velo.addEventListener('click', chiudi);
      carta.addEventListener('click', (e) => {
        const a = e.target.closest('[data-g]');
        if (!a) return;
        if (a.dataset.g === 'avanti') vai(indice + 1);
        else if (a.dataset.g === 'indietro') vai(indice - 1);
        else chiudi();
      });
      document.addEventListener('keydown', tasti);
    }
    velo.style.display = buco.style.display = carta.style.display = 'block';
    vai(0);
  }

  function tasti(e) {
    if (!velo || velo.style.display === 'none') return;
    if (e.key === 'Escape') chiudi();
    if (e.key === 'ArrowRight' || e.key === 'Enter') vai(indice + 1);
    if (e.key === 'ArrowLeft') vai(indice - 1);
  }

  function vai(n) {
    if (n < 0) return;
    if (n >= PASSI.length) return chiudi(true);
    indice = n;
    const p = PASSI[n];
    if (p.tab && cambiaTab) cambiaTab(p.tab);
    setTimeout(() => posiziona(p), p.tab ? 90 : 0);
  }

  function posiziona(p, tentativi) {
    tentativi = tentativi || 0;
    const el = document.querySelector(p.sel);
    const r = el ? el.getBoundingClientRect() : { top: innerHeight / 2 - 40, left: innerWidth / 2 - 120, width: 240, height: 80 };
    // header e barra laterale sono fissi: non ha senso provare a scrollarli in vista.
    // Solo il contenuto principale (scheda "main") viene scrollato, e al massimo 3 volte.
    const dentroMain = el && el.closest('main');
    if (dentroMain && tentativi < 3 && (r.top < 66 || r.bottom > innerHeight - 60)) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return setTimeout(() => posiziona(p, tentativi + 1), 280);
    }
    const pad = 6;
    buco.style.cssText += `;top:${r.top - pad}px;left:${r.left - pad}px;` +
      `width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;

    carta.innerHTML =
      `<div class="passo">Passo ${indice + 1} di ${PASSI.length}</div>
       <h4>${p.titolo}</h4><p>${p.testo}</p>
       <div class="fondo">
         <div class="punti">${PASSI.map((_, i) => `<i class="${i === indice ? 'on' : ''}"></i>`).join('')}</div>
         ${indice > 0 ? '<button class="btn sm" data-g="indietro">Indietro</button>' : ''}
         <button class="btn sm gh" data-g="chiudi">Chiudi</button>
         <button class="btn pri sm" data-g="avanti">${indice === PASSI.length - 1 ? 'Ho finito' : 'Avanti'}</button>
       </div>`;
    const h = carta.offsetHeight, w = 340;
    let top = r.bottom + 16, left = r.left + r.width / 2 - w / 2;
    if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 16);
    left = Math.max(12, Math.min(left, innerWidth - w - 12));
    carta.style.top = top + 'px';
    carta.style.left = left + 'px';
  }

  function chiudi(completata) {
    if (velo) velo.style.display = buco.style.display = carta.style.display = 'none';
    try { localStorage.setItem('spese-guida-vista', completata ? 'completata' : 'saltata'); } catch (_) {}
  }

  const giaVista = () => {
    try { return !!localStorage.getItem('spese-guida-vista'); } catch (_) { return false; }
  };

  return { attivaTooltip, avvia, chiudi, giaVista, PASSI };
})();
