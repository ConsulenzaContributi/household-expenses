# Changelog

Tutte le modifiche rilevanti di "Spese di casa" sono elencate qui, versione per versione.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/); il numero di
versione (in `VERSION`, e stampato all'avvio del programma) segue [SemVer](https://semver.org/lang/it/).

## [1.1.0] — 2026-09-05

### Aggiunto
- **Modalità condivisa / personale**: oltre a dividere le spese con qualcuno, ora l'app
  funziona anche come semplice rendicontazione personale, senza saldo da dividere.
- **Wizard al primo avvio**: due domande essenziali (modalità, nomi) invece di dover capire
  da soli la struttura delle cartelle.
- **Chiave API e modello NVIDIA configurabili da Impostazioni** (e dal wizard), senza dover
  editare `chiave-nvidia.txt` a mano.
- **Import CSV generico**: banche non previste chiedono una volta sola quali colonne usare
  (data, importo, descrizione) e da lì in poi vengono riconosciute da sole.
- **Regole come "starter pack"**: esportabili/importabili in `.json`, più un nuovo export in
  **`.md`** leggibile (`REGOLE.md`), pensato per essere letto, confrontato e migliorato da
  una persona, non solo importato da una macchina.
- **Pannello assistente scorrevole**: non più una scheda fissa ma un pannello che scorre da
  destra, bloccabile come barra fissa (📌), con lo storico di tutte le conversazioni passate
  mese per mese.
- **Report su misura**: chiedi all'assistente una spesa da ritrovare in tutto l'archivio in
  linguaggio naturale ("le spese Amazon del 2025") e la esporti in PDF/XLSX con un clic.
- **Ordinamento cliccabile** su tutte le colonne della tabella Movimenti (Data, Descrizione,
  Categoria, Importo, Quota, In comune, Pagato da), alfabetico o numerico, con toggle asc/desc.
- **Percentuale di divisione colorata** accanto a ogni esercente in "Dove spendete di più".
- **Motivo/giustificazione per ogni spesa** nei report PDF ed Excel: la nota scritta a mano,
  o — se manca — la spiegazione automatica della regola che l'ha classificata.
- **Nome dei file esportati** include ora chi deve quanto a chi (es. *"...(Moglie deve 654,10 €
  a Mario).xlsx"*), visibile dal Finder senza aprire il file.
- **Report "parziale" per il mese in corso**: generandolo prima della fine del mese, il file
  viene segnato come parziale (nel nome e con un avviso dentro il documento) con la data di
  generazione, perché i numeri cambieranno con nuovi movimenti.
- **Versione del programma** stampata all'avvio e restituita da `/api/llm/stato`.
- Il server sceglie da solo la prossima porta libera se quella richiesta è occupata, e apre
  da solo il browser all'avvio (prima lo faceva solo `avvia.command` su Mac).
- **Eseguibile e installer per Windows** (vedi sotto "Windows").

### Cambiato
- **Cartelle di `archivio/`** organizzate per **anno** (es. `archivio/2026/`) invece che per
  mese: i report di tutti i mesi dello stesso anno finiscono nella stessa cartella.

### Corretto
- **Doppioni conto/carta**: il controllo confrontava la data esatta, ma l'addebito sul conto
  corrente arriva quasi sempre qualche giorno dopo quella segnata sulla carta. Ora l'incrocio
  tolleta fino a 6 giorni di scarto, mantenendo importo e descrizione come controllo principale.
- Il validatore dei nomi file lato server non ammetteva il punto (usato dal formato italiano
  per separare le migliaia, es. "1.308,21 €"): con importi sopra le 999 € il salvataggio
  falliva silenziosamente.
- Bug nell'esportazione XLSX dei report su misura: mancava un `await`, il file scritto era
  corrotto invece di un vero foglio Excel.

## [1.0.0] — 2026-08-24

Prima pubblicazione: importazione multi-formato (estratto carta, conto corrente, Telepass,
PDF trimestrale Fineco), categorizzazione automatica con regole modificabili, divisione delle
spese 50/50 (o quota libera), report mensili in PDF/XLSX, assistente opzionale NVIDIA Nemotron
per classificazione, testi pronti e chat, tutto in locale senza server esterno né account.
