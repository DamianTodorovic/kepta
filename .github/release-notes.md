## 📦 Which file do I need?

| Your system | File |
|---|---|
| Mac with Apple silicon (M1 and later) | `K3PTA-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `K3PTA-<version>-mac-x64.dmg` |

Published installers are **macOS only**, and every release that ships files ships both architectures (`docs/belege/aussendung-0611/github-releases-0611.json`). Windows and Linux targets exist in `electron-builder.json` and in CI (`release-windows`, `release-linux`), but no Windows or Linux installer is published — if you need one for a pilot, ask and we cut it. The headless engine with the MCP server runs wherever Node runs: `npx -y kepta-mcp`.

Every installer carries its platform and architecture in the name — `mac-arm64` or `mac-x64`; `latest-mac.yml` and `SHA256SUMS.txt` are the two files beside it that carry no architecture (`docs/belege/aussendung-0611/github-releases-0611.json`). On a Mac, if you are unsure: Apple menu → *About This Mac* — "Apple M…" means `arm64`, "Intel" means `x64`.

**No license key is needed to run K3PTA** — the licence route answers neither read nor write, and no surface calls it (`tests/keine-grenzen.test.ts:102`, `tests/keine-grenzen.test.ts:116`). The download is K3PTA Core and it is free, and nothing in it is metered by a key: no day count, no cap on the endpoints that depends on a licence, no counter in the window (`tests/keine-grenzen.test.ts:107` writes no tally into the settings, `tests/keine-grenzen.test.ts:72` and `tests/keine-grenzen.test.ts:85` walk twelve chat messages and twenty-one profile saves through without a stop). What is left is local protection, and it sits far above normal work on your own machine — chat 20/min, clipper 12/min, searches 240/min, writes 600/min, read off `server/helfer/limiter.ts:63-68`; `tests/keine-grenzen.test.ts:140` requires the limiter to name its number in the response headers, and `:72`/`:85` walk twelve chat messages and twenty-one profile saves through the door in one minute without a stop. What the app metered until 3.1.4 is taken out, not raised — the routes, the tally and the key field are gone, so there is nothing left to lift. A signed key is an artefact of a K3PTA Enterprise agreement, never something sold off a shelf — nothing in this app reads, sells or validates one: the licence route answers neither read nor write and no surface calls it (`tests/keine-grenzen.test.ts:102`, `:116`).

## 🍎 First launch on macOS

These builds are **not notarised** (that needs an Apple developer certificate at
99 EUR a year). macOS quarantines the download and says the developer cannot be
verified. The app is fine.

The fastest way through, and the one that works on every macOS version (`docs/belege/aussendung-0611/beweisen-3-2-190-0611.txt` and `docs/aussendung-und-ablage.md:190`):

```bash
xattr -dr com.apple.quarantine /Applications/K3PTA.app
```

Without the terminal: **System Settings → Privacy & Security** → scroll to the
K3PTA message → **Open Anyway**. Once, then never again.

Note: right-clicking the app and choosing *Open* no longer works — Apple removed
that route in macOS 15 (`docs/belege/aussendung-0611/beweisen-3-2-190-0611.txt` and `docs/aussendung-und-ablage.md:190`).

## 🪟 Windows and Linux

Nothing to install yet: no Windows or Linux installer is published (`docs/belege/aussendung-0611/github-releases-0611.json`). If one is cut for a pilot (`npm run build:win` or `build:linux`), expect this: the installer is unsigned, so SmartScreen says "Windows protected your PC" on first launch. Approve it once: **More info** → **Run anyway**.

## 🔒 Updating from a version before 2.11 — encryption

From 2.11 the knowledge base is encrypted on disk, with a key the app creates
and keeps in your system keychain. Before the first start of the new version,
**quit every agent that uses K3PTA over MCP** (Claude Desktop, Cursor, …), so
the app has the file to itself and can convert it — then start them again (`tests/core/store-verschluesselung.test.ts:180`).
*Settings → System status* shows whether the file is encrypted. Keep a copy of
the key: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

## 🔌 Connect an agent (MCP)

K3PTA ships its own MCP server — no Node.js, no npm (`tests/lib/einrichtung.test.ts:42`). *Settings → MCP / API* connects Claude Desktop, Claude Code, Cursor, Windsurf and VS Code in one click, or shows the block to copy. For K3PTA in *Applications* on a Mac it is:

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

All data stays local in `~/.kepta/` — no account, no cloud, no telemetry (`tests/keine-telemetrie.test.ts:73` and `tests/core/store-verschluesselung.test.ts:76`).

---

<details>
<summary>🇩🇪 Deutsch — welche Datei brauche ich?</summary>

| Dein System | Datei |
|---|---|
| Mac mit Apple Silicon (M1 und neuer) | `K3PTA-<version>-mac-arm64.dmg` |
| Mac mit Intel-Prozessor | `K3PTA-<version>-mac-x64.dmg` |

Veröffentlichte Installer sind **nur macOS**, und jeder Stand mit Dateien trägt beide Architekturen (`docs/belege/aussendung-0611/github-releases-0611.json`). Windows- und Linux-Ziele gibt es in `electron-builder.json` und in CI (`release-windows`, `release-linux`), aber kein öffentlicher Installer dafür — für einen Piloten schneiden wir auf Anfrage einen. Die headless Engine mit MCP-Server läuft da, wo Node läuft: `npx -y kepta-mcp`.

**K3PTA braucht keinen Schlüssel zum Laufen** — die Lizenz-Route antwortet weder lesend noch schreibend, und keine Fläche ruft sie (`tests/keine-grenzen.test.ts:102`, `tests/keine-grenzen.test.ts:116`). Der Download ist K3PTA Core und gratis, und nichts darin ist begrenzt durch eine Lizenz: kein Tageszähler, keine Kappe an den Endpunkten, die von einem Schlüssel abhängt, kein Zähler in der Fläche (`tests/keine-grenzen.test.ts:107` schreibt keinen Zähler in die Einstellungen, `tests/keine-grenzen.test.ts:72` und `tests/keine-grenzen.test.ts:85` schicken zwölf Chat-Nachrichten und einundzwanzig Profil-Speicherungen ohne Halt durch). Was bleibt, ist lokaler Schutz, und er sitzt weit über normaler Arbeit am eignen Rechner — Chat 20/min, Clipper 12/min, Suche 240/min, Schreiben 600/min, abgelesen an `server/helfer/limiter.ts:63-68`; `tests/keine-grenzen.test.ts:140` verlangt, dass der Begrenzer seine Zahl im Antwortkopf nennt, und `:72`/`:85` schicken zwölf Chat-Nachrichten und einundzwanzig Profil-Speicherungen in einer Minute durch die Tür, ohne Halt. Was die App bis 3.1.4 gemessen hat, ist ausgebaut, nicht heraufgesetzt — Routen, Zähler und Schlüsselfeld sind weg, es gibt nichts mehr, das man aufheben könnte. Ein signierter Schlüssel ist Artefakt einer Enterprise-Vereinbarung, nie ein Kaufprodukt von der Liste — nichts in dieser App liest, verkauft oder prüft einen: die Lizenz-Route antwortet weder lesend noch schreibend, und keine Fläche ruft sie (`tests/keine-grenzen.test.ts:102`, `:116`).

Die Builds sind **nicht notarisiert**. macOS: `xattr -dr com.apple.quarantine /Applications/K3PTA.app`, oder *Systemeinstellungen → Datenschutz & Sicherheit* → die K3PTA-Meldung → **Dennoch öffnen**. Einmal, dann nie wieder. Ältere Anleitungen empfehlen Rechtsklick → **Öffnen** — Apple hat den Weg mit macOS 15 entfernt, er tut auf aktuellen Systemen nichts.

**Update von einer Version vor 2.11:** die Wissensbasis wird verschlüsselt. Vor dem ersten Start alle Agenten schließen, die K3PTA über MCP nutzen (Claude Desktop, Cursor …), danach wieder starten (`tests/core/store-verschluesselung.test.ts:180`). Eine Kopie des Schlüssels aufbewahren: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

Alle Daten bleiben lokal in `~/.kepta/` (`tests/core/store-verschluesselung.test.ts:76` und `tests/testkapsel.test.ts:107`).

</details>
