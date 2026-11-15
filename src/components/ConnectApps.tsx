// Connect K3PTA to the AI apps on this computer — one click each. K3PTA adds
// itself to the app's MCP settings, keeps a backup of the old file right next
// to it and changes nothing else. Used in the settings and on the Activity page.
import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, Loader2 } from '../lib/icons';
import { tuerSatz } from '../lib/api';
import { absage } from '../lib/absage';

export interface ClientStatus {
  id: string;
  name: string;
  installed: boolean;
  connected: boolean;
  config: string;
  canConnect: boolean;
  hint?: string;
}

export function ConnectApps() {
  const [clients, setClients] = useState<ClientStatus[] | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let vorbei = false;
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d: { clients?: ClientStatus[] }) => { if (!vorbei) setClients(Array.isArray(d.clients) ? d.clients : []); })
      .catch(() => { if (!vorbei) setFehler('K3PTA could not look for AI apps — is the local server running?'); });
    return () => { vorbei = true; };
  }, []);

  const verbinden = async (c: ClientStatus) => {
    setLaeuft(c.id);
    setMeldung(null);
    try {
      const r = await fetch(`/api/clients/${encodeURIComponent(c.id)}/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // P65: die Antwort wird zuerst gefragt, der Koerper verzeihend gelesen. Ein HTML-Blatt
      // warf beim JSON-Lesen, und die Meldung wurde zu einem grundlosen "please try again".
      const d = (await r.json().catch(() => null)) as { message?: string; error?: string; clients?: ClientStatus[] } | null;
      if (d && Array.isArray(d.clients)) setClients(d.clients);
      // Der Leib kommt von der eignen Tuer — gefiltert auf einen einzeiligen Kurzsatz,
      // damit ein fremder Koerper auf demselben Port hier keinen Pfad ablegen kann.
      // P65: zwei Zweige, zwei Saelle. Eine Abweisung nennt, WAS nicht geschah, und dahinter
      // den Satz der Tuer -- oder ihre Zahl, wenn die Tuer keinen Satz schrieb. Die nackte Zahl
      // allein war vorher die ganze Meldung, und das ist keine Auskunft.
      if (r.ok) { setMeldung({ ok: true, text: tuerSatz(d?.message, 'K3PTA answered without a message.') }); }
      else {
        // Hat die Tuer einen Satz geschrieben, steht er allein -- er sagt schon, was schlug.
        // Die Vorrede kommt nur, wenn ausser der Zahl nichts da war.
        const grund = tuerSatz(d?.error, '');
        setMeldung({ ok: false, text: grund || `Connecting failed — HTTP ${r.status}.` });
      }
    } catch (e: unknown) {
      setMeldung({ ok: false, text: absage('Connecting failed — please try again.', e) });
    } finally {
      setLaeuft(null);
    }
  };

  const keineApp = clients !== null && !clients.some((c) => c.installed);

  return (
    <div data-testid="connect-apps">
      <div className="flex items-center gap-2 mb-2">
        <Plug className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Connect your AI apps</h3>
      </div>
      <p className="fs-4 lh-lesbar mb-3" style={{ color: 'var(--text-2)' }}>
        One click, and the app can use your memory. K3PTA adds itself to the app’s settings — with a backup of the old file right
        next to it — and changes nothing else. Afterwards, quit and reopen the app.
      </p>
      {meldung && (
        <p role="status" className="fs-4 lh-lesbar mb-3 rounded-lg px-3 py-2" style={{ color: meldung.ok ? 'var(--ok)' : 'var(--warn)', border: `1px solid ${meldung.ok ? 'var(--ok)' : 'var(--warn)'}` }}>
          {meldung.text}
        </p>
      )}
      {fehler && <p className="fs-4 lh-lesbar" style={{ color: 'var(--warn)' }}>{fehler}</p>}
      {clients === null && !fehler && <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-2)' }}>Looking for AI apps on this computer…</p>}
      {keineApp && (
        <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-2)' }}>
          No AI app found on this computer. Any MCP client works with the settings block below.
        </p>
      )}
      {clients && clients.length > 0 && (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id} className="hud-inset rounded-xl px-3 py-3 flex items-center gap-3 flex-wrap" style={{ opacity: c.installed ? 1 : 0.55 }}>
              <div className="flex-1 min-w-[150px]">
                <div className="fs-4 lh-lesbar font-semibold" style={{ color: 'var(--text-1)' }}>{c.name}</div>
                <div className="fs-2 lh-dicht flex items-center gap-1" style={{ color: c.connected ? 'var(--ok)' : 'var(--text-3)' }}>
                  {c.connected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {c.connected ? 'Connected' : c.installed ? 'Not connected yet' : 'Not installed'}
                </div>
              </div>
              {c.canConnect && (
                <button onClick={() => void verbinden(c)} disabled={laeuft !== null} className="btn-primary px-3 py-2 rounded-lg fs-4 lh-lesbar font-semibold flex items-center gap-2 disabled:opacity-50">
                  {laeuft === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Connect
                </button>
              )}
              {c.installed && !c.connected && !c.canConnect && c.hint && (
                <p className="basis-full fs-2 lh-dicht break-all" style={{ color: 'var(--text-3)' }}>{c.hint}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
