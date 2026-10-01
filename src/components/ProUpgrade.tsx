// Das Upgrade-Panel: KEPTA sperrt die App nie — dieses Panel öffnet sich auf
// Wunsch (Seitenleiste) oder wenn der Nutzer es will. Zwei Wege: den Pro-
// Schlüssel kaufen (Checkout) oder einen bereits erhaltenen Schlüssel
// aktivieren — die Prüfung bleibt offline, nichts verlässt den Rechner.
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { KeptaMark } from "./KeptaMark";
import { getJson, sendJson } from "../lib/api";

/** Wem die Lizenz gehört — so zeigt die Seitenleiste sie an. */
export interface Lizenz {
  licensee: string;
  number: string;
  /** Die Stufe des Schlüssels (pro / business / enterprise) — alte Schlüssel ohne Stufe gelten als Pro. */
  edition?: string;
  /** Business: gekaufte Seat-Zahl. */
  seats?: number;
}

interface ProUpgradeProps {
  onClose: () => void;
  onActivated: (lizenz: Lizenz) => void;
  /** Der hinterlegte Schlüssel steht auf der Sperrliste (mit einem Update gekommen). */
  revoked?: boolean;
  /** Der Checkout-Weg (Paddle) — kommt von GET /api/license, damit der Betreiber ihn umsetzen kann. */
  upgradeUrl?: string;
  /** true, sobald KEPTA_UPGRADE_URL gesetzt ist — erst dann führt der Kaufen-Knopf wirklich zur Kasse. */
  checkoutLive?: boolean;
  /** Der Pro-Tag läuft (Restlaufzeit in ms) — das Panel nennt dann die Uhr statt der Grenzen. */
  protagRestMs?: number | null;
  /** Anderes Panel oder Escape: ohne Vorschau-Callback schließt nichts von allein. */
}

const LINKEDIN = "https://www.linkedin.com/in/damian-todorovic-244235434";

export function ProUpgrade({ onClose, onActivated, revoked = false, upgradeUrl, checkoutLive = false, protagRestMs = null }: ProUpgradeProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const keyRef = useRef<HTMLTextAreaElement>(null);
  const [laedt, setLaedt] = useState(false);

  const aktivieren = async () => {
    if (!name.trim() || !key.trim()) { setFehler("Please enter your name and your license key."); return; }
    setLaedt(true); setFehler(null);
    try {
      const d = await sendJson<{ licensee: string; number: string; edition?: string; seats?: number }>("/api/license", { name: name.trim(), key: key.trim() });
      if (typeof d?.licensee === "string" && typeof d?.number === "string") {
        onActivated({ licensee: d.licensee, number: d.number, edition: typeof d.edition === "string" ? d.edition : undefined, seats: typeof d.seats === "number" ? d.seats : undefined });
        return;
      }
      setFehler("This license key is not valid.");
    } catch (e) {
      // Server geantwortet (ApiFehler): seine Meldung steht im Panel. Netz weg:
      // ein klarer Hinweis statt einer rohen Fehlermeldung.
      const istApiAntwort = typeof e === "object" && e !== null && (e as { name?: string }).name === "ApiFehler";
      setFehler(istApiAntwort && e instanceof Error ? e.message : "KEPTA's background server is not reachable — please restart the app.");
      keyRef.current?.focus();
    }
    setLaedt(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        role="dialog" aria-label="KEPTA"
        className="w-full max-w-md rounded-2xl p-7"
        style={{ background: "var(--bg-base, #0b0b0c)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <KeptaMark size={28} radius={7} />
          <span className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: "var(--text-1)" }}>KEPTA</span>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg text-[13px] flex items-center justify-center"
            style={{ color: "var(--text-3)", background: "rgba(255,255,255,0.04)" }}
            aria-label="Close upgrade panel"
          >
            ✕
          </button>
        </div>

        <h1 className="text-[19px] font-semibold" style={{ color: "var(--text-1)" }}>Everything unlimited, quietly.</h1>
        <p className="text-[12.5px] mt-1.5 mb-4 leading-[1.6]" style={{ color: "var(--text-2)" }}>
          {protagRestMs != null && protagRestMs > 0
            ? `Your unlimited day is on — everything is unlimited for roughly ${Math.max(1, Math.round(protagRestMs / 3600000))} h. When it ends, the free plan keeps running with daily limits, and KEPTA never locks.`
            : "The free plan carries generous daily limits. A key removes them — chat, clipper, computer scan, dossiers, audit export, all of it. Still no account, no telemetry: the key is checked offline."}
        </p>

        <ul className="space-y-1.5 text-[12px] mb-5" style={{ color: "var(--text-3)" }}>
          {[
            "Unlimited chat, clipper and model discovery",
            "Unlimited computer scans and AI history imports",
            "Full audit log, dossiers and privacy shield",
            "Encrypted at rest — the key lives in your keychain",
          ].map((zeile) => (
            <li key={zeile} className="flex items-center gap-2.5">
              <span aria-hidden className="w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
              {zeile}
            </li>
          ))}
        </ul>

        {checkoutLive && upgradeUrl ? (
          <a href={upgradeUrl} target="_blank" rel="noopener noreferrer"
            className="btn-primary block w-full py-2.5 rounded-lg text-sm font-medium text-center mb-4">
            Buy a key — everything unlimited
          </a>
        ) : (
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer"
            className="btn-primary block w-full py-2.5 rounded-lg text-sm font-medium text-center mb-4">
            Get a key — write to Damian on LinkedIn
          </a>
        )}

        {revoked && (
          <p role="alert" className="text-xs px-3 py-2.5 rounded-lg mb-4 leading-relaxed" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>
            The license key saved on this Mac has been revoked. If you think this is a mistake, write to Damian Todorovic.
          </p>
        )}

        <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11.5px] mb-3" style={{ color: "var(--text-3)" }}>Already have a key? Activate it here:</p>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void aktivieren(); }}>
            <label className="block">
              <span className="text-xs block mb-1.5" style={{ color: "var(--text-3)" }}>Your name (as on the invoice)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Mandel" autoComplete="off"
                className="hud-input w-full rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs block mb-1.5" style={{ color: "var(--text-3)" }}>License key</span>
              <textarea ref={keyRef} value={key} onChange={(e) => setKey(e.target.value)} rows={3} spellCheck={false} autoComplete="off"
                placeholder="Paste the key you received — dashes and spaces don't matter"
                className="hud-input w-full rounded-lg px-3 py-2.5 text-[12.5px] font-mono resize-none leading-relaxed" />
            </label>
            {fehler && (
              <p role="alert" className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>
                {fehler}
              </p>
            )}
            <button type="submit" disabled={laedt}
              className="btn-ghost w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40">
              {laedt ? "Checking…" : "Activate key"}
            </button>
          </form>
          <p className="text-[11px] mt-3" style={{ color: "var(--text-3)" }}>
            Teams &amp; Enterprise? <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Write to Damian Todorovic</a>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/** Der aktuelle Upgrade-Weg für die Seitenleiste — von GET /api/license. */
export async function holeUpgradeUrl(): Promise<string | undefined> {
  try {
    const d = await getJson<{ upgradeUrl?: string }>("/api/license");
    return typeof d.upgradeUrl === "string" ? d.upgradeUrl : undefined;
  } catch {
    return undefined;
  }
}
