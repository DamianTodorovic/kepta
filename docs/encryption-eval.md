# Verschlüsselung-Eval (F5) — SQLCipher-Steckplatz ehrlich bewertet

Stand: 5. September 2026 · Beweise: `tests/encryption-eval.test.ts` · Messung: `npm run eval:crypto`

## Fragestellung

Kann KEPTA seine Memory-DB heute verschlüsselt at rest ablegen (SQLCipher), und wenn
nicht: was ist der ehrliche Weg? §203-Nutzer (Praxen/Kanzleien) brauchen eine
belastbare Antwort, kein Alibi-Pragma.

## Befunde

| # | Befund | Beleg |
|---|--------|-------|
| 1 | Die `node:sqlite`-DB liegt **unverschlüsselt** auf der Platte — Memory-Titel/-Inhalte sind als Klartext in der DB- bzw. WAL-Datei nachweisbar. | Test „Befund 1" |
| 2 | `PRAGMA key = '…'` läuft auf Vanilla-SQLite **stillschweigend durch, ohne zu verschlüsseln**. Wer SQLCipher-Syntax gegen node:sqlite läuft, bekommt ein Sicherheitsgefühl ohne Substanz. | Test „Befund 2" |
| 3 | Die **KeyProvider-Naht** (`keyFor(dbPath)` beim Öffnen, fire-and-forget) existiert und kostet praktisch nichts — sie ist der Bauplatz für echte Verschlüsselung, heute unbeschaltet. | Test „Befund 3", `npm run eval:crypto` (Öffnen mit/ohne Naht: Differenz im Rauschen) |

## Optionen

1. **SQLCipher via node:sqlite** — *nicht machbar ohne Build-Wechsel.* node:sqlite
   linkt Vanilla-SQLite ohne Crypto-Extension; SQLCipher braucht einen eigenen
   SQLite-Build (better-sqlite3-Prebuilds mit SQLCipher oder eigener Electron-Build).
   Kosten: native Abhängigkeit im 3-Kanäle-Desktop-Build + npm-Paket + Wartung.
2. **App-Level Feldverschlüsselung** (title/content AES-256-GCM mit KeyProvider-Key) —
   *machbar, aber mit echtem Trade-off:* FTS5 und Embeddings können über Ciphertext
   keine Suche mehr bedienen. Suchbare Verschlüsselung braucht deterministische
   Verschlüsselung + verschlüsselten Index — eine eigene Welle mit Design-Arbeit.
3. **OS-Ebene (FileVault/LUKS/BitLocker)** — *heute der reale Standard:* Platte
   verschlüsselt, KEPTA unverändert, Suche bleibt voll funktionsfähig.
4. **Transport (erledigt):** das Praxis-Sync-Bundle (F4) verschlüsselt E2E
   (AES-256-GCM, scrypt-Passphrase) — Daten verlassen den Rechner nie lesbar.

## Empfehlung

- **Jetzt:** §203-Installationsanleitung verlangt OS-Verschlüsselung (FileVault/LUKS);
  F4 deckt den Transport ab; Befund 2 im Migrations-Guide erwähnen, damit niemand
  `PRAGMA key` für Sicherheit hält.
- **Nicht tun:** SQLCipher-Syntax simulieren oder ein Pragma als Versprechen verkaufen.
- **Welle 2:** Feldverschlüsselung über den KeyProvider-Steckplatz sauber designen
  (Trade-off Suche vs. Ciphertext offen benennen) — die Naht ist fertig und gratis.
