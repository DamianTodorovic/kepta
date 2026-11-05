// Der Wiederherstellungsschluessel: einmal anzeigen, kopieren, im
// Passwort-Manager ablegen. Im Alltag braucht ihn niemand — die App und die
// Agenten holen den Schluessel selbst aus dem Schluesselbund. Er ist die
// Versicherung fuer einen neuen Rechner oder eine zurueckgespielte Sicherung.
import { absage } from '../lib/absage';
import { ApiFehler, tuerSatz } from '../lib/api';
import { useRef, useState } from 'react';
import { Copy, Check } from '../lib/icons';
import { QUITTUNG_MS } from '../lib/quittung';

/** 64 Hex-Zeichen in Achtergruppen — lesbar, beim Kopieren bleibt es roh. */
export function gruppiere(hex: string): string {
  return (hex.match(/.{1,8}/g) ?? []).join(' ');
}

export function RecoveryKey() {
  const [key, setKey] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [laedt, setLaedt] = useState(false);

  const zeigen = async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await fetch('/api/recovery-key', { method: 'POST', headers: { 'X-KEPTA-Recovery': '1' } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiFehler(tuerSatz(d.error, `HTTP ${res.status}`), res.status);
      setKey(String(d.key));
    } catch (e) {
      setFehler(absage("The recovery key could not be shown.", e));
    }
    setLaedt(false);
  };

  const kopieren = () => {
    if (!key) return;
    const ablage = navigator.clipboard;
    if (!ablage?.writeText) { setFehler('Copying is not available here — select the key instead.'); return; }
    void ablage.writeText(key).then(
      () => {
        if (kopierTimer.current) clearTimeout(kopierTimer.current);
        setKopiert(true);
        kopierTimer.current = setTimeout(() => { setKopiert(false); kopierTimer.current = null; }, QUITTUNG_MS);
      },
      () => setFehler('Copying failed — select the key instead.'),
    );
  };

  return (
    <div className="rounded-xl p-4 mt-3" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-inset)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Recovery key</div>
      <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
        You and your agents never need it — K3PTA fetches the key by itself. Keep one copy in your password manager:
        it is the only way to open your knowledge base, or a backup of it, on a new computer. Never share it.
      </p>
      {key ? (
        <>
          <div aria-label="Recovery key" className="mt-3 rounded-lg p-3 font-mono text-sm select-all break-all"
            style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-1)', border: '1px solid var(--border-subtle)', wordSpacing: '0.4em' }}>
            {gruppiere(key)}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={kopieren} className="btn-primary flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold">
              {kopiert ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {kopiert ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setKey(null)} className="btn-ghost px-3 py-2 rounded-lg text-sm">Hide</button>
          </div>
        </>
      ) : (
        <button onClick={() => void zeigen()} disabled={laedt} className="btn-ghost mt-3 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ border: '1px solid var(--border-subtle)' }}>
          {laedt ? 'Loading…' : 'Show recovery key'}
        </button>
      )}
      {fehler && <p className="text-xs mt-2" style={{ color: 'var(--warn)' }}>{fehler}</p>}
    </div>
  );
}
