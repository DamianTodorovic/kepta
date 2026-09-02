## 📦 Welche Datei brauche ich?

| Dein System | Datei |
|---|---|
| Mac mit Apple Silicon (M1–M4) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `KEPTA-<version>-mac-x64.dmg` |
| Windows (Intel/AMD) | `KEPTA-<version>-win-x64.exe` |
| Windows auf ARM | `KEPTA-<version>-win-arm64.exe` |
| Linux (Intel/AMD), jede Distribution | `KEPTA-<version>-linux-x86_64.AppImage` |
| Linux auf ARM | `KEPTA-<version>-linux-arm64.AppImage` |
| Debian, Ubuntu, Mint | `KEPTA-<version>-linux-amd64.deb` |

Jede Datei trägt Plattform und Architektur im Namen. Im Zweifel beim Mac: Apple-Menü → *Über diesen Mac* — „Apple M…" heißt `arm64`, „Intel" heißt `x64`. Die `.zip`-Dateien sind dieselben Programme ohne Installer, für alle, die lieber selbst entpacken.

Die Pakete bringen alles mit — Node brauchst du nur zum Selbstbauen.

## 🍎 Erster Start unter macOS

Diese Builds sind **nicht signiert und nicht notarisiert** (kein Apple-Entwicklerzertifikat).
macOS setzt heruntergeladene Dateien in Quarantäne und meldet beim Doppelklick
„kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann".
Die App ist in Ordnung — es fehlt nur die Signatur.

Einmalig freigeben, danach startet sie normal:

1. **Rechtsklick** auf `KEPTA.app` → **Öffnen** → im Dialog erneut **Öffnen**
2. Alternativ: *Systemeinstellungen → Datenschutz & Sicherheit* → **Dennoch öffnen**

Oder im Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/KEPTA.app
```

## 🪟 Erster Start unter Windows

Auch der Windows-Installer ist **nicht signiert**. SmartScreen zeigt beim ersten Start
„Der Computer wurde durch Windows geschützt".

Einmalig freigeben: **Weitere Informationen** anklicken → **Trotzdem ausführen**.

## 🐧 Erster Start unter Linux

**AppImage** — ausführbar machen und starten, keine Installation nötig:

```bash
chmod +x KEPTA-*-linux-x86_64.AppImage
./KEPTA-*-linux-x86_64.AppImage
```

**deb** — für Debian, Ubuntu und Abkömmlinge:

```bash
sudo apt install ./KEPTA-*-linux-amd64.deb
```

## 🔌 Agent anbinden (MCP)

Nach dem ersten Start steht der MCP-Server bereit. Konfiguration für Claude Desktop, Cursor & Co.:

```json
{ "mcpServers": { "kepta": { "command": "node", "args": ["/PFAD/kepta/dist/mcp-server.cjs"] } } }
```

Alle Daten bleiben lokal in `~/.kepta/` — kein Konto, keine Cloud, keine Telemetrie.
Selbst bauen: `npm install && npm run build:mac`, `build:linux` oder `build:win`.

---
