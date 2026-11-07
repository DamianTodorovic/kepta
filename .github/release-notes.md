## 📦 Which file do I need?

| Your system | File |
|---|---|
| Mac with Apple silicon (M1 and later) | `K3PTA-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `K3PTA-<version>-mac-x64.dmg` |

Published installers are **macOS only**. Windows and Linux targets exist in `electron-builder.json` and in CI (`release-windows`, `release-linux`), but no Windows or Linux installer is published — if you need one for a pilot, ask and we cut it. The headless engine with the MCP server runs wherever Node runs: `npx -y kepta-mcp`.

Every file carries its platform and architecture in the name. On a Mac, if you are unsure: Apple menu → *About This Mac* — "Apple M…" means `arm64`, "Intel" means `x64`.

**No license key is needed to run K3PTA.** The download is K3PTA Core and it is free, and nothing in it is metered: no day count, no cap on the endpoints, no counter in the window. What the app metered until 3.1.4 is taken out, not raised — the routes, the tally and the key field are gone, so there is nothing left to lift. A signed key is an artefact of a K3PTA Enterprise agreement, never something sold off a shelf — nothing in this app reads, sells or validates one: the licence route answers neither read nor write and no surface calls it (`tests/keine-grenzen.test.ts:102`, `:116`).

## 🍎 First launch on macOS

These builds are **not notarised** (that needs an Apple developer certificate at
99 EUR a year). macOS quarantines the download and says the developer cannot be
verified. The app is fine.

The fastest way through, and the one that works on every macOS version:

```bash
xattr -dr com.apple.quarantine /Applications/K3PTA.app
```

Without the terminal: **System Settings → Privacy & Security** → scroll to the
K3PTA message → **Open Anyway**. Once, then never again.

Note: right-clicking the app and choosing *Open* no longer works — Apple removed
that route in macOS 15.

## 🪟 Windows and Linux

Nothing to install yet: no Windows or Linux installer is published. If one is cut for a pilot (`npm run build:win` or `build:linux`), expect this: the installer is unsigned, so SmartScreen says "Windows protected your PC" on first launch. Approve it once: **More info** → **Run anyway**.

## 🔒 Updating from a version before 2.11 — encryption

From 2.11 the knowledge base is encrypted on disk, with a key the app creates
and keeps in your system keychain. Before the first start of the new version,
**quit every agent that uses K3PTA over MCP** (Claude Desktop, Cursor, …), so
the app has the file to itself and can convert it — then start them again.
*Settings → System status* shows whether the file is encrypted. Keep a copy of
the key: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

## 🔌 Connect an agent (MCP)

K3PTA ships its own MCP server — no Node.js, no npm. *Settings → MCP / API* connects Claude Desktop, Claude Code, Cursor, Windsurf and VS Code in one click, or shows the block to copy. For K3PTA in *Applications* on a Mac it is:

```json
{
  "mcpServers": {
    "kepta": {
      "command": "/Applications/K3PTA.app/Contents/MacOS/K3PTA",
      "args": ["/Applications/K3PTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"],
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
| Mac mit Apple Silicon (M1 und neuer) | `K3PTA-<version>-mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `K3PTA-<version>-mac-x64.dmg` |

Veröffentlichte Installer sind **nur macOS**. Windows- und Linux-Ziele gibt es in `electron-builder.json` und in CI (`release-windows`, `release-linux`), aber kein öffentlicher Installer dafür — für einen Piloten schneiden wir auf Anfrage einen. Die headless Engine mit MCP-Server läuft da, wo Node läuft: `npx -y kepta-mcp`.

**K3PTA braucht keinen Schlüssel zum Laufen.** Der Download ist K3PTA Core und gratis, und nichts darin ist begrenzt: kein Tageszähler, keine Kappe an den Endpunkten, kein Zähler in der Fläche. Was die App bis 3.1.4 gemessen hat, ist ausgebaut, nicht heraufgesetzt — Routen, Zähler und Schlüsselfeld sind weg, es gibt nichts mehr, das man aufheben könnte. Ein signierter Schlüssel ist Artefakt einer Enterprise-Vereinbarung, nie ein Kaufprodukt von der Liste — nichts in dieser App liest, verkauft oder prüft einen: die Lizenz-Route antwortet weder lesend noch schreibend, und keine Fläche ruft sie (`tests/keine-grenzen.test.ts:102`, `:116`).

Die Builds sind **nicht notarisiert**. macOS: `xattr -dr com.apple.quarantine /Applications/K3PTA.app`, oder *Systemeinstellungen → Datenschutz & Sicherheit* → die K3PTA-Meldung → **Dennoch öffnen**. Einmal, dann nie wieder. Ältere Anleitungen empfehlen Rechtsklick → **Öffnen** — Apple hat den Weg mit macOS 15 entfernt, er tut auf aktuellen Systemen nichts.

**Update von einer Version vor 2.11:** die Wissensbasis wird verschlüsselt. Vor dem ersten Start alle Agenten schließen, die K3PTA über MCP nutzen (Claude Desktop, Cursor …), danach wieder starten. Eine Kopie des Schlüssels aufbewahren: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

Alle Daten bleiben lokal in `~/.kepta/`.

</details>
