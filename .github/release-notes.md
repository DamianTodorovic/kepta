## 📦 Which file do I need?

| Your system | File |
|---|---|
| Mac with Apple Silicon (M1–M4) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `KEPTA-<version>-mac-x64.dmg` |
| **Windows — take this one if unsure** | `KEPTA-<version>-win.exe` (contains both architectures) |
| Windows (Intel/AMD), smaller file | `KEPTA-<version>-win-x64.exe` |
| Windows on ARM, smaller file | `KEPTA-<version>-win-arm64.exe` |
| Linux (Intel/AMD), any distribution | `KEPTA-<version>-linux-x86_64.AppImage` |
| Linux on ARM | `KEPTA-<version>-linux-arm64.AppImage` |
| Debian, Ubuntu, Mint | `KEPTA-<version>-linux-amd64.deb` |

Every file carries its platform and architecture in the name. On a Mac, if you are unsure: Apple menu → *About This Mac* — "Apple M…" means `arm64`, "Intel" means `x64`. The `.zip` files are the same programs without an installer.

The packages are self-contained — you only need Node to build them yourself.

## 🍎 First launch on macOS

These builds are **not notarised** (that needs an Apple developer certificate at
99 EUR a year). macOS quarantines the download and says the developer cannot be
verified. The app is fine.

The fastest way through, and the one that works on every macOS version:

```bash
xattr -dr com.apple.quarantine /Applications/KEPTA.app
```

Without the terminal: **System Settings → Privacy & Security** → scroll to the
KEPTA message → **Open Anyway**. Once, then never again.

Note: right-clicking the app and choosing *Open* no longer works — Apple removed
that route in macOS 15.

## 🪟 First launch on Windows

The Windows installer is **unsigned** too. SmartScreen shows "Windows protected your PC"
on first launch.

Approve it once: click **More info** → **Run anyway**.

## 🐧 First launch on Linux

**AppImage** — make it executable and run it, no installation needed:

```bash
chmod +x KEPTA-*-linux-x86_64.AppImage
./KEPTA-*-linux-x86_64.AppImage
```

**deb** — for Debian, Ubuntu and derivatives:

```bash
sudo apt install ./KEPTA-*-linux-amd64.deb
```

## 🔌 Connect an agent (MCP)

The MCP server is ready after the first launch. Configuration for Claude Desktop, Cursor and friends:

```json
{ "mcpServers": { "kepta": { "command": "node", "args": ["/PATH/kepta/dist/mcp-server.cjs"] } } }
```

## 🐍 Python

```bash
pip install kepta
```

All data stays local in `~/.kepta/` — no account, no cloud, no telemetry.
Build it yourself: `npm install && npm run build:mac`, `build:linux` or `build:win`.

---

<details>
<summary>🇩🇪 Deutsch — welche Datei brauche ich?</summary>

| Dein System | Datei |
|---|---|
| Mac mit Apple Silicon (M1–M4) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `KEPTA-<version>-mac-x64.dmg` |
| **Windows — im Zweifel dieses** | `KEPTA-<version>-win.exe` (enthält beide Architekturen) |
| Linux (Intel/AMD) | `KEPTA-<version>-linux-x86_64.AppImage` |
| Debian, Ubuntu, Mint | `KEPTA-<version>-linux-amd64.deb` |

Die Builds sind **nicht notarisiert**. macOS: `xattr -dr com.apple.quarantine /Applications/KEPTA.app`, oder *Systemeinstellungen → Datenschutz & Sicherheit* → **Dennoch öffnen**. Der Rechtsklick-Weg funktioniert seit macOS 15 nicht mehr. Windows: **Weitere Informationen** → **Trotzdem ausführen**. Linux-AppImage: `chmod +x` und starten.

Alle Daten bleiben lokal in `~/.kepta/`. Ausführliche Anleitung: [README.de.md](https://github.com/DamianTodorovic/kepta/blob/main/README.de.md)

</details>
