import { absage } from '../lib/absage';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, ChevronRight, ChevronLeft, Cpu, Database, Globe, User, Target, Loader2, PartyPopper, AlertCircle, Info } from "../lib/icons";
import { normalizeTopics, MAX_TOPICS, type DetectedAI, detectLocalAIs, suggestProvider, saveProfile, createDefaultProfile, type UserProfileAdaptive } from '../lib/profile';
import { starterNotes } from '../lib/starter';
import { KeptaMark } from './KeptaMark';
import { loadAISettings, saveAISettings, providerById } from '../lib/ai';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (profile: UserProfileAdaptive, importedCount: number) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

// Frueher wurden hier Fachpakete zusammengesetzt: wer "Fishing" waehlte, bekam
// Forellenkoeder in die eigene Datenbank. Ein Gedaechtnis, das mit "dein Wissen"
// wirbt, startet nicht mit fremdem Wissen — geblieben sind die Notizen ueber
// K3PTA selbst (siehe lib/starter.ts).

/**
 * Was der Assistent sagt, wenn die Platte die Scan-Entscheidung nicht annimmt.
 * Ein Satz, zwei Seiten: der Wunsch gilt in dieser Sitzung (er liegt in der Hand der
 * Komponente), aber er ueberlebt den naechsten Start nicht — beides zusammen ist die
 * Wahrheit, und nur die Haelfte waere die alte Absage.
 */
const WUNSCH_ABSAGE = 'Blocked saving, so your scan choice will not be kept. Next start asks again.';

export function OnboardingWizard({ open, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [goal, setGoal] = useState('');
  const [detected, setDetected] = useState<DetectedAI[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [fehlgeschlagen, setFehlgeschlagen] = useState(false);
  // Rechner-Scan: hier wird nur GEFRAGT, ob danach danach gefragt werden soll.
  // Die eigentliche Zustimmung — mit Vorschau und dem Hinweis auf MCP-Agenten —
  // holt der Scan-Dialog selbst ein. Ein Haken im Assistenten darf nicht
  // ausreichen, um die Festplatte zu lesen.
  const [scanAngefragt, setScanAngefragt] = useState(false);
  /** Warum der Wunsch nicht auf der Platte liegt — null, wenn er nachgelesen wurde. */
  const [wunschGrund, setWunschGrund] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDetected(null);
    setImportResult(null);
    setScanAngefragt(false);
  }, [open]);

  useEffect(() => {
    if (open && step === 3 && detected === null && !scanning) {
      setScanning(true);
      detectLocalAIs().then(d => { setDetected(d); setScanning(false); }).catch(()=> setScanning(false));
    }
  }, [open, step, detected, scanning]);

  // Themen kommen aus der Tastatur des Nutzers, nicht aus einer Liste. Komma
  // und Enter legen ab, damit "Mandatsakten, Fristen" in einem Rutsch geht.
  const addTopics = (roh: string) => {
    if (!roh.trim()) return;
    setTopics(prev => normalizeTopics([...prev, ...roh.split(',')]));
    setTopicInput('');
  };
  const removeTopic = (t: string) => setTopics(prev => prev.filter(x => x !== t));

  // Was der Knopf unten mit den KI-Einstellungen tut, haengt an einem einzigen
  // Fund: ein lokaler Anbieter, der ein Modell meldet. Frueher stand diese
  // Rechnung nur in handleFinish, die Endschaft behauptete derweil
  // „Provider auto-configured" — auch wenn nichts geschrieben wurde, und sie
  // nannte einen Anbieter, der nie installiert war. Hier wird einmal gerechnet;
  // Knopf und Schirm lesen dasselbe, damit der Schirm nicht vorgreifen kann.
  const lokalerFund = detected?.find(d => d.available && d.models.length > 0) ?? null;
  const provId = detected ? suggestProvider(detected, 'openai') : 'ollama';
  const prov = providerById(provId);
  const providerWirdGesetzt = lokalerFund !== null;
  const modellZumSetzen = lokalerFund?.models[0] || prov.defaultModel;

  const handleFinish = async () => {
    const starter = starterNotes();
    setImporting(true);
    setImportResult(null);
    try {
      if (scanAngefragt) localStorage.setItem('kepta_scan_wunsch', '1');
      else localStorage.removeItem('kepta_scan_wunsch');
      // Punkt 4 aus P4-UEBRIGE-VIER (gebaut 3.11.): bis hier stand ein `catch { /* ignore */ }`.
      // Der Wunsch ist eine Entscheidung ueber den eignen Rechner — schlaegt die Platte sie ab
      // und die App schweigt, fragt der Assistent heimlich von vorn. Setzen *und zuruecklesen*
      // ist der einzige Beweis, dass der Speicher die Entscheidung angenommen hat.
      const sitzt = scanAngefragt
        ? localStorage.getItem('kepta_scan_wunsch') === '1'
        : localStorage.getItem('kepta_scan_wunsch') === null;
      setWunschGrund(sitzt ? null : WUNSCH_ABSAGE);
    } catch {
      setWunschGrund(WUNSCH_ABSAGE);
    }
    try {
      // nur überschreiben wenn ein lokaler Anbieter ein Modell gemeldet hat
      const s = loadAISettings();
      if (providerWirdGesetzt) {
        saveAISettings({ providerId: provId, apiKey: s.apiKey === 'local' ? 'local' : s.apiKey, baseUrl: prov.baseUrl, model: modellZumSetzen });
      }

      // Profil speichern
      const profile: UserProfileAdaptive = {
        ...createDefaultProfile(),
        displayName: name.trim() || 'You',
        topics,
        goal: goal.trim(),
        detectedAIs: detected || [],
        preferredProviderId: provId,
        hasCompletedOnboarding: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // saveProfile spiegelt selbst — hier wird nur gewartet, nicht noch einmal
      // geschrieben (der zweite POST fuehrte dieselben Felder ein zweites Mal
      // zusammen und setzte updatedAt zweimal).
      await saveProfile(profile);

      // Starter importieren
      let imported = 0;
      for (const n of starter) {
        const r = await fetch('/api/memory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(n) });
        if (r.ok) imported++;
      }
      // Punkt 4, 2.11.: der Kasten war immer grün gefärbt und der Schirm schloss sich nach
      // 900 ms — auch bei `0 notes created for you`, wenn keine einzige Schreibung durchging.
      setFehlgeschlagen(imported === 0);
      setImportResult(imported === 0
        ? 'Nothing was saved — the store refused every note.'
        : `${imported} note${imported === 1 ? '' : 's'} created for you`);
      if (imported > 0) setTimeout(()=> onComplete(profile, imported), 900);
    } catch (e) {
      // Ein String ohne .message warf hier „undefined" in den grünen Kasten.
      setFehlgeschlagen(true);
      setImportResult(absage("The documents were not saved. You can import this folder later.", e));
    } finally { setImporting(false); }
  };

  if (!open) return null;

  const starterPreview = starterNotes();

  return (
    <aside
      data-testid="wizard-taefelchen"
      className="wizard-taefelchen relative z-[80] flex min-w-0 my-3 mr-3"
      aria-label="Set up K3PTA"
    >
      <motion.div initial={{scale:0.96, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.96, opacity:0}}
        transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.28 }}
        className="relative w-full h-full max-h-full overflow-hidden palette-lens flex flex-col">
        {/* Progress */}
        <div className="h-1 w-full flex gap-1 p-1" style={{background:'var(--bg-inset)'}}>
          {[1,2,3,4].map(i=> <div key={i} className="flex-1 rounded-full transition-[width] duration-200" style={{background: step>=i ? 'var(--accent)' : 'var(--bg-inset-strong)'}} />)}
        </div>
        <div className="px-7 pt-6 pb-4 flex items-center gap-4" style={{borderBottom:'1px solid var(--border-subtle)'}}>
          <KeptaMark size={38} />
          <div className="flex-1">
            <h2 className="fs-5 font-semibold tracking-[-0.015em]" style={{color:'var(--text-1)'}}>Set up K3PTA</h2>
            {/* „one minute" war eine ungeprüfte Anwerbung und {step}/4 stand
                zweimal auf demselben Schirm — einmal in Worten, einmal in Ziffern. */}
            <p className="fs-2 lh-dicht mt-1" style={{color:'var(--text-2)'}}>Step {step} of 4 — four questions, all on this computer.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
          {step===1 && (
            <motion.div key="s1" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-5">
              <div className="flex items-center gap-2 hud-label"><User className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Who are you?</div>
              <div>
                <label htmlFor="onboarding-name" className="hud-label block mb-2">Name (what should K3PTA call you?)</label>
                <input id="onboarding-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex" autoFocus className="hud-input w-full rounded-xl px-4 py-3 fs-4 lh-lesbar" />
              </div>
              <div>
                <label htmlFor="onboarding-goal" className="hud-label block mb-2 flex items-center gap-2"><Target className="w-3.5 h-3.5"/> What you want from K3PTA (optional)</label>
                {/* Gemessen: der lange Beispieltext brauchte 387,6 px in 338 px
                    Raum und schnitt im schmaleren Täfelchen hart ab. Das Beispiel
                    soll zünden, nicht die Zeile füllen. */}
                <input id="onboarding-goal" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="e.g. find things faster" className="hud-input w-full rounded-xl px-4 py-3 fs-4 lh-lesbar" />
                {/* Gemessen an Chat.tsx:385-402: goal, Name und Themen stehen am
                    Anfang jeder Anfrage. „Systemprompt" ist der Name dafuer im
                    Code, nicht die Sprache, die ein Erstanwender braucht. */}
                <p className="fs-2 lh-dicht mt-2" style={{color:'var(--text-3)'}}>If you write one, K3PTA puts it in front of every answer it gives you.</p>
              </div>
              {/* Die drei Fragen, die ein Frischgelaedener wirklich hat, werden
                  hier beantwortet und nicht frueher: wo liegt mein Bestand, wer
                  kann ihn lesen, was geschieht beim ersten Oeffnen mit meinen
                  Dateien. Alles andere auf diesem Schirm ist Zubereitung.
                  Gemessen 13.10. 21:2x: die Lange dieser Zeilen machte Schritt 1
                  bei 1024 px blätterbar (162 px) und bei 390 px (362 px), ausser
                  die Vorschau auf Schritt 3 — die steht dort selbst. */}
              <div className="hud-inset rounded-xl p-3 space-y-2">
                <p className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>
                  <strong style={{color:'var(--text-1)'}}>Where your notes live.</strong> One file here: <code className="font-mono">~/.kepta/kepta.db</code>. No account, no cloud of ours.
                </p>
                <p className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>
                  <strong style={{color:'var(--text-1)'}}>Who can read them.</strong> Only programs you connect here. Nothing leaves unless you add a cloud key — that AI sees your question and the notes it needs.
                </p>
                <p className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>
                  <strong style={{color:'var(--text-1)'}}>Your files.</strong> Opening K3PTA reads nothing. Documents come in only if you drop them, or say yes at the end — after seeing the list.
                </p>
              </div>
            </motion.div>
          )}
          {step===2 && (
            <motion.div key="s2" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Database className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> What do you work with? (optional, up to {MAX_TOPICS})</div>
              <div className="space-y-2">
                <input
                  aria-label="Add a topic"
                  value={topicInput}
                  onChange={e=>setTopicInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===','){ e.preventDefault(); addTopics(topicInput); } }}
                  onBlur={()=>addTopics(topicInput)}
                  disabled={topics.length>=MAX_TOPICS}
                  placeholder="Type a topic and press Enter — whatever you actually do"
                  className="hud-input w-full rounded-xl px-4 py-3 fs-4 lh-lesbar disabled:opacity-40"
                />
                <p className="fs-2 lh-dicht" style={{color:'var(--text-3)'}}>
                  Your words, not a menu. They shape how the assistant answers — nothing is written into your notes.
                </p>
                {topics.length>0 && (
                  <div className="flex flex-wrap gap-2">
                    {topics.map(t=> (
                      <button key={t} onClick={()=>removeTopic(t)} className="px-3 py-1 rounded-lg fs-2 lh-dicht hud-inset flex items-center gap-2" style={{color:'var(--text-1)'}} aria-label={`Remove ${t}`}>
                        {t} <span style={{color:'var(--text-3)'}}>×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="hud-inset rounded-xl p-3">
                <div className="hud-label mb-2">K3PTA starts with {starterPreview.length} notes about itself — nothing else</div>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {starterPreview.map(n=> <span key={n.title} className="px-2 py-1 rounded-lg fs-2 lh-dicht hud-inset" style={{color:'var(--text-2)'}}>{n.title}</span>)}
                </div>
              </div>
            </motion.div>
          )}
          {step===3 && (
            <motion.div key="s3" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Cpu className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Your AI — found on this computer</div>
              {/* Die Ports gehören nicht in einen Sprechtext: „localhost:11434"
                  ist für einen Frischgelaedenen kein Grund, kein Ausweg und keine
                  Tür. Sie stehen im Titel, für den, der sie sucht. */}
              {scanning && <div className="hud-inset rounded-xl p-6 flex items-center gap-3" title="Pings http://localhost:11434/api/tags and http://localhost:1234/v1/models"><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--accent)'}}/><span className="fs-4 lh-lesbar" style={{color:'var(--text-2)'}}>Asking this machine whether an AI is running…</span></div>}
              {!scanning && detected && (
                <div className="space-y-2">
                  {detected.map(d=>(
                    <div key={d.id} className="hud-inset rounded-xl p-3 flex items-center gap-3" style={{borderColor: d.available ? 'color-mix(in srgb, var(--ok) 35%, var(--border-subtle))' : undefined}}>
                      {/* Kein Tailwind-Grün: emerald-500 ist eine eigene Farbe
                          und gilt in beiden Themen gleich — Z-13. */}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: d.available ? 'var(--ok)' : 'var(--text-3)', boxShadow: d.available ? '0 0 8px var(--ok)' : undefined}}/>
                      <div className="flex-1 min-w-0">
                        <div className="fs-4 lh-lesbar font-semibold" style={{color:'var(--text-1)'}}>{d.label} {d.available ? '— available' : '— not found'}</div>
                        {/* Gemessen 13.10. 21:2x: `truncate` schnitt die Modelliste
                            bei jeder Breite ab (522 px_needed gegen 267/174/109/227
                            px Sicht). Ein Modell, das der Nutzer nicht lesen kann,
                            ist keine Angabe, ein Rätsel. Jetzt bricht das lange Wort
                            um, und nur die Liste bleibt gekappt (vier + Zahl). */}
                        <div className="fs-2 lh-dicht break-words" style={{color:'var(--text-3)'}}>{d.models.length ? d.models.slice(0,4).join(', ') + (d.models.length>4?` +${d.models.length-4}`:'') : d.available ? 'answering, but no model loaded — in a terminal: ollama pull llama3.2' : 'not installed'}</div>
                      </div>
                      {d.available && <span className="fs-2 lh-dicht hud-label px-2 py-1 rounded hud-inset" style={{color:'var(--ok)'}}>{d.latencyMs}ms</span>}
                    </div>
                  ))}
                  <div className="rounded-xl p-3" style={{background:'var(--accent-soft)', border:'1px solid var(--border-subtle)'}}>
                    <p className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>
                      <strong style={{color:'var(--text-1)'}}>So:</strong> {(() => {
                        // "ollama" ist zugleich suggestProvider's Nichts-gefunden-
                        // Default — ohne Verfügbarkeits-Check behauptete der Wizard
                        // "Ollama found", obwohl gerade "not found" stand.
                        // „Recommendation" war außerdem die falsche Stufe: der
                        // Assistent empfiehlt hier nicht, er setzt den Anbieter.
                        // Und „set as the provider" war eine drittels Lüge derselben
                        // Art — geschrieben wird erst mit dem Knopf auf Schritt 4.
                        const gefunden = detected.some(d => d.available && d.models.length > 0);
                        if (!gefunden) return 'No local AI found — you can install Ollama later or enter a cloud key. K3PTA works anyway, with the starter pack.';
                        const empfohlener = suggestProvider(detected);
                        const meldet = detected.find(d => d.id === empfohlener && d.available);
                        if (!meldet) return 'No local AI found — you can install Ollama later or enter a cloud key. K3PTA works anyway, with the starter pack.';
                        const modell = meldet.models[0];
                        return `${meldet.label} will answer${modell ? ` with ${modell}` : ' as soon as a model is loaded'}. Nothing leaves this machine, and you can change it in Settings.`;
                      })()}
                    </p>
                  </div>
                  <button onClick={()=>{setScanning(true); detectLocalAIs().then(d=>{setDetected(d); setScanning(false);});}} className="btn-ghost w-full py-2 rounded-xl fs-4 lh-lesbar">Scan again</button>
                </div>
              )}
            </motion.div>
          )}
          {step===4 && (
            <motion.div key="s4" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><PartyPopper className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Almost there — saving your first notes</div>
              <div className="hud-panel rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-soft)'}}><User className="w-4.5 h-4.5" style={{color:'var(--accent)'}}/></div>
                  <div>
                    <div className="fs-4 lh-lesbar font-semibold" style={{color:'var(--text-1)'}}>{name.trim()||'You'}{topics.length ? ` — ${topics.join(', ')}` : ''}</div>
                    {/* Nur das Ziel steht hier, und nur wenn es da ist. Der Satz
                        „no goal given" gehört an die Liste unten — zweimal auf
                        einem Schirm war eine Wiederholung, keine Auskunft. */}
                    {goal.trim() ? <div className="fs-2 lh-dicht" style={{color:'var(--text-2)'}}>{goal.trim()}</div> : null}
                  </div>
                </div>
                {/* Gemessen 13.10. 21:2x: in einem 262 px breiten Täfelchen brauchte
                    die Beschriftung 35–40 px, die Zelle ließ 32 — „entries“ (vorher)
                    und „topics“/„models“ (nachher) waren abgeschnitten. Die Zellen
                    bekommen ihren Rand waagerecht dünner, die Höhe bleibt. */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="hud-inset rounded-lg px-1 py-3"><div className="fs-5 font-semibold tnum" style={{color:'var(--text-1)'}}>{starterPreview.length}</div><div className="hud-label">notes</div></div>
                  <div className="hud-inset rounded-lg px-1 py-3"><div className="fs-5 font-semibold tnum" style={{color:'var(--text-1)'}}>{topics.length}</div><div className="hud-label">topics</div></div>
                  <div className="hud-inset rounded-lg px-1 py-3"><div className="fs-5 font-semibold tnum" style={{color:'var(--ok)'}}>{detected?.reduce((n,d)=> n + (d.available ? d.models.length : 0), 0) || 0}</div><div className="hud-label">models</div></div>
                </div>
                <ul className="fs-2 lh-dicht space-y-2" style={{color:'var(--text-2)'}}>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-1" style={{color:'var(--ok)'}}/> The {starterPreview.length} notes about K3PTA land in your memory — you can edit or delete every one</li>
                  {/* Die zwei Zeilen darunter waren Behauptungen: der Anbieter wurde
                      nur gesetzt, wenn ein lokaler Dienst ein Modell meldete, und
                      „adapts to your goal" stand auch da, wenn das Feld leer war. */}
                  {providerWirdGesetzt ? (
                    <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-1" style={{color:'var(--ok)'}}/> Answers will come from {prov.label}, model {modellZumSetzen} — change it any time in Settings</li>
                  ) : (
                    <li className="flex gap-2"><AlertCircle className="w-3.5 h-3.5 mt-1" style={{color:'var(--warn)'}}/> Nothing was set: no AI on this machine reported a model. K3PTA stores your notes anyway — pick an AI in Settings for answers</li>
                  )}
                  {goal.trim() ? (
                    <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-1" style={{color:'var(--ok)'}}/> Your goal is put in front of every question: „{goal.trim()}“</li>
                  ) : (
                    <li className="flex gap-2"><Info className="w-3.5 h-3.5 mt-1" style={{color:'var(--text-2)'}}/> No goal given — the assistant answers from your notes alone</li>
                  )}
                </ul>
              </div>
              <label className="hud-inset rounded-xl p-3 flex gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scanAngefragt}
                  onChange={(e)=> setScanAngefragt(e.target.checked)}
                  className="mt-1 shrink-0"
                />
                <span className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>
                  <strong style={{color:'var(--text-1)'}}>Also look through this computer for documents.</strong>{' '}
                  K3PTA can read the documents in your home folder and turn them into notes — everything stays on this
                  machine. Keys, passwords, credentials and browser data are never read. Before anything is saved you
                  see the folders it would take and how many documents each holds, and you can leave any of them out.
                </span>
              </label>
              {wunschGrund && (
                <div className="rounded-xl p-3 fs-2 lh-prosa" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} data-testid="wizard-wunsch-absage">
                  {wunschGrund}
                </div>
              )}
              <div className="hud-inset rounded-xl p-3 flex gap-3">
                <Globe className="w-4 h-4 mt-1 shrink-0" style={{color:'var(--text-3)'}}/>
                <p className="fs-2 lh-prosa" style={{color:'var(--text-2)'}}>After this: drop a file on the window or paste a link, and K3PTA keeps learning. Your whole memory is one file — <code className="font-mono">~/.kepta/kepta.db</code> — so you can back it up, move it, or delete it whenever you like.</p>
              </div>
              {importResult && <div className="rounded-xl p-3 text-center fs-4 lh-lesbar" style={{ background: `color-mix(in srgb, var(${fehlgeschlagen ? '--danger' : '--ok'}) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(${fehlgeschlagen ? '--danger' : '--ok'}) 30%, transparent)`, color: `var(${fehlgeschlagen ? '--danger' : '--ok'})` }}>{importResult}</div>}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div className="p-4 flex items-center justify-between" style={{borderTop:'1px solid var(--border-subtle)'}}>
          <button onClick={()=> step>1 ? setStep((s=> (s-1) as Step)) : onClose()} className="btn-ghost px-4 py-2 rounded-xl fs-4 lh-lesbar flex items-center gap-2"><ChevronLeft className="w-4 h-4"/>{step===1 ? 'Later' : 'Back'}</button>
          {step<4 ? (
            <button onClick={()=> setStep((s=> (s+1) as Step))} disabled={step===1 && !name.trim()} title={step===1 && !name.trim() ? 'A name first — or leave the setup any time with „Later".' : undefined} className="btn-primary px-6 py-3 rounded-xl fs-4 lh-lesbar flex items-center gap-2 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4"/>
            </button>
          ) : (
            <button onClick={handleFinish} disabled={importing} className="btn-primary px-6 py-3 rounded-xl fs-4 lh-lesbar flex items-center gap-2">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin"/> Saving your notes…</> : <><Sparkles className="w-4 h-4"/> Save these {starterPreview.length} notes</>}
            </button>
          )}
        </div>
      </motion.div>
    </aside>
  );
}
