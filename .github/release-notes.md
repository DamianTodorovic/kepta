## 📦 Which file do I need?

| Your system | File |
|---|---|
| Mac with Apple silicon (M1 and later) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `KEPTA-<version>-mac-x64.dmg` |

Published installers are **macOS only**. Windows and Linux targets exist in `electron-builder.json` and in CI (`release-windows`, `release-linux`), but no Windows or Linux installer is published — if you need one for a pilot, ask and we cut it. The headless engine with the MCP server runs wherever Node runs: `npx -y kepta-mcp`.

Every file carries its platform and architecture in the name. On a Mac, if you are unsure: Apple menu → *About This Mac* — "Apple M…" means `arm64`, "Intel" means `x64`.

**No license key is needed to run KEPTA.** The download is KEPTA Core and it is free: the first day after the first launch is an **unlimited day**, then it keeps working for free with daily limits on the endpoints that matter. The app never locks — a reached limit answers with a hint, not a wall, and writing or searching is never limited. A signed key only removes the daily limits; it is an artefact of a KEPTA Enterprise agreement, not something sold off a shelf.

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

## 🪟 Windows and Linux

Nothing to install yet: no Windows or Linux installer is published. If one is cut for a pilot (`npm run build:win` or `build:linux`), expect this: the installer is unsigned, so SmartScreen says "Windows protected your PC" on first launch. Approve it once: **More info** → **Run anyway**.

## 🔒 Updating from a version before 2.11 — encryption

From 2.11 the knowledge base is encrypted on disk, with a key the app creates
and keeps in your system keychain. Before the first start of the new version,
**quit every agent that uses KEPTA over MCP** (Claude Desktop, Cursor, …), so
the app has the file to itself and can convert it — then start them again.
*Settings → System status* shows whether the file is encrypted. Keep a copy of
the key: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

## 🔌 Connect an agent (MCP)

KEPTA ships its own MCP server — no Node.js, no npm. *Settings → MCP / API* connects Claude Desktop, Claude Code, Cursor, Windsurf and VS Code in one click, or shows the block to copy. For KEPTA in *Applications* on a Mac it is:

```json
{
  "mcpServers": {
    "kepta": {
      "command": "/Applications/KEPTA.app/Contents/MacOS/KEPTA",
      "args": ["/Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

All data stays local in `~/.kepta/` — no account, no cloud, no telemetry.

---

<details>
<summary>🇩🇪 Deutsch — welche Datei brauche ich?</summary>

| Dein System | Datei |
|---|---|
| Mac mit Apple Silicon (M1 und neuer) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `KEPTA-<version>-mac-x64.dmg` |

Veröffentlichte Installer sind **nur macOS**. Windows- und Linux-Ziele gibt es in `electron-builder.json` und in CI (`release-windows`, `release-linux`), aber kein öffentlicher Installer dafür — für einen Piloten schneiden wir auf Anfrage einen. Die headless Engine mit MCP-Server läuft da, wo Node läuft: `npx -y kepta-mcp`.

**KEPTA braucht keinen Schlüssel zum Laufen.** Der Download ist KEPTA Core und gratis: Der erste Tag nach dem Erststart ist **ein Tag ohne Grenzen**, danach geht es kostenlos weiter mit Tageslimiten an den ausschlaggebenden Endpunkten. Die App sperrt nie — eine erreichte Grenze antwortet mit einem Hinweis, nicht mit einer Wand, und Notieren wie Suchen ist nie limitiert. Ein signierter Schlüssel entfernt nur die Limiten; er ist Artefakt einer Enterprise-Vereinbarung, kein Kaufprodukt von der Liste.

Die Builds sind **nicht notarisiert**. macOS: `xattr -dr com.apple.quarantine /Applications/KEPTA.app`, oder *Systemeinstellungen → Datenschutz & Sicherheit* → die KEPTA-Meldung → **Dennoch öffnen**. Einmal, dann nie wieder. Ältere Anleitungen empfehlen Rechtsklick → **Öffnen** — Apple hat den Weg mit macOS 15 entfernt, er tut auf aktuellen Systemen nichts.

**Update von einer Version vor 2.11:** die Wissensbasis wird verschlüsselt. Vor dem ersten Start alle Agenten schließen, die KEPTA über MCP nutzen (Claude Desktop, Cursor …), danach wieder starten. Eine Kopie des Schlüssels aufbewahren: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

Alle Daten bleiben lokal in `~/.kepta/`.

</details>
