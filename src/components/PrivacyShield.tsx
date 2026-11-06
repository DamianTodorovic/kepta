// The privacy shield, in plain words: two switches, what they do, and a live
// preview of what a cloud model would see. The preview runs the same code as
// the server (src/lib/schild.ts) — right here in the window, nothing is sent.
import { absage } from '../lib/absage';
import { ApiFehler, tuerSatz } from '../lib/api';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Lock } from '../lib/icons';
import { Schild, beschreibe } from '../lib/schild';

interface Stand {
  chat: boolean;
  apps: boolean;
  privateNotes: number;
  week: { cloudChats: number; protectedChats: number };
}

const BEISPIEL = 'Send the invoice to anna@example.com — IBAN DE89 3704 0044 0532 0130 00, call +49 171 2345678, password: Hunter2!';

function Schalter({ an, onChange, label }: { an: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={label}
      onClick={() => onChange(!an)}
      className="relative w-10 h-6 rounded-full shrink-0 transition-colors"
      style={{ background: an ? 'var(--accent)' : 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)' }}
    >
      <span className="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all" style={{ left: an ? 18 : 2, width: 18, height: 18 }} />
    </button>
  );
}

export function PrivacyShield() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [probe, setProbe] = useState(BEISPIEL);

  useEffect(() => {
    let vorbei = false;
    fetch('/api/shield')
      .then(async (r) => {
        const d = await r.json() as Partial<Stand> & { error?: string };
        if (!r.ok) throw new ApiFehler(tuerSatz(d.error, `HTTP ${r.status}`), r.status);
        // Read field by field — an older server or an empty answer must not break the page.
        if (!vorbei) {
          setStand({
            chat: d.chat !== false,
            apps: d.apps !== false,
            privateNotes: Number(d.privateNotes) || 0,
            week: { cloudChats: Number(d.week?.cloudChats) || 0, protectedChats: Number(d.week?.protectedChats) || 0 },
          });
        }
      })
      .catch((e: unknown) => { if (!vorbei) setFehler(absage("The privacy tally did not arrive. Nothing was switched.", e)); });
    return () => { vorbei = true; };
  }, []);

  const schalte = async (feld: 'chat' | 'apps', wert: boolean) => {
    setStand((s) => (s ? { ...s, [feld]: wert } : s));
    try {
      const r = await fetch('/api/shield', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [feld]: wert }) });
      // P63: Status zuerst, Koerper verzeihend gelesen.
      const d = (await r.json().catch(() => null)) as Partial<Stand> & { error?: unknown } | null;
      if (!r.ok) throw new ApiFehler(tuerSatz(d?.error, `HTTP ${r.status}`), r.status);
      if (!d) throw new ApiFehler("The tally arrived without readable text.", r.status);
      // Ein Feld, das die Tuer nicht nennt, schreibt die Flaeche nicht auf undefined --
      // sonst sieht ein Schalter aus wie ausgeschaltet, ohne dass ihn jemand ausschaltete.
      setStand((s) => (s ? { ...s, chat: d.chat ?? s.chat, apps: d.apps ?? s.apps } : s));
    } catch (e) {
      setStand((s) => (s ? { ...s, [feld]: !wert } : s));
      setFehler(absage("The switch did not stay — it is back where it was.", e));
    }
  };

  const chatAn = stand?.chat ?? true;

  const vorschau = useMemo(() => {
    if (!chatAn) return { text: probe, was: '' };
    const s = new Schild();
    return { text: s.schirme(probe), was: beschreibe(s.zaehlung) };
  }, [probe, chatAn]);

  return (
    <div data-testid="privacy-shield" className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Privacy shield</h3>
        </div>
        <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-2)' }}>
          Your notes stay yours. K3PTA hides personal data before anything leaves this computer.
        </p>
      </div>
      {fehler && <p className="fs-4 lh-lesbar" style={{ color: 'var(--warn)' }}>{fehler}</p>}
      {stand && (
        <>
          <div className="hud-inset rounded-xl p-3 flex gap-3 items-start">
            <div className="flex-1">
              <div className="fs-4 lh-lesbar font-semibold" style={{ color: 'var(--text-1)' }}>Hide personal data from cloud AI</div>
              <p className="fs-2 lh-dicht mt-1" style={{ color: 'var(--text-2)' }}>
                Email addresses, phone numbers, IBANs, card numbers, passwords and keys are swapped for placeholders before a question
                goes to OpenAI, Anthropic or any other cloud model. The answer shows the real values again. A model running on this
                computer sees everything — the data never leaves it.
              </p>
            </div>
            <Schalter an={stand.chat} onChange={(v) => void schalte('chat', v)} label="Hide personal data from cloud AI" />
          </div>
          <div className="hud-inset rounded-xl p-3 flex gap-3 items-start">
            <div className="flex-1">
              <div className="fs-4 lh-lesbar font-semibold" style={{ color: 'var(--text-1)' }}>Hide secrets from AI apps</div>
              <p className="fs-2 lh-dicht mt-1" style={{ color: 'var(--text-2)' }}>
                Claude, Cursor and other AI apps read your notes without passwords, keys, card numbers and IBANs. If an app changes
                such a note, the real values stay. Names, emails and phone numbers stay visible — apps need them to help you.
              </p>
            </div>
            <Schalter an={stand.apps} onChange={(v) => void schalte('apps', v)} label="Hide secrets from AI apps" />
          </div>
          <div className="hud-inset rounded-xl p-3 flex gap-3 items-start">
            <Lock className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--accent)' }} />
            <p className="fs-2 lh-dicht" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>
                {stand.privateNotes === 0 ? 'No private notes yet.' : `${stand.privateNotes} private ${stand.privateNotes === 1 ? 'note' : 'notes'}.`}
              </strong>{' '}
              A private note is never shown to an AI app and never sent to a cloud model — always, whatever the switches say. Mark a
              note private in the editor.
            </p>
          </div>
          <p className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>
            This week: {stand.week.cloudChats} {stand.week.cloudChats === 1 ? 'question' : 'questions'} went to a cloud model
            {stand.week.cloudChats > 0 ? `, ${stand.week.protectedChats} of them with something hidden` : ''}. Every one is in the audit log.
          </p>
        </>
      )}
      <div>
        <label className="hud-label block mb-2" htmlFor="shield-probe">Try it — this is what a cloud model would see</label>
        <textarea id="shield-probe" value={probe} onChange={(e) => setProbe(e.target.value)} rows={3} className="hud-input w-full rounded-xl px-3 py-2 fs-4 lh-lesbar" />
        <div data-testid="shield-preview" className="hud-inset rounded-xl px-3 py-2 mt-2 fs-4 lh-lesbar whitespace-pre-wrap break-words" style={{ color: 'var(--text-1)' }}>
          {vorschau.text}
        </div>
        <p className="fs-2 lh-dicht mt-2" style={{ color: 'var(--text-3)' }}>
          {chatAn
            ? (vorschau.was ? `Hidden: ${vorschau.was}.` : 'Nothing to hide in this text.')
            : 'The shield is off — a cloud model would see this text exactly as it is.'}
        </p>
      </div>
    </div>
  );
}
