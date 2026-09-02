## 📦 Welche Datei brauche ich?

| Dein System | Datei |
|---|---|
| Mac mit Apple Silicon (M1–M4) | `KEPTA-<version>-arm64.dmg` |
| Mac mit Intel-Prozessor | `KEPTA-<version>-x64.dmg` |
| Linux (Intel/AMD), jede Distribution | `KEPTA-<version>-x64.AppImage` |
| Linux (ARM), jede Distribution | `KEPTA-<version>-arm64.AppImage` |
| Debian, Ubuntu, Mint | `KEPTA-<version>-x64.deb` bzw. `-arm64.deb` |

Jede Datei trägt ihre Architektur im Namen. Im Zweifel bei einem Mac: Apple-Menü → *Über diesen Mac*; steht dort „Apple M…", nimm `arm64`, bei „Intel" nimm `x64`. Die Pakete bringen alles mit — Node brauchst du nur zum Selbstbauen.

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

## 🐧 Erster Start unter Linux

**AppImage** — ausführbar machen und starten, keine Installation nötig:

```bash
chmod +x KEPTA-*-x64.AppImage
./KEPTA-*-x64.AppImage
```

**deb** — für Debian, Ubuntu und Abkömmlinge:

```bash
sudo apt install ./KEPTA-*-x64.deb
```

## 🔌 Agent anbinden (MCP)

Nach dem ersten Start steht der MCP-Server bereit. Konfiguration für Claude Desktop, Cursor & Co.:

```json
{ "mcpServers": { "kepta": { "command": "node", "args": ["/PFAD/kepta/dist/mcp-server.cjs"] } } }
```

Alle Daten bleiben lokal in `~/.kepta/` — kein Konto, keine Cloud, keine Telemetrie.
Selbst bauen: `npm install && npm run build:mac` bzw. `npm run build:linux`.

---
