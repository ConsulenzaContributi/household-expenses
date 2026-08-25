#!/usr/bin/env python3
"""
Server locale di "Spese di casa".

Fa tre cose:
  1. serve i file dell'app (index.html, js/, css/, raw/ ...)
  2. espone /api/llm come ponte verso i modelli NVIDIA Nemotron — l'API NVIDIA
     non manda gli header CORS, quindi il browser bloccherebbe la chiamata
     fatta direttamente dalla pagina; in più, così la chiave resta qui e non
     finisce mai dentro il JavaScript.
  3. espone /api/salva per scrivere PDF, XLSX, CSV e backup direttamente
     dentro la cartella archivio/ del progetto, con un nome sempre uguale e
     ordinato: il browser da solo può solo proporre un download nella
     cartella Download, non scegliere una cartella del progetto — lo fa
     questo server al posto suo.
  4. espone /api/apri per mostrare un file appena salvato nel Finder — anche
     questo il browser non può farlo da solo per motivi di sicurezza, quindi
     lo fa il server con il comando "open -R" di macOS.

Ascolta solo su 127.0.0.1: nessuno da fuori può raggiungerlo.
"""
import base64, http.server, json, os, platform, re, socketserver, subprocess, sys
import urllib.request, urllib.error
from pathlib import Path

RADICE = Path(__file__).resolve().parent
ARCHIVIO = RADICE / "archivio"
ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
MODELLO_DEFAULT = "nvidia/nemotron-3-super-120b-a12b"
MODELLO_VELOCE = "nvidia/nemotron-3-nano-30b-a3b"
CHIAVE_FILE = RADICE / "chiave-nvidia.txt"

# elenco curato: solo i modelli Nemotron che questa app sa usare bene per
# classificazione/chat/documenti. L'utente sceglie da qui in Impostazioni,
# non deve mai scrivere a mano un model id.
MODELLI_DISPONIBILI = [
    {"id": MODELLO_DEFAULT, "etichetta": "Nemotron Super 120B — qualità migliore (predefinito)"},
    {"id": MODELLO_VELOCE, "etichetta": "Nemotron Nano 30B — più veloce ed economico"},
]


def chiave():
    """Cerca la chiave: prima la variabile d'ambiente, poi il file locale."""
    k = os.environ.get("NVIDIA_API_KEY", "").strip()
    if k:
        return k
    if CHIAVE_FILE.exists():
        for riga in CHIAVE_FILE.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if riga and not riga.startswith("#"):
                return riga
    return ""


# solo lettere, cifre, spazio, trattino, underscore, punto: niente che possa
# uscire dalla cartella archivio/ (niente "/", "\", "..")
_NOME_VALIDO = re.compile(r"^[\w àèéìòù\-,()%€]+$", re.UNICODE)


def percorso_sicuro(sottocartella, nomefile):
    """Valida sottocartella e nome file e restituisce il percorso finale dentro
    archivio/, oppure None se qualcosa non va (tentativo di uscire dalla
    cartella, caratteri non ammessi, estensione non prevista)."""
    sottocartella = (sottocartella or "").strip()
    nomefile = (nomefile or "").strip()
    if not nomefile or len(nomefile) > 180:
        return None
    if not re.match(r"^[\w-]{0,40}$", sottocartella):
        return None
    base, punto, ext = nomefile.rpartition(".")
    if not punto or ext.lower() not in ("pdf", "xlsx", "csv", "json"):
        return None
    if not _NOME_VALIDO.match(base):
        return None

    cartella = (ARCHIVIO / sottocartella) if sottocartella else ARCHIVIO
    cartella = cartella.resolve()
    if ARCHIVIO.resolve() not in cartella.parents and cartella != ARCHIVIO.resolve():
        return None
    return cartella / nomefile


RAW = RADICE / "raw"
_NOMI_CATALOGO = {"catalogo.csv", "catalogo.md"}


def percorso_sicuro_raw(nomefile):
    """Come percorso_sicuro, ma per i due soli file di catalogo scritti dentro
    raw/ — un elenco chiuso di nomi, niente sottocartelle: qui il rischio di
    un percorso inventato non esiste proprio."""
    nomefile = (nomefile or "").strip()
    if nomefile not in _NOMI_CATALOGO:
        return None
    return RAW / nomefile


def dentro_archivio(percorso_relativo):
    """Risolve un percorso (relativo alla radice del progetto, come quello che
    torna /api/salva o /api/salva-raw) e controlla che stia dentro archivio/
    oppure sia uno dei due file di catalogo di raw/: usato prima di aprire
    qualunque cosa nel Finder, per non rivelare file a caso."""
    try:
        p = (RADICE / str(percorso_relativo)).resolve()
    except Exception:
        return None
    if p.parent == RAW.resolve() and p.name in _NOMI_CATALOGO:
        return p
    a = ARCHIVIO.resolve()
    if p != a and a not in p.parents:
        return None
    return p


class Gestore(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RADICE), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("  » %s\n" % (fmt % args))

    def end_headers(self):
        # niente cache sui file statici: è un'app locale in sviluppo continuo,
        # meglio ricaricare sempre l'ultima versione che rincorrere refresh forzati.
        if not (self.path or "").startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        if self.path.startswith("/api/llm/stato"):
            k = chiave()
            return self._json(200, {
                "attivo": bool(k),
                "modello": MODELLO_DEFAULT,
                "modelloVeloce": MODELLO_VELOCE,
                "chiave": (k[:9] + "…" + k[-4:]) if k else None,
            })
        if self.path.startswith("/api/llm/modelli"):
            return self._json(200, {"modelli": MODELLI_DISPONIBILI})
        return super().do_GET()

    # ----------------------------------------------------------------- POST
    def do_POST(self):
        if self.path.startswith("/api/llm/chiave"):
            return self._salva_chiave()
        if self.path.startswith("/api/llm"):
            return self._llm()
        if self.path.startswith("/api/salva-raw"):
            return self._salva_raw()
        if self.path.startswith("/api/salva"):
            return self._salva()
        if self.path.startswith("/api/apri"):
            return self._apri()
        return self._json(404, {"errore": "endpoint sconosciuto"})

    # ------------------------------------------------ chiave configurabile --
    def _salva_chiave(self):
        """Scrive la chiave NVIDIA scelta da Impostazioni/wizard dentro
        chiave-nvidia.txt: stesso file che l'utente poteva già editare a mano,
        solo che ora può farlo dall'app. Non torna mai la chiave indietro."""
        try:
            richiesta = self._leggi_corpo()
        except Exception as e:
            return self._json(400, {"errore": "richiesta non valida: %s" % e})
        nuova = str(richiesta.get("chiave") or "").strip()
        if not nuova:
            return self._json(400, {"errore": "chiave vuota"})
        if len(nuova) > 200 or "\n" in nuova or "\r" in nuova:
            return self._json(400, {"errore": "chiave non valida"})
        try:
            CHIAVE_FILE.write_text(nuova + "\n", encoding="utf-8")
            os.chmod(CHIAVE_FILE, 0o600)
        except Exception as e:
            return self._json(500, {"errore": "non riesco a scrivere il file: %s" % e})
        return self._json(200, {"salvata": True})

    def _leggi_corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    # -------------------------------------------------------- salvataggio --
    def _salva(self):
        try:
            richiesta = self._leggi_corpo()
        except Exception as e:
            return self._json(400, {"errore": "richiesta non valida: %s" % e})

        percorso = percorso_sicuro(richiesta.get("cartella"), richiesta.get("nomeFile"))
        if percorso is None:
            return self._json(400, {"errore": "nome file o cartella non validi"})

        try:
            dati = base64.b64decode(richiesta.get("contenutoBase64") or "")
        except Exception as e:
            return self._json(400, {"errore": "contenuto non valido: %s" % e})
        if not dati:
            return self._json(400, {"errore": "file vuoto"})

        sostituito = percorso.exists()
        try:
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_bytes(dati)
        except Exception as e:
            return self._json(500, {"errore": "non riesco a scrivere il file: %s" % e})

        return self._json(200, {
            "ok": True, "sostituito": sostituito, "byte": len(dati),
            "percorso": str(percorso.relative_to(RADICE)),
        })

    # --------------------------------------------------- catalogo di raw/ --
    def _salva_raw(self):
        try:
            richiesta = self._leggi_corpo()
        except Exception as e:
            return self._json(400, {"errore": "richiesta non valida: %s" % e})

        percorso = percorso_sicuro_raw(richiesta.get("nomeFile"))
        if percorso is None:
            return self._json(400, {"errore": "nome file non valido: qui si scrivono solo i due file di catalogo"})

        try:
            dati = base64.b64decode(richiesta.get("contenutoBase64") or "")
        except Exception as e:
            return self._json(400, {"errore": "contenuto non valido: %s" % e})
        if not dati:
            return self._json(400, {"errore": "file vuoto"})

        sostituito = percorso.exists()
        try:
            percorso.write_bytes(dati)
        except Exception as e:
            return self._json(500, {"errore": "non riesco a scrivere il file: %s" % e})

        return self._json(200, {
            "ok": True, "sostituito": sostituito, "byte": len(dati),
            "percorso": str(percorso.relative_to(RADICE)),
        })

    # ------------------------------------------------------------- Finder --
    def _apri(self):
        try:
            richiesta = self._leggi_corpo()
        except Exception as e:
            return self._json(400, {"errore": "richiesta non valida: %s" % e})

        percorso = dentro_archivio(richiesta.get("percorso"))
        if percorso is None:
            return self._json(400, {"errore": "percorso non valido o fuori da archivio/"})
        if not percorso.exists():
            return self._json(404, {"errore": "il file non c'è più: forse è stato spostato o cancellato"})

        sistema = platform.system()
        try:
            if sistema == "Darwin":
                subprocess.run(["open", "-R", str(percorso)], check=True, timeout=8)
            elif sistema == "Windows":
                # explorer.exe ritorna sempre un codice diverso da 0 anche se
                # funziona: niente check=True, altrimenti sembrerebbe un errore
                subprocess.run(["explorer", "/select,%s" % percorso], timeout=8)
            else:
                subprocess.run(["xdg-open", str(percorso.parent)], check=True, timeout=8)
        except Exception as e:
            return self._json(500, {"errore": "non riesco ad aprire il Finder: %s" % e})

        return self._json(200, {"ok": True})

    # ------------------------------------------------------------- Nemotron
    def _llm(self):
        k = chiave()
        if not k:
            return self._json(503, {"errore":
                "Nessuna chiave NVIDIA configurata. Metti la chiave nel file "
                "chiave-nvidia.txt nella cartella del progetto, poi riavvia avvia.command."})

        try:
            richiesta = self._leggi_corpo()
        except Exception as e:
            return self._json(400, {"errore": "richiesta non valida: %s" % e})

        corpo = {
            "model": richiesta.get("model") or MODELLO_DEFAULT,
            "messages": richiesta.get("messages") or [],
            "temperature": richiesta.get("temperature", 0.2),
            "max_tokens": richiesta.get("max_tokens", 4000),
            "stream": bool(richiesta.get("stream")),
            # i Nemotron 3 ragionano ad alta voce se non glielo si toglie:
            # per questa app serve la risposta, non il ragionamento
            "chat_template_kwargs": {"thinking": bool(richiesta.get("thinking", False))},
        }

        req = urllib.request.Request(
            ENDPOINT, data=json.dumps(corpo).encode("utf-8"),
            headers={"Authorization": "Bearer " + k,
                     "Content-Type": "application/json",
                     "Accept": "text/event-stream" if corpo["stream"] else "application/json"})
        try:
            risposta = urllib.request.urlopen(req, timeout=300)
        except urllib.error.HTTPError as e:
            dettaglio = e.read().decode("utf-8", "replace")[:600]
            return self._json(e.code, {"errore": "NVIDIA ha risposto %s" % e.code,
                                       "dettaglio": dettaglio})
        except Exception as e:
            return self._json(502, {"errore": "Non riesco a contattare NVIDIA: %s" % e})

        if corpo["stream"]:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                for riga in risposta:
                    self.wfile.write(riga)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        dati = risposta.read()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)

    # ------------------------------------------------------------- utilità
    def _json(self, codice, oggetto):
        dati = json.dumps(oggetto, ensure_ascii=False).encode("utf-8")
        self.send_response(codice)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    ARCHIVIO.mkdir(exist_ok=True)
    with Server(("127.0.0.1", porta), Gestore) as s:
        stato = "collegata" if chiave() else "NON configurata (vedi chiave-nvidia.txt)"
        print("  Assistente NVIDIA: %s" % stato)
        print("  Modello: %s\n" % MODELLO_DEFAULT)
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            print("\n  Chiuso.\n")
