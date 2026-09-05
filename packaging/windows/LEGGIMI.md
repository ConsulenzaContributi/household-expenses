# Build dell'installer Windows

Normalmente non serve toccare niente qui: il workflow **Build Windows installer**
(`.github/workflows/build-windows.yml`) costruisce tutto da solo su un runner Windows
di GitHub Actions — non serve possedere un PC Windows.

## Come ottenere l'installer già pronto

- **Automatico**: spingi un tag `vX.Y.Z` (es. `git tag v1.1.0 && git push origin v1.1.0`).
  Il workflow parte da solo, e a fine build trovi `SpeseDiCasa-Setup-X.Y.Z.exe` allegato
  alla Release GitHub corrispondente.
- **Manuale**: scheda **Actions** del repository → **Build Windows installer** → **Run workflow**.
  L'installer finisce negli "Artifacts" di quella run (nessuna Release creata in questo caso).

## Come costruirlo a mano su un vero PC Windows

Se preferisci non passare da GitHub Actions:

```powershell
pip install pyinstaller
pyinstaller --onefile --console --name SpeseDiCasa server.py

mkdir packaging\windows\stage
copy dist\SpeseDiCasa.exe packaging\windows\stage\
copy index.html packaging\windows\stage\
xcopy /E /I css packaging\windows\stage\css
xcopy /E /I js packaging\windows\stage\js
copy LEGGIMI.md packaging\windows\stage\
mkdir packaging\windows\stage\raw
copy raw\LEGGIMI.txt packaging\windows\stage\raw\
mkdir packaging\windows\stage\archivio
copy archivio\LEGGIMI.txt packaging\windows\stage\archivio\

REM richiede Inno Setup 6: https://jrsoftware.org/isdl.php
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DMyAppVersion=1.1.0 packaging\windows\installer.iss
```

L'installer compilato finisce in `packaging\windows\output\`.

## Perché un eseguibile e non "installa Python + esegui server.py"

Chiedere a chi scarica l'app di installare prima Python (con l'opzione PATH giusta, la
versione giusta...) è un ostacolo enorme per chi non è tecnico. PyInstaller impacchetta
Python e `server.py` in un solo `.exe` che gira così com'è: **non ammicca alla necessità
di installare nulla a parte l'app stessa**. Chi ha già Python e preferisce non installare
nulla può comunque clonare il repository e lanciare `avvia.bat`, che usa il Python di sistema.

## Perché niente firma digitale (code signing)

L'installer non è firmato: Windows SmartScreen mostrerà un avviso "editore sconosciuto"
al primo avvio (clic su "Ulteriori informazioni" → "Esegui comunque"). Firmare un
eseguibile richiede un certificato di code-signing a pagamento legato a un'identità
verificata — fuori scopo per un repository pubblico senza licenza commerciale. Non è un
errore di build.
