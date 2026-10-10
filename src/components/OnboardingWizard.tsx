import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, ChevronRight, ChevronLeft, Cpu, Database, Search, Globe, FolderOpen, User, Target, Loader2, Plug, PartyPopper } from "../lib/icons";
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
// KEPTA selbst (siehe lib/starter.ts).

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
  const [customNote, setCustomNote] = useState('');
  // Rechner-Scan: hier wird nur GEFRAGT, ob danach danach gefragt werden soll.
  // Die eigentliche Zustimmung — mit Vorschau und dem Hinweis auf MCP-Agenten —
  // holt der Scan-Dialog selbst ein. Ein Haken im Assistenten darf nicht
  // ausreichen, um die Festplatte zu lesen.
  const [scanAngefragt, setScanAngefragt] = useState(false);

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

  const handleFinish = async () => {
    const starter = starterNotes();
    setImporting(true);
    setImportResult(null);
    try {
      if (scanAngefragt) localStorage.setItem('kepta_scan_wunsch', '1');
      else localStorage.removeItem('kepta_scan_wunsch');
    } catch { /* ignore */ }
    try {
      // auto-konfiguriere Provider wenn lokal gefunden
      const provId = detected ? suggestProvider(detected, 'openai') : 'ollama';
      const prov = providerById(provId);
      const s = loadAISettings();
      // nur überschreiben wenn noch default / leer und lokaler Anbieter verfügbar
      const shouldAuto = detected?.some(d=>d.available && d.models.length>0);
      if (shouldAuto) {
        const bestModel = detected?.find(d=>d.id===provId)?.models[0] || prov.defaultModel;
        saveAISettings({ providerId: provId, apiKey: s.apiKey === 'local' ? 'local' : s.apiKey, baseUrl: prov.baseUrl, model: bestModel });
      }

      // Profil speichern
      const profile: UserProfileAdaptive = {
        ...createDefaultProfile(),
        displayName: name.trim() || 'You',
        topics,
        goal: goal.trim(),
        customNote: customNote.trim(),
        detectedAIs: detected || [],
        preferredProviderId: provId,
        hasCompletedOnboarding: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveProfile(profile);
      // Auf Server spiegeln (best effort)
      try { await fetch('/api/profile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(profile) }); } catch{}

      // Starter importieren
      let imported = 0;
      for (const n of starter) {
        const r = await fetch('/api/memory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(n) });
        if (r.ok) imported++;
      }
      setImportResult(`${imported} nodes created for you`);
      setTimeout(()=> onComplete(profile, imported), 900);
    } catch (e:any) {
      setImportResult(e.message||'Error');
    } finally { setImporting(false); }
  };

  if (!open) return null;

  const starterPreview = starterNotes();

  return (
    <aside
      data-testid="wizard-taefelchen"
      className="wizard-taefelchen relative z-[80] flex min-w-0 my-2.5 mr-2.5"
      aria-label="Set up KEPTA"
    >
      <motion.div initial={{scale:0.96, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.96, opacity:0}}
        transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.28 }}
        className="relative w-full h-full max-h-full overflow-hidden palette-lens flex flex-col">
        {/* Progress */}
        <div className="h-1 w-full flex gap-1 p-1" style={{background:'var(--bg-inset)'}}>
          {[1,2,3,4].map(i=> <div key={i} className="flex-1 rounded-full transition-[width] duration-200" style={{background: step>=i ? 'var(--accent)' : 'var(--bg-inset-strong)'}} />)}
        </div>
        <div className="px-7 pt-6 pb-4 flex items-center gap-3.5" style={{borderBottom:'1px solid var(--border-subtle)'}}>
          <KeptaMark size={38} radius={9} />
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]" style={{color:'var(--text-1)'}}>Set up KEPTA</h2>
            <p className="text-xs mt-0.5" style={{color:'var(--text-2)'}}>Step {step} of 4 — one minute, and KEPTA adapts to you.</p>
          </div>
          <span className="hud-label tnum">{step}/4</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
          {step===1 && (
            <motion.div key="s1" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-5">
              <div className="flex items-center gap-2 hud-label"><User className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Who are you?</div>
              <div>
                <label className="hud-label block mb-2">Name (what should KEPTA call you?)</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex" autoFocus className="hud-input w-full rounded-xl px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="hud-label block mb-2 flex items-center gap-2"><Target className="w-3.5 h-3.5"/> What you want from KEPTA</label>
                {/* Gemessen: der lange Beispieltext brauchte 387,6 px in 338 px
                    Raum und schnitt im schmaleren Täfelchen hart ab. Das Beispiel
                    soll zünden, nicht die Zeile füllen. */}
                <input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="e.g. find things faster" className="hud-input w-full rounded-xl px-4 py-3 text-sm" />
                <p className="text-xs mt-2" style={{color:'var(--text-3)'}}>Woven into the system prompt — answers adapt to your goal.</p>
              </div>
              <div className="hud-inset rounded-xl p-3 flex gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-soft)'}}><Plug className="w-4 h-4" style={{color:'var(--accent)'}}/></div>
                <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>Next, KEPTA scans locally for the AI you have installed (Ollama, LM Studio). No key, no cloud — just localhost pings.</p>
              </div>
            </motion.div>
          )}
          {step===2 && (
            <motion.div key="s2" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Database className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> What do you work with? (optional, up to {MAX_TOPICS})</div>
              <div className="space-y-2">
                <input
                  value={topicInput}
                  onChange={e=>setTopicInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===','){ e.preventDefault(); addTopics(topicInput); } }}
                  onBlur={()=>addTopics(topicInput)}
                  disabled={topics.length>=MAX_TOPICS}
                  placeholder="Type a topic and press Enter — whatever you actually do"
                  className="hud-input w-full rounded-xl px-4 py-2.5 text-sm disabled:opacity-40"
                />
                <p className="text-xs" style={{color:'var(--text-3)'}}>
                  Your words, not a menu. They shape how the assistant answers — nothing is written into your notes.
                </p>
                {topics.length>0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map(t=> (
                      <button key={t} onClick={()=>removeTopic(t)} className="px-2.5 py-1 rounded-lg text-xs hud-inset flex items-center gap-1.5" style={{color:'var(--text-1)'}} aria-label={`Remove ${t}`}>
                        {t} <span style={{color:'var(--text-3)'}}>×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="hud-inset rounded-xl p-3">
                <div className="hud-label mb-2">KEPTA starts with {starterPreview.length} notes about itself — nothing else</div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {starterPreview.map(n=> <span key={n.title} className="px-2 py-1 rounded-lg text-xs hud-inset" style={{color:'var(--text-2)'}}>{n.title}</span>)}
                </div>
              </div>
              <div>
                <label className="hud-label block mb-2">Anything else worth knowing? (optional)</label>
                <input value={customNote} onChange={e=>setCustomNote(e.target.value)} placeholder="e.g. how you like answers, a constraint, a deadline…" className="hud-input w-full rounded-xl px-4 py-2.5 text-sm" />
              </div>
            </motion.div>
          )}
          {step===3 && (
            <motion.div key="s3" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Cpu className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Your AI — detected locally</div>
              {scanning && <div className="hud-inset rounded-xl p-6 flex items-center gap-3"><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--accent)'}}/><span className="text-sm" style={{color:'var(--text-2)'}}>Scanning localhost:11434 and :1234…</span></div>}
              {!scanning && detected && (
                <div className="space-y-2">
                  {detected.map(d=>(
                    <div key={d.id} className="hud-inset rounded-xl p-3 flex items-center gap-3" style={{borderColor: d.available ? 'color-mix(in srgb, var(--ok) 35%, var(--border-subtle))' : undefined}}>
                      <span className={`w-2.5 h-2.5 rounded-full ${d.available ? 'bg-emerald-500' : 'bg-zinc-400'}`} style={{boxShadow: d.available ? '0 0 8px var(--ok)' : undefined}}/>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{color:'var(--text-1)'}}>{d.label} {d.available ? '— available' : '— not found'}</div>
                        <div className="text-xs truncate" style={{color:'var(--text-3)'}}>{d.models.length ? d.models.slice(0,4).join(', ') + (d.models.length>4?` +${d.models.length-4}`:'') : d.available ? 'no models loaded (ollama pull ...)' : 'not installed'}</div>
                      </div>
                      {d.available && <span className="text-xs hud-label px-1.5 py-1 rounded hud-inset" style={{color:'var(--ok)'}}>{d.latencyMs}ms</span>}
                    </div>
                  ))}
                  <div className="rounded-xl p-3" style={{background:'var(--accent-soft)', border:'1px solid var(--border-subtle)'}}>
                    <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>
                      <strong style={{color:'var(--text-1)'}}>Recommendation:</strong> {(() => {
                        // "ollama" ist zugleich suggestProvider's Nichts-gefunden-
                        // Default — ohne Verfügbarkeits-Check behauptete der Wizard
                        // "Ollama found", obwohl gerade "not found" stand.
                        const gefunden = detected.some(d => d.available && d.models.length > 0);
                        if (!gefunden) return 'No local AI found — you can install Ollama later or enter a cloud key. KEPTA works anyway, with the starter pack.';
                        const empfehlung = suggestProvider(detected);
                        return empfehlung === 'ollama' ? 'Ollama found — KEPTA uses it, free and offline.'
                          : empfehlung === 'lmstudio' ? 'LM Studio found — set as the provider.'
                          : 'No local AI found — you can install Ollama later or enter a cloud key. KEPTA works anyway, with the starter pack.';
                      })()}
                    </p>
                  </div>
                  <button onClick={()=>{setScanning(true); detectLocalAIs().then(d=>{setDetected(d); setScanning(false);});}} className="btn-ghost w-full py-2 rounded-xl text-sm">Scan again</button>
                </div>
              )}
            </motion.div>
          )}
          {step===4 && (
            <motion.div key="s4" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><PartyPopper className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Almost there — filling your brain</div>
              <div className="hud-panel rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-soft)'}}><User className="w-4.5 h-4.5" style={{color:'var(--accent)'}}/></div>
                  <div>
                    <div className="text-sm font-semibold" style={{color:'var(--text-1)'}}>{name.trim()||'You'}{topics.length ? ` — ${topics.join(', ')}` : ''}</div>
                    <div className="text-xs" style={{color:'var(--text-2)'}}>{goal || 'Goal: collect knowledge and answer faster'}</div>
                    {customNote && <div className="text-xs mt-1" style={{color:'var(--text-3)'}}>“{customNote}”</div>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{color:'var(--text-1)'}}>{starterPreview.length}</div><div className="hud-label">entries</div></div>
                  <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{color:'var(--text-1)'}}>{topics.length}</div><div className="hud-label">topics</div></div>
                  <div className="hud-inset rounded-lg p-2.5"><div className="text-lg font-semibold tnum" style={{color:'var(--ok)'}}>{detected?.filter(d=>d.available).length || 0}</div><div className="hud-label">Local AI</div></div>
                </div>
                <ul className="text-xs space-y-1.5" style={{color:'var(--text-2)'}}>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> The starter pack is saved as real nodes — editable and deletable</li>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> Provider auto-configured ({detected ? suggestProvider(detected) : '...' })</li>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> Profile saved locally — every answer adapts to your goal</li>
                </ul>
              </div>
              <label className="hud-inset rounded-xl p-3 flex gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scanAngefragt}
                  onChange={(e)=> setScanAngefragt(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>
                  <strong style={{color:'var(--text-1)'}}>Also look through this computer for documents.</strong>{' '}
                  KEPTA can read the documents in your home folder and turn them into notes — everything stays on this
                  machine. Keys, passwords, credentials and browser data are never read. You will see exactly what would
                  be imported and can still say no.
                </span>
              </label>
              <div className="hud-inset rounded-xl p-3 flex gap-3">
                <Globe className="w-4 h-4 mt-0.5 shrink-0" style={{color:'var(--text-3)'}}/>
                <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>After this: drop files or POST /api/clip — KEPTA keeps learning. Another person on another machine sees entirely different suggestions here.</p>
              </div>
              {importResult && <div className="rounded-xl p-3 text-sm text-center" style={{background:'color-mix(in srgb, var(--ok) 12%, transparent)', border:'1px solid color-mix(in srgb, var(--ok) 30%, transparent)', color:'var(--ok)'}}>{importResult}</div>}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div className="p-4 flex items-center justify-between" style={{borderTop:'1px solid var(--border-subtle)'}}>
          <button onClick={()=> step>1 ? setStep((s=> (s-1) as Step)) : onClose()} className="btn-ghost px-4 py-2 rounded-xl text-sm flex items-center gap-2"><ChevronLeft className="w-4 h-4"/>{step===1 ? 'Later' : 'Back'}</button>
          {step<4 ? (
            <button onClick={()=> setStep((s=> (s+1) as Step))} disabled={step===1 && !name.trim()} title={step===1 && !name.trim() ? 'A name first — or leave the setup any time with „Later".' : undefined} className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4"/>
            </button>
          ) : (
            <button onClick={handleFinish} disabled={importing} className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin"/> Filling your brain…</> : <><Sparkles className="w-4 h-4"/> Create my brain — {starterPreview.length} nodes</>}
            </button>
          )}
        </div>
      </motion.div>
    </aside>
  );
}
