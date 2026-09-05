# Regole di "Spese di casa"

Generato il 2026-09-05. Documenta **tutte** le regole con cui l'app decide, da sola, categoria e
quota comune di ogni spesa — così puoi leggerle, confrontarle e migliorarle senza aprire il
codice. Per portare delle modifiche dentro l'app usa il formato `.json` (scheda **Regole**,
pulsante **⬆ Importa**): questo `.md` è pensato per essere letto da una persona, non importato
da una macchina.

## Come funziona il riconoscimento

Ogni movimento viene confrontato con le regole **dall'alto verso il basso**: vince la prima il
cui testo (una o più parole separate da `|`, senza distinguere maiuscole/minuscole) trova
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
| 1 | `Ricarica Carta\|Ricarica carta ricaricabile\|Giroconto\|Bonifico a favore di ROSSI` | Giroconti | 0% | no | giroconto | Ricarica della prepagata: la spesa vera è nell'estratto della carta |
| 2 | `Prelievo Bancomat\|Prelevamento\|Prelievo contant` | Contanti | 0% | no | contanti-da-assegnare | Contante prelevato: registra a mano come lo hai speso |
| 3 | `DECO SUPERMERCATI\|SOLE 365\|SUPE SUPERSTORE\|CONAD\|LIDL\|EUROSPIN\|CARREFOUR\|ESSELUNGA\|COOP\|PENNY\|MD SPA\|TERRA FELIX\|BOUTIQUE DELLA FRUTTA\|SIGMA SRL` | Supermercato | 100% | no | — | — |
| 4 | `ACQUA E SAPONE\|TIGOTA\|DM DROGERIE\|BORRIELLO FERRAMENTA\|LEROY MERLIN\|IKEA\|BRICO\|OBI ITALIA` | Casa e igiene | 100% | no | — | — |
| 5 | `FARMACIA\|PARAFARMACIA\|LLOYDS\|DOTT\.\|LABORATORIO ANALISI\|POLIAMBULATORIO` | Farmacia e salute | 100% | no | — | — |
| 6 | `PIZZERIA\|RISTORANTE\|TRATTORIA\|OSTERIA\|BAR \|BARRIO\|SUSHI\|BURGER\|MCDONALD\|POKE\|GELAT\|PASTICC\|CAFF\|TARANTELLA\|CHEN RONG\|FOOD & DELIGHTS\|SPEEDY PI\|ALI BABA\|STAIRS\|AURELIO\|UMI \|OPERA NAPOLI\|LIDO` | Ristoranti e bar | 100% | no | — | — |
| 7 | `PETROLMAR\|PETROLI\|ENI \|Q8\|IP \|TAMOIL\|ESSO\|AGIP\|EASY SERVICE\|DISTRIBUTORE\|CARBURANT` | Carburante | 100% | no | — | — |
| 8 | `AUTORICAMBI\|OFFICINA\|GOMMIST\|CARROZZERIA\|REVISIONE\|AUTOFFICINA\|BOLLO AUTO` | Auto e manutenzione | 100% | sì | — | — |
| 9 | `Pedaggio\|TELEPASS\|AUTOSTRAD` | Pedaggi | 100% | sì | — | — |
| 10 | `ANM PARK\|PARK \|PARCHEGGIO\|UNICOCAMPANIA\|TRENITALIA\|ITALO\|ANM \|METRO\|SOSTA` | Trasporti e sosta | 100% | no | — | — |
| 11 | `ASSICURA\|GENERALI\|UNIPOL\|ALLIANZ\|AXA \|ZURICH\|VERTI\|QUIXA\|PRIMA\.IT\|LINEAR` | Assicurazioni | 100% | sì | — | — |
| 12 | `ANTHROPIC\|OPENROUTER\|OPENAI\|SKOOL\|LAYLA\|GITHUB\|CURSOR\|MIDJOURNEY\|NOTION\|ADOBE\|JETBRAINS\|VERCEL\|AWS \|GOOGLE CLOUD\|DIGITALOCEAN` | Lavoro e software | 0% | no | — | Strumenti di lavoro: fuori dalle spese comuni |
| 13 | `NETFLIX\|DISNEY\|SPOTIFY\|PRIME VIDEO\|DAZN\|NOW TV\|SKY \|APPLE\.COM/BILL\|GOOGLE\*\|MICROSOFT\|SCRIBD\|AUDIBLE\|YOUTUBE` | Abbonamenti | 50% | no | — | Abbonamenti di casa: metà a testa (modifica la quota se serve) |
| 14 | `sisal\|TABACCHERIA\|LOTTOMATICA\|SNAI\|G2A\.COM\|STEAM\|PLAYSTATION\|NINTENDO` | Tempo libero | 0% | no | — | — |
| 15 | `AMAZON\|AMZN\|EBAY\|ZALANDO\|SHEIN\|TEMU\|ALIEXPRESS` | Shopping online | 100% | no | — | Verifica: gli acquisti online non sono sempre comuni |
| 16 | `OVS\|ZARA\|H&M\|DECATHLON\|PRIMARK\|CALZEDONIA\|SCARPE` | Abbigliamento | 100% | no | — | — |
| 17 | `HO-MOBILE\|HO\.MOBILE\|TIM \|VODAFONE\|WINDTRE\|ILIAD\|FASTWEB` | Telefonia | 50% | no | — | — |
| 18 | `ENEL\|ENI GAS\|HERA\|A2A\|ACEA\|ABC NAPOLI\|IREN\|SORGENIA\|luce\|gas` | Casa: bollette | 100% | sì | — | — |
| 19 | `MSC Cruises\|BOOKING\|AIRBNB\|RYANAIR\|EASYJET\|ITA AIRWAYS\|HOTEL\|VILLAGGIO\|CROCIER\|TRIVAGO` | Viaggi e vacanze | 50% | no | — | Vacanze: di solito 50/50, controlla |
| 20 | `AGENZIA DELLE ENTRATE\|F24\|IMU\|TARI\|IMPOSTA\|TRIBUT` | Tasse e imposte | 0% | no | — | — |
| 21 | `Canone Mensile\|imposta di bollo\|COMMISSION\|SPESE TENUTA\|Bollo Dossier` | Spese bancarie | 0% | no | — | — |
| 22 | `ATM-DOMOTIC\|IDRAULIC\|ELETTRICIST\|RIPARAZIONE\|URGENZA\|IMPREVIST` | Imprevisti | 100% | sì | — | — |

## Comportamento predefinito dei conti

Si applica solo ai movimenti che non incontrano nessuna regola sopra.

| Conto | Etichetta | Quota base | Descrizione |
|---|---|---|---|
| `carta:1234` | Carta condivisa 1234 | 100% | Carta usata per le spese di casa: entra tutta nelle spese comuni. |
| `telepass` | Telepass | 100% | Pedaggi autostradali: spesa comune al 100%. |
| `conto` | Conto corrente | 0% | Fuori dalle comuni salvo eccezioni (assicurazione, imprevisti...). |
| `contanti` | Contanti | 100% | Spese in contanti aggiunte a mano. |

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
