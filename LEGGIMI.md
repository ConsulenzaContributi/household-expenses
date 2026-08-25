# Spese di casa

App locale per mettere in ordine gli estratti conto del mese e calcolare quanto spetta a ciascuno.
Gira interamente nel browser, sul tuo computer: **nessun dato viene inviato online**.

---

## Come si avvia

Doppio clic su **`avvia.command`**. Si apre il browser da solo sull'app.
Lascia aperta la finestra nera del Terminale mentre la usi; per chiudere, premi `Ctrl+C`.

> Puoi anche aprire `index.html` con un doppio clic, ma in quel modo l'app **non** può leggere
> da sola la cartella `raw/`: dovrai trascinare i file dentro a mano.

Al primissimo avvio (archivio vuoto) l'app fa **due domande** — come vuoi usarla e, se condividi le
spese, come vi chiamate — e propone di aggiungere la chiave dell'assistente, che puoi anche saltare.
Non ricompare più dopo, e tutto quello che scegli lì si può cambiare in qualunque momento da
**⚙ Impostazioni**.

## Due modalità: condivisa o personale

- **Condivisa** — quella pensata all'origine: dividi le spese con qualcuno (coniuge, convivente...),
  con quota, saldo e "chi deve quanto a chi". È la modalità di questa guida.
- **Personale** — solo rendicontazione delle proprie spese, senza nessuna divisione: niente saldo,
  niente "quota", solo categorie e totali. Utile anche solo per tenere sotto controllo dove vanno
  i propri soldi mese per mese.

Si sceglie al primo avvio o da **⚙ Impostazioni → Modalità**, e si può cambiare quando si vuole:
cambiarla non tocca i movimenti già importati, cambia solo come vengono presentati.

## Il giro di ogni mese (5 minuti)

1. Scarica gli estratti del mese e mettili in una cartella nuova dentro `raw/`, per esempio `raw/2026-08/`:
   - estratto della **carta condivisa 1234**
   - estratto della **carta personale 5678**
   - **movimenti del conto corrente**
   - **movimenti Telepass**
   I nomi dei file non contano: il formato viene riconosciuto dal contenuto.
2. Apri l'app e premi **🔄 Leggi tutto da raw/**. Controlla l'anteprima e conferma.
3. Apri l'**Assistente** (il pulsante 🤖 in basso a destra) e premi **✨ Analizza esercenti**: separa
   le spese di lavoro (Anthropic, OpenRouter, servizi AI...) finite sulla carta di casa da quelle vere.
4. Vai su **Movimenti → Da controllare** e sistema le poche voci rimaste.
5. Aggiungi con **＋ Spesa** quello che non compare negli estratti: contanti, assicurazione,
   bollette, imprevisti.
6. Da **Riepilogo** premi **📄 PDF** e **📗 XLSX**: finiscono da soli in `archivio/2026-08/`, con
   nome già pronto — non c'è nessuna finestra "salva con nome" da compilare.
7. Su **Note** lascia i promemoria per il mese prossimo: li ritroverai nel riepilogo di settembre.

## L'assistente (NVIDIA Nemotron)

Un modello **NVIDIA Nemotron** gira dietro un piccolo server locale (`server.py`) che fa da ponte:
la chiave resta sul tuo computer (file `chiave-nvidia.txt`) e non entra mai nel browser.

**Configurarlo** — da **⚙ Impostazioni** (o al primo avvio): incolla la chiave — gratis su
[build.nvidia.com](https://build.nvidia.com) — e scegli il modello fra quelli disponibili (uno più
di qualità, uno più veloce/economico). Basta salvare: non serve toccare file a mano né riavviare
il Terminale. La chiave non viene mai mostrata per intero una volta salvata, solo un'anteprima
mascherata, e non torna mai indietro dal server verso il browser.

Quattro cose che fa:

- **Motore spese comuni** (pannello *Assistente*, si apre col pulsante 🤖) — legge i nomi degli esercenti del mese (non gli
  importi riga per riga, non dati personali) e propone per ciascuno se è spesa di casa o personale/
  di lavoro. Confermi con un clic e la proposta diventa una **regola permanente**: dal mese dopo è
  già classificato, senza richiamare il modello.
- **Testi pronti** — commento del mese per il report, messaggio da mandare, promemoria proposti,
  controllo delle anomalie.
- **Chat** — domande libere sulla gestione del mese aperto. Ha l'ordine esplicito di usare solo i
  numeri che le passa l'app: se un dato non c'è, lo dice invece di inventarlo.
- **Report su misura** — scrivi una richiesta ("le spese Amazon del 2025", "carburante negli ultimi
  6 mesi"), cerca su **tutto l'archivio** (non solo il mese aperto), ti fa vedere un'anteprima di
  quello che ha trovato, e da lì lo esporti in PDF o XLSX con un clic. I file finiscono in
  `archivio/report-su-misura/`.

Senza chiave configurata l'app funziona identica: l'assistente è un aiuto, non un ingranaggio
obbligatorio.

Il pannello dell'assistente scorre da destra sopra il resto della finestra; il pulsante 📌 in alto
lo blocca come una barra fissa (resta aperto anche cambiando scheda) invece di farlo scorrere dentro
e fuori — la preferenza resta salvata anche dopo aver chiuso il browser. Tutte le conversazioni
passate restano visibili dentro, raggruppate mese per mese, non solo quelle del mese aperto in quel
momento.

## Mese, trimestre, anno

In cima alla colonna a sinistra c'è un interruttore **Mese · Trimestre · Anno**: cambia lo zoom di
**Riepilogo**, **Movimenti**, **Categorie** e dei report esportati, senza cambiare i calcoli — un
trimestre è semplicemente la somma dei suoi tre mesi. L'elenco sotto l'interruttore e il menu in alto
mostrano i periodi di quella granularità presenti in archivio.

**Note e Assistente restano sempre ancorati al mese "in corso"**, qualunque zoom tu stia
guardando: un promemoria o una classificazione hanno senso su un mese preciso, non su "il 2026".
Puoi passare da Anno 2026 a Riepilogo, poi aprire Note, e vedi comunque i promemoria del mese che
stavi seguendo prima di allargare lo zoom.

PDF, XLSX e CSV seguono il periodo che stai guardando in quel momento, e finiscono ciascuno nella
sua sottocartella: `archivio/2026-07/` per un mese, `archivio/2026-T3/` per un trimestre,
`archivio/2026/` per un anno intero.

## Cerca per soggetto

La scheda **Soggetti** risponde a "quanto abbiamo speso da Decathlon?" o "quanto è entrato con
quel bonifico?": scrivi un nome (o scegli dall'elenco a tendina, che ricorda gli esercenti già
visti) e scegli se cercare su **tutto l'archivio** o solo nel periodo che stai guardando in quel
momento. Il risultato mostra entrate, uscite, il netto, l'andamento mese per mese e l'elenco dei
movimenti trovati — anche quando lo stesso esercente compare con nomi leggermente diversi negli
estratti (es. "DECATHLON ITALIA" e "DECATHLON CASORIA": la ricerca li trova entrambi e te li segnala).

## Colori e report

Ogni movimento è colorato secondo come viene contato — le stesse tinte in app, PDF e Excel:
🟢 **verde** spesa comune · 🟢 chiaro **in parte comune** · 🟠 **ambra** personale/lavoro · **grigio** escluso.

Da **Riepilogo** si generano quattro formati, tutti con l'evidenziazione a colpo d'occhio:
- **📄 PDF** — documento completo, pronto da stampare o mandare.
- **📗 XLSX** — quattro fogli (Riepilogo, Movimenti, Esercenti, Note), filtri attivi, righe colorate.
- **📊 CSV** — solo l'elenco movimenti, per chi preferisce Numbers o un altro programma.
- **💾 Backup** — tutto l'archivio in un file `.json`, l'unica copia fuori dal browser.

Non scaricano nella cartella Download del browser: il piccolo server locale (`server.py`) li scrive
**da solo dentro `archivio/`**, ognuno con un nome sempre uguale, così l'archiviazione resta ordinata
senza doverci pensare:

```
archivio/
├── 2026-07/
│   ├── 2026-07 - Report spese comuni.pdf
│   ├── 2026-07 - Report spese comuni.xlsx
│   └── 2026-07 - Movimenti.csv
├── 2026-08/
│   └── …
└── Backup/
    ├── 2026-07-31 - Backup.json
    └── 2026-08-31 - Backup.json
```

Rigenerare lo stesso report **sostituisce** il file precedente (te lo dice il messaggio a video),
non crea doppioni con numeri progressivi. Se apri l'app come semplice file invece che con
`avvia.command` (o il server locale non risponde), l'app se ne accorge da sola e usa il download
del browser come ripiego, avvisandoti che quel file va spostato a mano.

Ogni volta che un file viene salvato, il messaggio a video ha un pulsante **📂 Apri nel Finder**:
un clic e si apre una finestra del Finder con quel file già selezionato, senza doverlo cercare a
mano dentro `archivio/`.

## Guida e tooltip

La scheda **Guida** spiega passo per passo come funziona tutto, compreso l'elenco di ogni pulsante.
Il pulsante **▶ Avvia la visita guidata** accende un riflettore sui punti chiave dell'app, uno alla
volta. Passando il mouse su qualunque pulsante compare una spiegazione dopo un attimo.

## Le cartelle

| Cartella    | A cosa serve                                                             |
|-------------|--------------------------------------------------------------------------|
| `raw/`      | Gli estratti scaricati dalla banca, una sottocartella per mese            |
| `archivio/` | I report generati (PDF, XLSX, CSV), una sottocartella per periodo (mese/trimestre/anno), più `archivio/Backup/` |
| `js/ css/`  | Il codice dell'app                                                        |
| `server.py` | Il server locale: serve l'app, fa da ponte con NVIDIA e scrive i file in `archivio/` |

## Come vengono calcolate le spese comuni

Ogni movimento ha una **quota comune** in percentuale: `100%` tutto in comune, `50%` metà,
`0%` spesa personale. La quota nasce da tre livelli, dal più debole al più forte:

1. **Il conto di provenienza** — carta 1234 e Telepass entrano al 100%, conto corrente e carta
   personale allo 0%.
2. **Le regole** (scheda *Regole*) — assegnano categoria e quota in base al testo della descrizione.
   Le regole non tirano dentro alle comuni una spesa del conto corrente, la *propongono*:
   la trovi in *Da controllare*. Fanno eccezione assicurazioni, imprevisti, bollette, manutenzione
   auto e pedaggi, che si dividono sempre.
3. **La tua correzione a mano** — vince su tutto e non viene più sovrascritta.

Poi la somma delle quote viene divisa secondo la percentuale impostata in **⚙ Impostazioni**
(di serie 50/50) e confrontata con quanto ha già pagato ciascuno: ne esce il saldo.

## Cosa viene escluso da solo

- **Doppioni conto ↔ carta.** Le spese fatte con la carta di debito 5678 compaiono sia nel suo
  estratto sia nei movimenti del conto corrente. L'app riconosce la coppia e conta solo una volta.
- **Ricariche della prepagata.** Gli addebiti "Ricarica carta ricaricabile" sul conto corrente sono
  giroconti: la spesa vera è quella dell'estratto della 1234.
- **Prelievi in contanti.** Non sono una spesa finché non sai in cosa sono finiti: l'app te li segnala
  perché tu registri con **＋ Spesa** la parte comune.

## Controllo di quadratura

Quando l'estratto riporta un totale (*"Totale movimenti"*, *"Importo totale"*), l'app somma quello
che ha letto e lo confronta: se i due numeri non coincidono te lo dice in anteprima, prima di importare.
È la rete di sicurezza contro un file letto a metà.

## Copertura archivio: cosa manca

In cima alla scheda **Importa** c'è un riquadro che guarda, conto per conto e carta per carta, quali
mesi hanno almeno un movimento e quali no — fra il primo e l'ultimo mese visti in tutto l'archivio.
Un mese senza movimenti ma con mesi pieni sia prima sia dopo è quasi sempre un estratto che manca
ancora da scaricare, non un mese in cui davvero non è successo nulla: un conto o una carta usati con
regolarità non stanno mai fermi un mese intero. Un buco a inizio o fine serie invece è normale (quel
conto non esisteva ancora, o è il mese in corso non ancora concluso) e non viene segnalato.

## Il catalogo di raw/

Sotto il riquadro di copertura, il pulsante **🗂 Genera/aggiorna catalogo** rilegge ogni file dentro
`raw/` — con gli stessi lettori usati per importare — e scrive due file **dentro `raw/` stessa**:

- **`catalogo.csv`** — una riga per file: cartella, formato riconosciuto, mesi coperti, tipologia
  (conto corrente / quale carta / Telepass), numero di movimenti, totale, se quadra con quanto
  dichiarato dal documento. Si apre con Excel o Numbers.
- **`catalogo.md`** — lo stesso contenuto riassunto per tipologia, più l'elenco dei file scaricati
  più volte per sbaglio (stesso contenuto, nomi diversi) e di quelli che non quadrano.

È un indice, non un'importazione: **non tocca l'archivio dell'app**, serve solo a sapere cosa c'è
dentro `raw/` guardando due file di testo, anche senza aprire il browser. Rigeneralo ogni volta che
aggiungi nuovi documenti: sostituisce i due file precedenti, non li accumula.

## Mese di competenza

Di serie un movimento finisce nel mese della sua **data di addebito**, come lo raggruppa la banca:
così i totali del report coincidono con quelli stampati sull'estratto, comprese le spese di fine mese
addebitate a inizio mese successivo. Da **⚙ Impostazioni** puoi passare alla data dell'operazione.

## Backup

L'archivio vive nel browser (IndexedDB). Sopravvive alla chiusura, **non** alla cancellazione dei dati
del browser né al cambio di computer. Ogni tanto premi **💾 Salva backup**: il file finisce da solo in
`archivio/Backup/AAAA-MM-GG - Backup.json`. Con **📂 Ripristina backup** scegli quel file e torna
tutto com'era.

## Formati letti

| Fonte                          | File    | Come viene riconosciuto                             |
|--------------------------------|---------|-------------------------------------------------------|
| Estratto conto carta           | `.xlsx` | colonne *Intestatario carta* + *Numero carta*          |
| Movimenti conto corrente       | `.xlsx` | colonne *Data_Operazione* + *Descrizione_Completa*     |
| Movimenti Telepass             | `.xls`  | colonne *Numero dispositivo* + *Classe*                |
| Estratto conto Fineco trimestrale | `.pdf` | il documento ufficiale scaricabile dall'area "Documenti" di Fineco |

Per i `.xlsx` l'app usa un lettore scritto su misura (`js/xlsxlite.js`): la banca esporta file con uno
zip "in streaming" che le librerie generiche leggono **troncati e senza segnalare errori** — nel test
iniziale si perdevano 25 movimenti su 51. Il lettore su misura prende le dimensioni dal Central Directory
dello zip, che è sempre corretto, e verifica di aver decompresso tutti i byte attesi.

### Gli estratti conto trimestrali in PDF

Fineco genera ogni tre mesi un PDF che, da solo, contiene **sia i movimenti del conto corrente sia
quelli di ogni carta collegata**, mese per mese. È il modo più veloce per recuperare anni di storico:
bastano i PDF trimestrali per ricostruire tutto, senza dover scaricare decine di estratti mensili
separati per ogni carta.

L'app legge il testo del PDF con **pdf.js** (il motore di Firefox, vendorizzato in `js/vendor/`):
scrivere un lettore da zero non aveva senso qui, a differenza degli `.xlsx` — un PDF di testo vero
richiede di capire font ed encoding, un problema enorme rispetto a leggere uno zip. Il documento non
è una tabella sola: `js/parserpdf.js` lo legge come una macchina a stati, riconoscendo dal testo dove
inizia la sezione del conto corrente e dove inizia quella di ciascuna carta, e usa la **posizione
orizzontale** di ogni importo sulla pagina per capire se è un'uscita o un'entrata — il PDF, a
differenza dell'xlsx, non lo scrive a parole, lo dice solo con la colonna.

**Controllo di quadratura specifico**: ogni PDF stampa il saldo iniziale e il saldo finale del
trimestre. L'app somma i movimenti del conto corrente che ha letto e verifica che la differenza
coincida — verificato su 41 estratti reali (2017-2026), sempre a zero centesimi di scarto tranne i
due primissimi che non hanno un saldo iniziale da confrontare (la primissima volta che il conto è
esistito).

**Stesso movimento, fonti diverse**: quando lo stesso mese compare sia nel PDF trimestrale sia in un
estratto `.xlsx` scaricato a parte, l'app li riconosce come lo stesso movimento e lo conta una volta
sola — stesso meccanismo di deduplica già usato fra conto corrente e carta di debito.

### Le rendicontazioni Telepass in PDF

Sotto il nome "fattura" Telepass scarica in realtà **tre documenti diversi**, e l'app li riconosce
tutti e tre da poche parole nel testo (`js/parsertelepass.js`):

| Documento | Cosa contiene |
|---|---|
| *Autostrade per l'Italia* | i pedaggi veri e propri, uno per riga, con data/ora/tratta |
| *Telepass S.p.A.* — canone | il costo periodico dell'abbonamento (una riga sola, nessun pedaggio) |
| *Telepass S.p.A.* — parcheggi | le soste pagate col Telepass, elencate come i pedaggi |

Anche qui la posizione orizzontale sulla pagina conta: sul documento dei pedaggi uno sconto sul
transito ("SCO") è stampato con l'importo **negativo**, e va sottratto dal totale invece che
sommato — un dettaglio che nel primo giro di test aveva fatto sballare il conto di qualche euro a
trimestre finché non è stato corretto. Il controllo di quadratura (il documento stampa sempre un
totale) l'ha scoperto subito: verificato su tutti i documenti reali, sempre a zero centesimi di scarto.
