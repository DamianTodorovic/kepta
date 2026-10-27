// Connect K3PTA to the AI apps on this computer — one click each. K3PTA adds
// itself to the app's MCP settings, keeps a backup of the old file right next
// to it and changes nothing else. Used in the settings and on the Activity page.
import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, Loader2 } from '../lib/icons';

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
      const d = await r.json() as { message?: string; error?: string; clients?: ClientStatus[] };
      if (Array.isArray(d.clients)) setClients(d.clients);
      setMeldung({ ok: r.ok, text: d.message ?? d.error ?? `HTTP ${r.status}` });
    } catch {
      setMeldung({ ok: false, text: 'Connecting failed — please try again.' });
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
      <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>
        One click, and the app can use your memory. K3PTA adds itself to the app’s settings — with a backup of the old file right
        next to it — and changes nothing else. Afterwards, quit and reopen the app.
      </p>
      {meldung && (
        <p role="status" className="text-sm mb-3 rounded-lg px-3 py-2" style={{ color: meldung.ok ? 'var(--ok)' : 'var(--warn)', border: `1px solid ${meldung.ok ? 'var(--ok)' : 'var(--warn)'}` }}>
          {meldung.text}
        </p>
      )}
      {fehler && <p className="text-sm" style={{ color: 'var(--warn)' }}>{fehler}</p>}
      {clients === null && !fehler && <p className="text-sm" style={{ color: 'var(--text-2)' }}>Looking for AI apps on this computer…</p>}
      {keineApp && (
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          No AI app found on this computer. Any MCP client works with the settings block below.
        </p>
      )}
      {clients && clients.length > 0 && (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id} className="hud-inset rounded-xl px-3 py-3 flex items-center gap-3 flex-wrap" style={{ opacity: c.installed ? 1 : 0.55 }}>
              <div className="flex-1 min-w-[150px]">
                <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{c.name}</div>
                <div className="text-xs flex items-center gap-1" style={{ color: c.connected ? 'var(--ok)' : 'var(--text-3)' }}>
                  {c.connected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {c.connected ? 'Connected' : c.installed ? 'Not connected yet' : 'Not installed'}
                </div>
              </div>
              {c.canConnect && (
                <button onClick={() => void verbinden(c)} disabled={laeuft !== null} className="btn-primary px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                  {laeuft === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Connect
                </button>
              )}
              {c.installed && !c.connected && !c.canConnect && c.hint && (
                <p className="basis-full text-xs break-all" style={{ color: 'var(--text-3)' }}>{c.hint}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
