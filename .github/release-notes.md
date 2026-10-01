## 📦 Which file do I need?

| Your system | File |
|---|---|
| Mac with Apple silicon (M1 and later) | `KEPTA-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `KEPTA-<version>-mac-x64.dmg` |
| Windows (Intel/AMD) | `KEPTA-<version>-win-x64.exe` |
| Windows on ARM | `KEPTA-<version>-win-arm64.exe` |

Every file carries its platform and architecture in the name. On a Mac, if you are unsure: Apple menu → *About This Mac* — "Apple M…" means `arm64`, "Intel" means `x64`.

KEPTA needs a license key — KEPTA Pro, Business or Enterprise. There is no trial.

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
| Windows (Intel/AMD) | `KEPTA-<version>-win-x64.exe` |
| Windows auf ARM | `KEPTA-<version>-win-arm64.exe` |

KEPTA braucht einen Lizenzschlüssel — KEPTA Pro, Business oder Enterprise. Eine Testphase gibt es nicht.

Die Builds sind **nicht notarisiert**. macOS: `xattr -dr com.apple.quarantine /Applications/KEPTA.app`, oder *Systemeinstellungen → Datenschutz & Sicherheit* → **Dennoch öffnen**. Der Rechtsklick-Weg funktioniert seit macOS 15 nicht mehr. Windows: **Weitere Informationen** → **Trotzdem ausführen**.

**Update von einer Version vor 2.11:** die Wissensbasis wird verschlüsselt. Vor dem ersten Start alle Agenten schließen, die KEPTA über MCP nutzen (Claude Desktop, Cursor …), danach wieder starten. Eine Kopie des Schlüssels aufbewahren: [SECURITY.md](https://github.com/DamianTodorovic/kepta/blob/main/SECURITY.md#encryption-at-rest).

Alle Daten bleiben lokal in `~/.kepta/`.

</details>
