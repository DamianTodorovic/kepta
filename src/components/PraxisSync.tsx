import { absage } from '../lib/absage';
import { ApiFehler, tuerSatz } from '../lib/api';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Upload, ShieldCheck, ShieldAlert, KeyRound, AlertTriangle, Loader2, FileJson } from '../lib/icons';

// Praxis-Sync in der Oberflaeche. Der Kern konnte den verschluesselten
// Geraeteabgleich laengst, war aber an nichts angeschlossen — ohne diese Ansicht
// bleibt er ein Baustein statt einer Funktion.
//
// Die Passphrase lebt ausschliesslich im Formularzustand: kein localStorage,
// kein Profil, keine URL. Sie geht einmal an den lokalen Server und wird dort
// nur zum Ableiten des Schluessels benutzt.

const MIN_PASSPHRASE = 12;

interface JournalEintrag {
  seq: number;
  at: string;
  direction: 'export' | 'import';
  peer: string;
  scope: string;
  count: number;
  payloadHash: string;
  hash: string;
}

type Meldung = { art: 'ok' | 'fehler'; text: string } | null;

export default function PraxisSync() {
  const [passphrase, setPassphrase] = useState('');
  const [scope, setScope] = useState('local');
  const [laeuft, setLaeuft] = useState<'export' | 'import' | null>(null);
  const [meldung, setMeldung] = useState<Meldung>(null);
  const [journal, setJournal] = useState<JournalEintrag[]>([]);
  const [journalGrund, setJournalGrund] = useState<string | null>(null);
  const [intakt, setIntakt] = useState<boolean | null>(null);
  const dateiFeld = useRef<HTMLInputElement>(null);

  const journalLaden = useCallback(async () => {
    try {
      const r = await fetch('/api/sync/journal');
      // Punkt 4, 2.11.: `if (!r.ok) return;` liess `journal` bei [], und :223 behauptete
      // "Nothing recorded yet" — eine Aussage ueber seinen Bestand, aus einer Absage abgeleitet.
      if (!r.ok) { setJournalGrund(`The journal did not answer — it was asked and the store said ${r.status}.`); return; }
      const d = await r.json().catch(() => null);
      if (!d || !Array.isArray(d.entries)) { setJournalGrund('The journal could not be read — its answer had no entries.'); return; }
      setJournalGrund(null);
      setJournal(d.entries);
      setIntakt(typeof d.intact === 'boolean' ? d.intact : null);
    } catch {
      setJournalGrund('The journal did not answer — nothing is known about what went out or came in.');
    }
  }, []);

  useEffect(() => { void journalLaden(); }, [journalLaden]);

  const zuKurz = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE;
  const bereit = passphrase.length >= MIN_PASSPHRASE && laeuft === null;

  async function exportieren() {
    setLaeuft('export');
    setMeldung(null);
    try {
      const r = await fetch('/api/sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, scope }),
      });
      // P63: dieselbe Reihenfolge -- die Zahl der eignen Tuer bleibt sichtbar, wenn ihr Koerper
      // nicht als JSON ankommt.
      const d = (await r.json().catch(() => null)) as { bundle: { count: number; scope: string }; error?: unknown } | null;
      if (!r.ok) throw new ApiFehler(tuerSatz(d?.error, `HTTP ${r.status}`), r.status);
      if (!d) throw new ApiFehler('The bundle arrived without readable text.', r.status);

      const blob = new Blob([JSON.stringify(d.bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kepta-device-sync_${scope}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMeldung({ art: 'ok', text: `${d.bundle.count} notes encrypted and downloaded.` });
      void journalLaden();
    } catch (e) {
      setMeldung({ art: 'fehler', text: absage("The bundle was not downloaded. Nothing left this computer.", e) });
    } finally {
      setLaeuft(null);
    }
  }

  async function importieren(datei: File) {
    setLaeuft('import');
    setMeldung(null);
    try {
      const text = await datei.text();
      let bundle: unknown;
      try {
        bundle = JSON.parse(text);
      } catch {
        setMeldung({ art: 'fehler', text: 'That file is not valid JSON — is it really a Device Sync bundle?' });
        return;
      }
      const r = await fetch('/api/sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle, passphrase }),
      });
      const d = await r.json();
      if (!r.ok) throw new ApiFehler(tuerSatz(d?.error, 'The store refused this bundle.'), r.status);
      setMeldung({ art: 'ok', text: `${d.imported} imported, ${d.skipped} already there.` });
      void journalLaden();
    } catch (e) {
      setMeldung({ art: 'fehler', text: absage("The bundle was not imported. Your notes were not changed.", e) });
    } finally {
      setLaeuft(null);
      if (dateiFeld.current) dateiFeld.current.value = '';
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="fs-5 lh-lesbar font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Device Sync</h3>
        <p className="fs-4 lh-prosa" style={{ color: 'var(--text-2)' }}>
          Encrypted exchange between your own devices. K3PTA sends nothing — you get a file
          and carry it across yourself: a USB stick, your own folder, an encrypted mail. The
          route may be read along the way; the contents may not.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ps-pass" className="fs-2 lh-dicht font-semibold flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
          <KeyRound className="w-3.5 h-3.5" /> Passphrase
        </label>
        <input
          id="ps-pass"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={`At least ${MIN_PASSPHRASE} characters`}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg fs-4 lh-lesbar hud-inset"
          style={{ color: 'var(--text-1)' }}
        />
        {zuKurz && (
          <p className="fs-2 lh-dicht" style={{ color: 'var(--warn, #b45309)' }}>
            {MIN_PASSPHRASE - passphrase.length} more — anything shorter would be worthless against an intercepted bundle.
          </p>
        )}
        <p className="fs-2 lh-dicht flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-1" />
          Stored nowhere. Without it the bundle cannot be opened again — not even by you.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ps-scope" className="fs-2 lh-dicht font-semibold" style={{ color: 'var(--text-2)' }}>
          Scope (keeps clients apart)
        </label>
        <input
          id="ps-scope"
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="local"
          className="w-full px-3 py-2 rounded-lg fs-4 lh-lesbar hud-inset"
          style={{ color: 'var(--text-1)' }}
        />
        <p className="fs-2 lh-dicht" style={{ color: 'var(--text-2)' }}>
          Only notes in this scope go into the bundle, so client A stays out of client B's file.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={exportieren}
          disabled={!bereit}
          className="flex items-center gap-2 px-4 py-3 rounded-lg fs-4 lh-lesbar font-semibold disabled:opacity-40 disabled:cursor-not-allowed hud-raised"
          style={{ color: 'var(--text-1)' }}
        >
          {laeuft === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Create bundle
        </button>

        <button
          type="button"
          onClick={() => dateiFeld.current?.click()}
          disabled={!bereit}
          className="flex items-center gap-2 px-4 py-3 rounded-lg fs-4 lh-lesbar font-semibold disabled:opacity-40 disabled:cursor-not-allowed hud-raised"
          style={{ color: 'var(--text-1)' }}
        >
          {laeuft === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Read bundle
        </button>
        <input
          ref={dateiFeld}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importieren(f); }}
        />
      </div>

      {meldung && (
        <div
          role="status"
          className="px-3 py-3 rounded-lg fs-4 lh-lesbar"
          style={{ color: meldung.art === 'ok' ? 'var(--ok)' : 'var(--err, #dc2626)' }}
        >
          {meldung.text}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="fs-4 lh-lesbar font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <FileJson className="w-4 h-4" /> Bundle ledger
          </h4>
          {intakt !== null && (
            <span className="fs-2 lh-dicht flex items-center gap-2" style={{ color: intakt ? 'var(--ok)' : 'var(--err, #dc2626)' }}>
              {intakt ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              {intakt ? 'Chain intact' : 'Chain broken'}
            </span>
          )}
        </div>
        <p className="fs-2 lh-dicht" style={{ color: 'var(--text-2)' }}>
          Records which bundle went which way and when — through hashes, without knowing the contents.
        </p>
        {journal.length > 0 ? (
          <ul className="space-y-2">
            {journal.slice(-8).reverse().map((e) => (
              <li key={e.hash} className="fs-2 lh-dicht flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg hud-inset">
                <span style={{ color: 'var(--text-1)' }}>#{e.seq}</span>
                <span style={{ color: 'var(--text-1)' }}>{e.direction === 'export' ? 'Export' : 'Import'}</span>
                <span style={{ color: 'var(--text-2)' }}>{e.count} notes</span>
                <span style={{ color: 'var(--text-2)' }}>{e.scope}</span>
                <span style={{ color: 'var(--text-2)' }}>{new Date(e.at).toLocaleString()}</span>
                <code style={{ color: 'var(--text-2)' }}>{e.payloadHash.slice(0, 12)}…</code>
              </li>
            ))}
          </ul>
        ) : journalGrund ? (
          <p role="status" className="fs-2 lh-dicht" style={{ color: 'var(--warn)' }}>{journalGrund}</p>
        ) : (
          <p className="fs-2 lh-dicht" style={{ color: 'var(--text-2)' }}>
            Nothing recorded yet — the journal fills with the first bundle that goes out or comes in.
          </p>
        )}
      </div>
    </div>
  );
}
