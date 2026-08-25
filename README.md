# Spese di casa

App locale (nessun server esterno, nessun account) per mettere in ordine gli estratti conto del
mese: importa, categorizza, e — a scelta — divide le spese con qualcuno o le tiene solo per te.

*A local web app (no external server, no account) to organize monthly bank statements: import,
categorize, and optionally split expenses with someone or just track your own.*

---

## Cosa fa

- **Importa** estratti conto (carta, conto corrente, Telepass) in `.xlsx`/`.xls`/`.pdf`, più un
  **CSV generico** per banche non previste — alla prima volta chiede quali colonne usare e se lo
  ricorda per i file successivi.
- **Categorizza automaticamente** con un motore di regole (testo → categoria + quota), modificabile
  e esportabile/importabile come `.json`.
- **Due modalità**: *condivisa* (dividi le spese con qualcuno, con saldo e quote) o *personale*
  (solo rendicontazione, senza divisione).
- **Report mensili** in PDF e XLSX, generati e salvati automaticamente in cartelle ordinate.
- **Assistente opzionale** (NVIDIA Nemotron, via un piccolo server locale che fa da ponte): propone
  quali spese sono di casa e quali personali/di lavoro, risponde a domande sulla gestione, genera
  report su misura da una richiesta in linguaggio naturale. Facoltativo: l'app funziona identica
  senza chiave configurata.
- **Tutto resta sul tuo computer**: i dati vivono nel browser (IndexedDB), i file vengono letti e
  scritti in locale. L'unica cosa che esce, se usi l'assistente, sono nomi di esercenti e numeri
  aggregati verso l'API NVIDIA — mai numeri di carta, IBAN o file originali.

## Come si avvia

Serve Python 3 (preinstallato su macOS e sulla maggior parte delle distribuzioni Linux).

```bash
git clone https://github.com/<tuo-utente>/household-expenses.git
cd household-expenses
python3 server.py 8791
```

Poi apri `http://localhost:8791` nel browser. Su macOS puoi anche fare doppio clic su
`avvia.command`, che apre il browser da solo.

Al primo avvio l'app fa due domande — come vuoi usarla, e se condividi le spese con qualcuno i
vostri nomi — e propone di aggiungere una chiave API NVIDIA (facoltativa, gratuita su
[build.nvidia.com](https://build.nvidia.com)) per attivare l'assistente. Tutto si può cambiare in
qualunque momento da **⚙ Impostazioni**.

Metti gli estratti conto scaricati in una cartella dentro `raw/` (vedi `raw/LEGGIMI.txt`), poi
premi **🔄 Leggi tutto da raw/** nell'app.

## Stack tecnico

Vanilla JavaScript (nessun framework, nessun build step), un lettore/scrittore `.xlsx` e un
generatore PDF scritti da zero per evitare dipendenze pesanti, [pdf.js](https://mozilla.github.io/pdf.js/)
vendorizzato per la lettura dei PDF, e un piccolo server HTTP in Python (libreria standard, nessuna
dipendenza esterna) che serve i file e fa da ponte verso l'API NVIDIA quando l'assistente è attivo.

## Privacy

Nessun dato finanziario lascia il tuo computer, a parte — solo se attivi l'assistente — nomi di
esercenti e cifre aggregate mandati all'API NVIDIA per generare risposte. Le cartelle `raw/` e
`archivio/` (dove finiscono i tuoi estratti conto e i tuoi report) sono escluse da `.gitignore`:
restano solo sul tuo computer, non vengono mai versionate.

## Licenza

Codice sorgente pubblico per consultazione. **Tutti i diritti riservati**: nessuna licenza d'uso,
copia, modifica o ridistribuzione senza autorizzazione esplicita dell'autore.
