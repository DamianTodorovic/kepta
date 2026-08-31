import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, ChevronRight, ChevronLeft, Cpu, Database, Search, Globe, FolderOpen, User, Target, Loader2, Plug, PartyPopper } from 'lucide-react';
import { USECASE_LABELS, type UseCase, type DetectedAI, detectLocalAIs, suggestProvider, saveProfile, createDefaultProfile, type UserProfileAdaptive } from '../lib/profile';
import { loadAISettings, saveAISettings, providerById } from '../lib/ai';
import starterPacks from '../data/starter-packs.json';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (profile: UserProfileAdaptive, importedCount: number) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

function buildStarterForCases(cases: UseCase[]): { title: string; content: string; tags: string[] }[] {
  const base = (starterPacks as any)._base as any[];
  let result = [...base];
  for (const uc of cases) {
    const pack = (starterPacks as any)[uc];
    if (Array.isArray(pack)) result = result.concat(pack);
  }
  // Dedupe by title
  const seen = new Set<string>();
  return result.filter(n => { if (seen.has(n.title)) return false; seen.add(n.title); return true; });
}

export function OnboardingWizard({ open, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<UseCase[]>(['ki']);
  const [goal, setGoal] = useState('');
  const [detected, setDetected] = useState<DetectedAI[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDetected(null);
    setImportResult(null);
  }, [open]);

  useEffect(() => {
    if (open && step === 3 && detected === null && !scanning) {
      setScanning(true);
      detectLocalAIs().then(d => { setDetected(d); setScanning(false); }).catch(()=> setScanning(false));
    }
  }, [open, step, detected, scanning]);

  const toggleCase = (uc: UseCase) => {
    setSelected(prev => prev.includes(uc) ? prev.filter(x=>x!==uc) : [...prev, uc].slice(0,4));
  };

  const handleFinish = async () => {
    const starter = buildStarterForCases(selected.length ? selected : ['ki']);
    setImporting(true);
    setImportResult(null);
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
        displayName: name.trim() || 'Du',
        useCases: selected,
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
      setImportResult(`${imported} Knoten für dich erstellt`);
      setTimeout(()=> onComplete(profile, imported), 900);
    } catch (e:any) {
      setImportResult(e.message||'Fehler');
    } finally { setImporting(false); }
  };

  if (!open) return null;

  const starterPreview = buildStarterForCases(selected.length ? selected : ['ki']);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 hud-backdrop" onClick={onClose} />
      <motion.div initial={{scale:0.96, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.96, opacity:0}}
        className="relative w-full max-w-2xl max-h-[86vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col" style={{background:'var(--bg-panel-solid)', border:'1px solid var(--border-subtle)'}}>
        {/* Progress */}
        <div className="h-1.5 w-full flex gap-1 p-1" style={{background:'var(--bg-inset)'}}>
          {[1,2,3,4].map(i=> <div key={i} className="flex-1 rounded-full transition-all" style={{background: step>=i ? 'linear-gradient(90deg, var(--accent), var(--accent-2))' : 'var(--border-subtle)', opacity: step>=i?1:0.5}} />)}
        </div>
        <div className="px-6 pt-5 pb-3 flex items-center gap-3" style={{borderBottom:'1px solid var(--border-subtle)'}}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'linear-gradient(135deg, var(--accent), var(--accent-2))'}}><Sparkles className="w-5 h-5 text-white" /></div>
          <div className="flex-1">
            <h2 className="font-bold flex items-center gap-2" style={{color:'var(--text-1)'}}>Dein Gehirn passt sich dir an <span className="hud-label px-1.5 py-0.5 rounded" style={{background:'var(--accent-soft)', color:'var(--accent)', border:'1px solid var(--border-subtle)'}}>adaptiv</span></h2>
            <p className="text-xs mt-0.5" style={{color:'var(--text-2)'}}>Schritt {step} von 4 — 30 Sekunden, danach ist es dein Unikat.</p>
          </div>
          <span className="hud-label">{step}/4</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
          {step===1 && (
            <motion.div key="s1" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-5">
              <div className="flex items-center gap-2 hud-label"><User className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Wer bist du?</div>
              <div>
                <label className="hud-label block mb-2">Name (wie soll dich das Gehirn nennen?)</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="z.B. Damian" autoFocus className="hud-input w-full rounded-xl px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="hud-label block mb-2 flex items-center gap-2"><Target className="w-3.5 h-3.5"/> Dein Ziel mit dem Gehirn</label>
                <input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="z.B. Angelshop skalieren, Klausuren rocken, KI-Projekte bauen" className="hud-input w-full rounded-xl px-4 py-3 text-sm" />
                <p className="text-xs mt-2" style={{color:'var(--text-3)'}}>Wird in den System-Prompt eingewoben — Antworten passen sich deinem Ziel an.</p>
              </div>
              <div className="hud-inset rounded-xl p-3 flex gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-soft)'}}><Plug className="w-4 h-4" style={{color:'var(--accent)'}}/></div>
                <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>Gleich scannt das Gehirn lokal welche KIs du installiert hast (Ollama, LM Studio). Kein Key, keine Cloud — nur localhost-Pings.</p>
              </div>
            </motion.div>
          )}
          {step===2 && (
            <motion.div key="s2" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Database className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Wofür nutzt du dein Gehirn? (max 4)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(USECASE_LABELS) as UseCase[]).map(uc=>{
                  const info = USECASE_LABELS[uc];
                  const on = selected.includes(uc);
                  return (
                    <button key={uc} onClick={()=>toggleCase(uc)} className={`text-left p-3 rounded-xl border transition-all flex gap-3 ${on ? 'hud-inset' : 'hover:bg-[var(--bg-inset)]'}`} style={{borderColor: on ? 'var(--accent)' : 'var(--border-subtle)', background: on ? 'var(--accent-soft)' : undefined}}>
                      <span className="text-xl leading-none">{info.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium" style={{color: on ? 'var(--text-1)' : 'var(--text-2)'}}>{info.label}</span>
                        <span className="block text-xs truncate" style={{color:'var(--text-3)'}}>{info.desc}</span>
                      </span>
                      {on && <Check className="w-4 h-4 shrink-0 mt-1" style={{color:'var(--accent)'}}/>}
                    </button>
                  );
                })}
              </div>
              <div className="hud-inset rounded-xl p-3">
                <div className="hud-label mb-2">Vorschau Starter-Pack für dich: {starterPreview.length} Knoten</div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {starterPreview.map(n=> <span key={n.title} className="px-2 py-1 rounded-lg text-xs hud-inset" style={{color:'var(--text-2)'}}>{n.title}</span>)}
                </div>
              </div>
              <div>
                <label className="hud-label block mb-2">Noch etwas Besonderes? (optional)</label>
                <input value={customNote} onChange={e=>setCustomNote(e.target.value)} placeholder="z.B. Fokus auf Karpfen, Next.js, Bio-Klausur..." className="hud-input w-full rounded-xl px-4 py-2.5 text-sm" />
              </div>
            </motion.div>
          )}
          {step===3 && (
            <motion.div key="s3" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><Cpu className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Deine KIs — lokal erkannt</div>
              {scanning && <div className="hud-inset rounded-xl p-6 flex items-center gap-3"><Loader2 className="w-5 h-5 animate-spin" style={{color:'var(--accent)'}}/><span className="text-sm" style={{color:'var(--text-2)'}}>Scanne localhost:11434 und :1234…</span></div>}
              {!scanning && detected && (
                <div className="space-y-2">
                  {detected.map(d=>(
                    <div key={d.id} className="hud-inset rounded-xl p-3 flex items-center gap-3" style={{borderColor: d.available ? 'color-mix(in srgb, var(--ok) 35%, var(--border-subtle))' : undefined}}>
                      <span className={`w-2.5 h-2.5 rounded-full ${d.available ? 'bg-emerald-500' : 'bg-zinc-400'}`} style={{boxShadow: d.available ? '0 0 8px var(--ok)' : undefined}}/>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{color:'var(--text-1)'}}>{d.label} {d.available ? '· verfügbar' : '· nicht gefunden'}</div>
                        <div className="text-xs truncate" style={{color:'var(--text-3)'}}>{d.models.length ? d.models.slice(0,4).join(', ') + (d.models.length>4?` +${d.models.length-4}`:'') : d.available ? 'keine Modelle geladen (ollama pull ...)' : 'nicht installiert'}</div>
                      </div>
                      {d.available && <span className="text-xs hud-label px-1.5 py-1 rounded hud-inset" style={{color:'var(--ok)'}}>{d.latencyMs}ms</span>}
                    </div>
                  ))}
                  <div className="rounded-xl p-3" style={{background:'var(--accent-soft)', border:'1px solid var(--border-subtle)'}}>
                    <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>
                      <strong style={{color:'var(--text-1)'}}>Empfehlung:</strong> {suggestProvider(detected)==='ollama' ? 'Ollama gefunden — Gehirn nutzt es kostenlos & offline.' : suggestProvider(detected)==='lmstudio' ? 'LM Studio gefunden — wird als Provider gesetzt.' : 'Keine lokale KI gefunden — du kannst später Ollama installieren oder einen Cloud-Key eintragen. Gehirn funktioniert trotzdem mit Starter-Pack.'}
                    </p>
                  </div>
                  <button onClick={()=>{setScanning(true); detectLocalAIs().then(d=>{setDetected(d); setScanning(false);});}} className="btn-ghost w-full py-2 rounded-xl text-sm">Erneut scannen</button>
                </div>
              )}
            </motion.div>
          )}
          {step===4 && (
            <motion.div key="s4" initial={{x:20, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-20, opacity:0}} className="space-y-4">
              <div className="hud-label flex items-center gap-2"><PartyPopper className="w-3.5 h-3.5" style={{color:'var(--accent)'}}/> Gleich fertig — dein Gehirn wird befüllt</div>
              <div className="hud-panel rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:'linear-gradient(135deg, var(--accent), var(--accent-2))'}}><User className="w-5 h-5 text-white"/></div>
                  <div>
                    <div className="text-sm font-semibold" style={{color:'var(--text-1)'}}>{name.trim()||'Du'} · {selected.map(s=>USECASE_LABELS[s].label).join(' · ') || 'Allgemein'}</div>
                    <div className="text-xs" style={{color:'var(--text-2)'}}>{goal || 'Ziel: Wissen sammeln & schneller antworten'}</div>
                    {customNote && <div className="text-xs mt-1" style={{color:'var(--text-3)'}}>“{customNote}”</div>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="hud-inset rounded-xl p-2.5"><div className="text-lg font-bold" style={{color:'var(--accent)'}}>{starterPreview.length}</div><div className="hud-label">Knoten</div></div>
                  <div className="hud-inset rounded-xl p-2.5"><div className="text-lg font-bold" style={{color:'var(--accent)'}}>{selected.length||1}</div><div className="hud-label">Bereiche</div></div>
                  <div className="hud-inset rounded-xl p-2.5"><div className="text-lg font-bold" style={{color:'var(--ok)'}}>{detected?.filter(d=>d.available).length || 0}</div><div className="hud-label">KIs lokal</div></div>
                </div>
                <ul className="text-xs space-y-1.5" style={{color:'var(--text-2)'}}>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> Starter-Pack wird als echte Knoten gespeichert (editier-/löschbar)</li>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> Provider automatisch konfiguriert ({detected ? suggestProvider(detected) : '...' })</li>
                  <li className="flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5" style={{color:'var(--ok)'}}/> Profil lokal gespeichert — jede Antwort passt sich deinem Ziel an</li>
                </ul>
              </div>
              <div className="hud-inset rounded-xl p-3 flex gap-3">
                <Globe className="w-4 h-4 mt-0.5 shrink-0" style={{color:'var(--text-3)'}}/>
                <p className="text-xs leading-relaxed" style={{color:'var(--text-2)'}}>Danach: Dateien droppen oder `Post /api/clip` — Gehirn lernt weiter. Anderer Nutzer auf anderem Mac sieht hier komplett andere Vorschläge.</p>
              </div>
              {importResult && <div className="rounded-xl p-3 text-sm text-center" style={{background:'color-mix(in srgb, var(--ok) 12%, transparent)', border:'1px solid color-mix(in srgb, var(--ok) 30%, transparent)', color:'var(--ok)'}}>{importResult}</div>}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div className="p-4 flex items-center justify-between" style={{borderTop:'1px solid var(--border-subtle)'}}>
          <button onClick={()=> step>1 ? setStep((s=> (s-1) as Step)) : onClose()} className="btn-ghost px-4 py-2 rounded-xl text-sm flex items-center gap-2"><ChevronLeft className="w-4 h-4"/>{step===1 ? 'Später' : 'Zurück'}</button>
          {step<4 ? (
            <button onClick={()=> setStep((s=> (s+1) as Step))} disabled={(step===1 && !name.trim()) || (step===2 && selected.length===0)} className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40">
              Weiter <ChevronRight className="w-4 h-4"/>
            </button>
          ) : (
            <button onClick={handleFinish} disabled={importing} className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin"/> Befülle Gehirn…</> : <><Sparkles className="w-4 h-4"/> Gehirn erstellen · {starterPreview.length} Knoten</>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
