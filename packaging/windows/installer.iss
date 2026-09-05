; Script Inno Setup per l'installer Windows di "Spese di casa".
;
; Non compila da solo: si aspetta che una cartella "stage\" (accanto a questo
; file) contenga già tutto il necessario — SpeseDiCasa.exe (costruito con
; PyInstaller da server.py) più index.html, css\, js\, raw\LEGGIMI.txt,
; archivio\LEGGIMI.txt — cioè lo stesso contenuto di un clone del repository,
; con server.py sostituito dall'eseguibile. Il workflow GitHub Actions
; (.github/workflows/build-windows.yml) prepara "stage\" da solo prima di
; lanciare ISCC su questo file; per una build manuale, prepara "stage\" a
; mano allo stesso modo prima di compilare.
;
; Versione passata da riga di comando: iscc /DMyAppVersion=1.1.0 installer.iss

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "Spese di casa"
#define MyAppExe "SpeseDiCasa.exe"

[Setup]
AppId={{B6F7D6C1-6E43-4B0B-9B7E-5D6D3B7F6A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppName}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=SpeseDiCasa-Setup-{#MyAppVersion}
OutputDir=output
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
; niente firma digitale: repo pubblico senza licenza, nessun certificato di
; code-signing associato. Windows/SmartScreen mostrerà l'avviso "editore
; sconosciuto" finché non se ne aggiunge uno — non è un errore di build.
WizardStyle=modern
SetupIconFile=
UninstallDisplayIcon={app}\{#MyAppExe}

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
; raw/ e archivio/ devono esistere e restare scrivibili fin da subito, pronte
; per i primi estratti conto e per i primi report — l'utente non deve doverle
; creare a mano come su Mac/Linux dopo un git clone.

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\Disinstalla {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crea un'icona sul desktop"; GroupDescription: "Icone aggiuntive:"

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Avvia {#MyAppName} ora"; Flags: postinstall nowait skipifsilent unchecked
