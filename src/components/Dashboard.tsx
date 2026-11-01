import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './huelle.css';
import { Sidebar } from './Sidebar';
import { MemoryCard } from './MemoryCard';
import { MemoryEditor } from './MemoryEditor';
import { MemoryPreview } from './MemoryPreview';
import { Chat } from './Chat';
import { hydrateAISettings } from '../lib/ai';
import { hydratePrefs, spiegelePrefs } from '../lib/prefs';
import { QUITTUNG_MS } from '../lib/quittung';
import { Settings } from './Settings';
import { KnowledgeGraph } from './KnowledgeGraph';
import { TodayView } from './TodayView';
import { DossierView } from './DossierView';
import { TeamView } from './TeamView';
import { ActivityView } from './ActivityView';
import { CommandPalette, useCommandPaletteHotkey, buildPaletteActions } from './CommandPalette';
import { saveMemory, deleteMemory, subscribeMemories, refreshMemories, deleteMemories, restoreMemories, bestandGroesse, ladeFehler, getMemoriesSync, mehrAnholen, seiteIstBegrenzt, seitenFehler, SEITE_NACHLAD, letzteAblehnung } from '../lib/store';
import type { BehauptungEingabe } from '../core/wortschatz';
import { subscribeActivity } from '../lib/activity';
import { inForm } from '../lib/antwort';
import { useToast } from './ui/Toast';
import { hybridSearch, type ScoredMemory } from '../lib/semantic';
import { useSuchPrefs, leseTreffer, normalisiereTreffer, schreibeTreffer, SUCH_PREFS_EVENT, RESULT_STOPS } from '../lib/searchPrefs';
import { OnboardingWizard } from './OnboardingWizard';
import { DuplicatesPanel, loadDismissed } from './DuplicatesPanel';
import { MachineScan } from './MachineScan';
import { findDuplicateGroups, redundantCount } from '../lib/duplicates';
import { loadProfile } from '../lib/profile';
import { KeptaMark } from './KeptaMark';
import { Memory } from '../types';
import { parseQuelle, oeffneQuelle, type Quelle } from '../lib/quelle';
import { pdfTextAusBuffer } from '../lib/pdfText';
import { TYP_BESCHREIBUNG, TRAEGER_FRAGE, TRAEGER_FRAGE_SATZ, THEMA_FRAGE, TRAEGER_LABELS, TRAEGER_REIHENFOLGE, TRAEGER_HINWEISE, THEMA_LABELS, THEMA_REIHENFOLGE, THEMA_HINWEISE, gruppenVonNotiz, zahlDerAuswahl, type Traeger, type Thema, type AchsenZahlen } from '../lib/graphHierarchy';
import { t, wendeZoomAn } from '../lib/uiText';
import { Search, Plus, CheckCircle2, Copy, PanelLeftOpen, ScanSearch, UploadCloud, Globe, Loader2, AlertCircle, Sparkles, Trash2, HardDriveDownload, FileText, ExternalLink, ShieldCheck } from "../lib/icons";
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type ViewKey = 'memories' | 'today' | 'chat' | 'graph' | 'dossier' | 'activity' | 'team' | 'settings';

/**
 * Was "alles" gegenueber der Engine bedeutet — dieselbe Grenze wie im Kern.
 * Die Stufen des Ergebnisreglers (5..250..0) leben in lib/searchPrefs —
 * die Einstellungen zeigen denselben Regler und schreiben dieselben Schlüssel.
 */
interface InboxStatus { inboxDir?: string; files: string[]; archiveCount: number; watching: boolean }
// Die Form, die die Leiste liest. `files: [""]` erklärt, dass die Liste Zeilen
// enthält — ein Muster-Element ist Form, nicht Inhalt.
const LEERE_INBOX: InboxStatus = { inboxDir: '', files: [''], archiveCount: 0, watching: false };

/**
 * Eine Zahl ohne ihre Menge ist eine Seitenlänge, die sich als Bestand ausgibt.
 *
 * `GET /api/memories` antwortet seit F12 mit einer Seite und führt den Bestand
 * im Leib (`total`) und im Kopf (`x-kepta-total`); src/lib/store.ts:40-47 hebt
 * ihn heraus. Wo die Fläche nur einen Teil malt, sagt sie „100 of 14,702 in the
 * store" — und wo die Tür schweigt, zählt sie nur, was sie trägt, statt aus der
 * eigenen Seitenlänge eine Menge zu erfinden.
 */
/**
 * Dieselbe Zahl, dasselbe Kleid. Der Index-Held schreibt „14,702"; der
 * Gehirn-Chip daneben schrieb „14702" — zwei Kleider, eine Zahl, ein Bildschirm.
 * Gilt für Größen, die die Tür aus dem *ganzen* Bestand meldet (`/api/health`),
 * nicht für Seitenzähler, die bei 200 enden.
 */
function groessenZahl(n: number): string {
  return n.toLocaleString('en-GB');
}

/**
 * Der Anteil eines Fachs an der Menge, die die Zeile selbst schon nennt.
 *
 * Grund, dass die Menge allein nicht reicht (Punkt 5, Fix 4, gemessen 16.10. an Damians
 * echtem Bestand): "92 Notes" sieht aus wie eine Zahl unter vielen, und 92 von 21 066 ist
 * die einzige Auskunft an seinem Bild, die etwas ueber sein Wissen sagt — 0,44 % selbst
 * getippt, der Rest hereingekommen.
 *
 * Unter einem Zehntel Prozent steht "< 0.1 %", nie eine gerundete 0 %: ein Fach, das ein
 * Stueck haelt, ist mit "0 %" als leer verabschiedet, und das ist eine Absage an den Leser,
 * keine Zahl. Ebenso oben: "100 %" behauptet ein alleiniges Fach.
 *
 * Die 100 % haben ein Bild von sich selbst verraten — im ausgelieferten 3.2.94 stand bei einem
 * Bestand, der nur ein Fach fuellt, "74 Notes 100.0 %" (eigner Schuss 23:51, eigne
 * Sichtpruefung). Hundert Prozent einer Menge, aus der nichts andres kommt, sind dieselbe Zahl
 * in einem zweiten Gewand, nicht eine Auskunft. Darum: unter zwei vollen Faechern bleibt die
 * Zeile ohne Anteil.
 */
function anteilZahl(n: number, gesamt: number, faelter: number): string {
  if (!(gesamt > 0) || faelter < 2) return '';
  const anteil = (100 * n) / gesamt;
  if (anteil < 0.1) return '< 0.1 %';
  if (anteil > 99.9) return '>99.9 %';
  return `${anteil.toFixed(1)} %`;
}

function mengensatz(gemalt: number, bestand: number | null, menge = 'in the store'): string {
  const zahl = groessenZahl;
  const entries = (n: number) => `${zahl(n)} ${n === 1 ? 'entry' : 'entries'}`;
  if (bestand === null) return entries(gemalt);
  if (bestand > gemalt) return `${zahl(gemalt)} of ${zahl(bestand)} ${menge}`;
  return entries(bestand);
}

/**
 * Der eine Weg zur nächsten Seite — Scroll-Beobachter und Knopf gehen beide hier durch, damit die
 * Fläche nie zwei Arten hat, dieselbe Seite zu holen. Der Grund eines Ausfalls wird gesetzt, nie
 * verschluckt (`BRIEF-SEITE-100-20-10.md`, Zweitbefund).
 */
async function holeNaechsteSeite(setzen: (text: string | null) => void): Promise<void> {
  try {
    const neu = await mehrAnholen();
    setzen(neu > 0 ? null : seitenFehler());
  } catch {
    setzen(seitenFehler());
  }
}

const ALL_RESULTS = 10_000;
/**
 * Der Chat bekommt weiterhin nur eine Handvoll Knoten. Der Regler steuert die
 * ANZEIGE; 361 Notizen in einen LLM-Aufruf zu schieben waere teuer und schlechter.
 */
const CHAT_CONTEXT_LIMIT = 25;

function resultLabel(v: number): string {
  return v === 0 ? 'All' : String(v);
}

function chunkText(text: string, size = 2000): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (lastBreak > size * 0.55) end = start + lastBreak + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    // pdf.js mit CMaps vom lokalen Server — eingebettete Schriften dekodieren
    // zu Buchstaben statt Glyph-Namen (gleiche Extraktion wie der Scan).
    const text = await pdfTextAusBuffer(buf);
    if (text) return text;
    return `[PDF: ${file.name} – no extractable text, raw size ${file.size} bytes]`;
  }
  return await file.text();
}

/**
 * Ab wie viel Kastenbreite der schmückende Satz der Graph-Kopfzeile stehen bleibt.
 * 390 px, weil der Satz in diesem Fenster 387 px braucht (gemessen 15.10., Kasten
 * 343 px → Ende war abgeschnitten). Darunter bleibt nur die Zählung stehen.
 */
const SATZ_BREITE_MIN = 390;

/**
 * Die drei Fächer des Index-Streifens mit ihrer Farbe. Die Eigenschaft heisst `color`,
 * nicht `farbe`: `scripts/design-wache.mjs` sammelt Schriftfarben über das Wort
 * `color: var(--…)`, und ein umgetauftes Feld verschwindet still aus der Kontrast-Wache —
 * gemessen 22.10. 21:09:14, wo die Ruhe-Ebenen-Wache von 22 auf 16 Zeilen fiel.
 */
const TRAEGER_KLEID: { key: Traeger; color: string }[] = [
  { key: 'notes', color: 'var(--type-semantic)' },
  { key: 'files', color: 'var(--type-reference)' },
  { key: 'code', color: 'var(--type-procedural)' },
  // Derselbe Ton wie im Regal ueber dem Graphen (`GraphRegal.tsx → TRAEGER_TOKEN`): zwei
  // Flaechen, die dasselbe Fach in zwei verschiedenen Farben zeigen, sind zwei Luegen.
  { key: 'daten', color: 'var(--type-episodic)' },
  { key: 'anderes', color: 'var(--type-neutral)' },
];

export function Dashboard() {
  const toast = useToast();
  // Die Textgroesse gilt ab dem ersten Bild; geaendert wird sie in den Einstellungen.
  // AI-Settings rehydrieren (26.9.-Audit): das localStorage hängt am
  // Random-Port-Origin und ist nach jedem Neustart leer — die DB-Spiegelung
  // (lib/ai.ts) liefert Provider, Modell und API-Schlüssel zurück. Der
  // aiBereit-Zähler zwingt zum Neulesen, NACHDEM die Werte da sind.
  const [aiBereit, setAiBereit] = useState(0);
  useEffect(() => {
    let cancelled = false;
    hydrateAISettings().then(() => { if (!cancelled) setAiBereit(z => z + 1); });
    return () => { cancelled = true; };
  }, []);
  // Dieselbe Rettung für alle Nutzer-Präferenzen (Semantic, TopK, Gruppierung,
  // Wizard, AutoLearn, Profil): Hydration beim Start, Spiegel im Takt — der
  // Random-Port-Origin verliert sonst JEDE Einstellung.
  //
  // (b) aus dem A1-Nachtrag: Lesen und Schreiben sind hier zwei verschiedene
  // Entscheidungen, und keine darf der anderen zuvorkommen. Vor dem Lesen
  // schrieb der erste Spiegel-Lauf eine Spiegelung ohne den Assistenten-Merker
  // über die alte — der Nutzer war seine Entscheidung los. Und der Wecker konnte
  // den Assistenten vor dem Merker zeigen. Also: erst die Antwort abwarten, dann
  // spiegeln, dann — siehe unten — allenfalls der Assistent.
  const [praeferenzenGelesen, setPraeferenzenGelesen] = useState(false);
  useEffect(() => {
    let offen = true;
    let takt: ReturnType<typeof setInterval> | null = null;
    void hydratePrefs().then(() => {
      if (!offen) return;
      setAiBereit((z) => z + 1);
      setPraeferenzenGelesen(true);
      spiegelePrefs();
      takt = setInterval(spiegelePrefs, 10_000);
    });
    return () => {
      offen = false;
      if (takt) clearInterval(takt);
    };
  }, []);
  const [memories, setMemories] = useState<Memory[]>([]);
  /** Was die Tür über den Bestand sagt — `null`, wenn sie schweigt. */
  const [tuerBestand, setTuerBestand] = useState<number | null>(null);
  /** Grund des letzten Seiten-Nachladens, oder null. Ein stiller Fang wäre der Zweitbefund des
   *  Briefs `BRIEF-SEITE-100-20-10.md` — die Fußzeile malt ihn, statt ihn zu verschlucken. */
  const [seitenHinweis, setSeitenHinweis] = useState<string | null>(null);
  /** Was das FELD malt, gemeldet von der Graph-Fläche (#101). `null`, solange
   *  sie noch nichts weiß — dann nennt der Kopf die Liste, die er wirklich hat. */
  const [feldZaehlung, setzeFeldZaehlung] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<ViewKey>('memories');
  /** Das Dossier, das von außen geöffnet wurde — ein Klick im Graphen. */
  const [dossierThema, setDossierThema] = useState<{ text: string; nr: number } | undefined>(undefined);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Klick auf eine Karte oeffnet die lesbare Vorschau — der Editor kommt nur
  // noch ueber deren „Edit“-Knopf.
  const [vorschauMemory, setVorschauMemory] = useState<Memory | null>(null);
  // Eine Organisation kann Rollen setzen (managed-settings.json). Nur wenn das
  // geschehen ist, führt der Weg zu Team — sonst wäre der Punkt eine Sackgasse.
  // Dieselbe Frische-Regel wie früher bei der Lizenz: beim Start und bei
  // Fokuswechsel nachfragen, weil die Datei im Betrieb ergänzt werden kann.
  const [teamVorhanden, setTeamVorhanden] = useState(false);
  // Gruppierung der Liste: Alle (flach), Nach Datei, Nach Typ, Zeitraum.
  const [gruppierung, setGruppierung] = useState<'alle' | 'datei' | 'typ' | 'zeitraum'>(() => {
    try {
      const v = localStorage.getItem('ki_gehirn_gruppierung');
      return v === 'datei' || v === 'typ' || v === 'zeitraum' ? v : 'alle';
    } catch { return 'alle'; }
  });
  useEffect(() => {
    try { localStorage.setItem('ki_gehirn_gruppierung', gruppierung); } catch { /* ignore */ }
  }, [gruppierung]);

  /**
   * Zeile 1 (Notes · Files · Code) und Zeile 2 (sechs Themen) als Filter.
   * Leer heisst "alle" — die Chips sind eine Verfeinerung, kein Pflichtfeld,
   * und ein Nutzer soll die Liste ohne jede Auswahl lesen koennen.
   *
   * Nicht in den Praeferenzen gespeichert, entschieden, weil: ein gemerkter
   * Filter versteckt beim naechsten Start Notize. Der Traeger ist aus den Daten
   * ableitbar, die Auswahl nicht — wer nur "Code" sah, findet seine Notizen
   * sonst nicht wieder.
   */
  const [aktiveTraeger, setAktiveTraeger] = useState<Traeger[]>([]);
  const [aktiveThemen, setAktiveThemen] = useState<Thema[]>([]);
  const nurCode = aktiveTraeger.length > 0 && aktiveTraeger.every((t) => t === 'code');
  const gruppenFilterAktiv = aktiveTraeger.length > 0 || aktiveThemen.length > 0;

  /**
   * Warum die Liste leer ist, in einem Satz, den der Nutzer selbstloest. Ein
   * leerer Gruppenfilter ist kein "noch nichts angelegt" — der Bestand ist da,
   * nur diese Auswahl trifft ihn nicht. Die drei Stellen, die das bisher
   * verschwiegen haben: Kopfzeile, Absatz, und dass die Zeilen gleich mit der
   * Liste aus dem Baum fielen (GF, v6-code-leer.png).
   */
  const gruppenListe = (w: string[]) =>
    w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
  const gruppenGrund = aktiveTraeger.length > 0
    ? `in ${gruppenListe(aktiveTraeger.map((t) => TRAEGER_LABELS[t]))}` +
      (aktiveThemen.length > 0 ? ` about ${gruppenListe(aktiveThemen.map((t) => THEMA_LABELS[t]))}` : '')
    : `filed under ${gruppenListe(aktiveThemen.map((t) => THEMA_LABELS[t]))}`;

  // Schlüssel, gratis erster Tag und Upgrade-Weg sind seit 09.10.2026 weg: die herunterladbare
  // App läuft unbegrenzt und hat kein Schlüssel-Feld. Was hier blieb, ist der
  // Rest der Seitenleisten-Inhalte.
  useEffect(() => {
    const frage = () => {
      fetch('/api/team').then(r => (r.ok ? r.json() : null)).then(d => {
        setTeamVorhanden(Boolean(d?.team));
      }).catch(() => { /* der Hintergrundserver meldet sich, wenn er bereit ist */ });
    };
    frage();
    const beiFokus = () => { if (document.visibilityState !== 'hidden') frage(); };
    window.addEventListener('focus', beiFokus);
    document.addEventListener('visibilitychange', beiFokus);
    return () => {
      window.removeEventListener('focus', beiFokus);
      document.removeEventListener('visibilitychange', beiFokus);
    };
  }, []);
  const [copied, setCopied] = useState(false);
  // `copied` ist ein Umschalter, keine Marke: zwei Kopien in Folge teilen sich
  // dasselbe true. Jeder neue Klick wirft deshalb den alten Timer weg — sonst
  // löscht er die frische Bestätigung, bevor die sechs Sekunden um sind.
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Die Leiste ist 256 px breit. In einem Fenster unter der `md`-Grenze sind das
   * zwei Drittel des Bildschirms, und die Fläche daneben — der Graph, die Liste —
   * bekommt nur noch einen Streifen. Also startet sie eingeklappt, wenn das
   * Fenster beide nicht trägt. Wer sie will, holt sie mit dem Knopf, den es
   * dafür schon gibt; die Entscheidung bleibt beim Menschen, nur die Reihenfolge
   * stimmt jetzt mit der Breite.
   *
   * Die Breite wird nicht beim Start gefühlt: ein Fenster, das während des Laufs
   * schmaler wird (oder wird), ließ die Leiste stehen, wo sie beim Mount stand —
   * bei 390 px blieb der Fläche ein Streifen von 80 × 418 px (A7-06, gemessen
   * 09.10.2026). Also fragt der Rahmen bei jeder Breitenänderung neu.
   */
  const [schmal, setSchmal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const beiBreite = () => setSchmal(window.innerWidth < 768);
    window.addEventListener("resize", beiBreite);
    window.addEventListener("orientationchange", beiBreite);
    return () => {
      window.removeEventListener("resize", beiBreite);
      window.removeEventListener("orientationchange", beiBreite);
    };
  }, []);
  const [isFocusMode, setIsFocusMode] = useState(schmal);
  /**
   * Passt der schmückende Satz in der Graph-Kopfzeile in seinen Kasten?
   *
   * Die Geräteklasse `schmal` erwischte das 820-er Fenster nicht, obwohl der Kasten
   * dort nur 343 px hatte und der Satz 387 brauchte — Ergebnis war ein Satz mit
   * abgeschnittenem Ende. Also misst die Flaeche ihren eigenen Platz. Der Kasten
   * wächst nicht mit dem Inhalt (min-w-0, truncate), darum rueckt die Messung nicht
   * mit dem Text und kann nicht zwischen zwei Zuständen hin- und herspringen.
   */
  const satzKastenRef = useRef<HTMLDivElement | null>(null);
  const [satzPasst, setSatzPasst] = useState(true);
  useEffect(() => {
    const kasten = satzKastenRef.current;
    if (!kasten || typeof ResizeObserver === "undefined") return;
    const pruefe = () => {
      // Kein Layout, kein Urteil: ein Rahmen ohne gemessene Breite (JSDOM kennt keine
      // Anordnung, und im ersten Takt nach dem Mount kann die Breite noch 0 sein)
      // darf den Satz nicht verstecken — sonst verschwindet er dort, wo gar nichts
      // gemessen wurde.
      if (kasten.clientWidth <= 0) return;
      setSatzPasst(kasten.clientWidth >= SATZ_BREITE_MIN);
    };
    const beobachter = new ResizeObserver(pruefe);
    beobachter.observe(kasten);
    pruefe();
    return () => beobachter.disconnect();
  }, []);
  const letzteBreitenklasse = useRef(schmal);
  useEffect(() => {
    // Nur das Umkippen der Breite entscheidet, nicht jeder Render — wer die
    // Leiste selbst geöffnet hat, dem räumt sie erst wieder ein anderer Knopf.
    if (letzteBreitenklasse.current === schmal) return;
    letzteBreitenklasse.current = schmal;
    setIsFocusMode(schmal);
  }, [schmal]);

  /**
   * Z-14: das Fenster weiß, ob es gerade den Schlüssel hat. macOS dimmt die
   * Traffic-Lights selbst (electron.js: `titleBarStyle: hiddenInset`), aber der
   * Inhalt wusste nichts davon — die Auswahl blieb siegelrot, als spräche
   * jemand anders. Gedämpft wird die Chrome (huelle.css), nie das Blatt, und
   * ein offener Dialog lässt den Zustand nicht verschwinden: der Schlüssel
   * gehört dem Fenster, nicht dem Panel.
   *
   * Der Start ist bewusst **optimistisch** und nicht aus `document.hasFocus()`:
   * ein kopfloser Browser hat nie den Schlüssel, und diese Wohnung
   * photographiert kopflos. Wäre der erste Zustand die Anfrage, erschiene in
   * jedem Produktbild eine gedämpfte Fläche. Die Dämpfung soll eintreten, wenn
   * das Fenster den Schlüssel *verliert* — nicht, wenn die Messung ihn nicht
   * fragen kann.
   */
  const [schluessel, setSchluessel] = useState(true);
  useEffect(() => {
    // Die Ereignisse selbst sind die Auskunft, nicht `document.hasFocus()`:
    // dem Fenster darf man den Verlust ansehen, auch wenn ein Renderer die
    // Frage in einem Randfall noch mit „ja" beantwortet.
    const an = () => setSchluessel(true);
    const aus = () => setSchluessel(false);
    const beiSichtbarkeit = () =>
      setSchluessel(document.visibilityState !== "hidden" && document.hasFocus());
    window.addEventListener("focus", an);
    window.addEventListener("blur", aus);
    document.addEventListener("visibilitychange", beiSichtbarkeit);
    return () => {
      window.removeEventListener("focus", an);
      window.removeEventListener("blur", aus);
      document.removeEventListener("visibilitychange", beiSichtbarkeit);
    };
  }, []);

  // Papierkorb
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedMemories, setTrashedMemories] = useState<Memory[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  /** Grund des letzten Papierkorb-Abrufs, oder null. `catch { /* ignore *\/ }` war der Zweitbefund
   *  des Briefs: ein kaputter Korb malte exakt denselben Satz wie ein leerer. */
  const [papierkorbGrund, setPapierkorbGrund] = useState<string | null>(null);
  /** Meldet die Tür eine Kappe, zeigt die Fläche eine Seite — nicht den ganzen Korb. */
  const [papierkorbKappe, setPapierkorbKappe] = useState<{ gezeigt: number; gesamt: number } | null>(null);
  useEffect(() => {
    if (!trashOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/memories?trash=1');
        const status = (res as { status?: number }).status ?? 200;
        // Defensiv gelesen wie in `store.ts`: eine Mock-Antwort ohne Status gilt als 200, eine ab 400
        // wirft — und ihr Grund malt die Zeile, statt im Fang zu verschwinden.
        if (status >= 400) throw new Error(`the local server answered HTTP ${status}`);
        const data = await res.json();
        // API liefert ein nacktes Array — defensiv auch {memories:[]} akzeptieren
        const list = Array.isArray(data) ? data : Array.isArray(data?.memories) ? data.memories : [];
        if (cancelled) return;
        setTrashedMemories(list as Memory[]);
        setPapierkorbGrund(null);
        const gesamt = typeof data?.total === 'number' ? data.total : null;
        setPapierkorbKappe(gesamt !== null && gesamt > list.length ? { gezeigt: list.length, gesamt } : null);
      } catch (err: unknown) {
        if (cancelled) return;
        setTrashedMemories([]);
        setPapierkorbKappe(null);
        setPapierkorbGrund(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [trashOpen]);

  // Erstes Laden: Skeletons statt leerem Grid
  const [initialLoaded, setInitialLoaded] = useState(false);
  // Eine abgewiesene Tür ist kein leerer Speicher. Gemessen 18.10. mit zwei
  // Läufen durch dieselbe Fläche: an einer Tür, die 500 antwortet, stand
  // exakt derselbe Satz wie bei einem leeren Bestand („No entries yet",
  // 0 von 0 Einträgen, 217 gegen 216 Knoten im Sieht) — kein Hinweis, kein
  // Knopf. `void` vor `.finally` warf die Ablehnung still weg (Zeile 363).
  const [ladFehler, setLadFehler] = useState<string | null>(null);
  const [ladVersuch, setLadVersuch] = useState(0);
  useEffect(() => {
    let abgebrochen = false;
    refreshMemories()
      .then(() => { if (!abgebrochen) setLadFehler(null); })
      .catch((e: unknown) => { if (!abgebrochen) setLadFehler(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!abgebrochen) setInitialLoaded(true); });
    return () => { abgebrochen = true; };
  }, [ladVersuch]);
  // Fenster-Fokus: Agenten schreiben evtl. aus anderen Prozessen — auffrischen
  useEffect(() => {
    const onFocus = () => void refreshMemories().catch(() => { /* Fenster-Fokus: Grund liegt im Speicher, gemalt 1906 */ });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Shortcuts: ⌘N = neuer Knoten, ? = Shortcuts-Sheet
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !typing) {
        e.preventDefault();
        setEditingMemory(null);
        setIsEditorOpen(true);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setShortcutsOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key) && !typing) {
        // Sheet verspricht ⌘1–4 — jetzt halten wir es auch (Finding B4); ⌘5–7 seit 2.13
        e.preventDefault();
        setCurrentView((['memories', 'chat', 'graph', 'settings', 'today', 'dossier', 'activity'] as const)[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Semantic search: Toggle + Top-k
  const [semanticEnabled, setSemanticEnabled] = useState<boolean>(() => {
    try { const v = localStorage.getItem('ki_gehirn_semantic'); return v === null ? true : v !== 'false'; } catch { return true; }
  });
  // Der Ergebnisregler lebt in lib/searchPrefs — die Einstellungen zeigen
  // denselben Regler; beide Flächen synchronisieren sich live über das Event.
  const [topK, setTopKState] = useState<number>(leseTreffer);
  const setTopK = useCallback((v: number) => {
    setTopKState(normalisiereTreffer(v));
    schreibeTreffer(v);
  }, []);
  useEffect(() => {
    const on = () => setTopKState(leseTreffer());
    window.addEventListener(SUCH_PREFS_EVENT, on);
    return () => window.removeEventListener(SUCH_PREFS_EVENT, on);
  }, []);
  // Suchtiefe + Spuren-Schalter (Paket 2): aus den Einstellungen, an jeden Search-Call.
  const [suchPrefs, setzeSuchPrefs] = useSuchPrefs();
  /** Was die Suche wirklich anfordert — 0 ("All") heisst: so viel, wie es gibt. */
  const effectiveLimit = topK === 0 ? ALL_RESULTS : topK;
  /**
   * Der Request-topk: nie unter der eingestellten Suchtiefe. Die Engine
   * fusioniert ihre drei Beine in dieser Tiefe — ANGEZEIGT wird der Stand
   * des Ergebnisreglers; tiefer zu suchen schneidet nichts ab, es verfeinert.
   */
  const anfrageLimit = topK === 0 ? ALL_RESULTS : Math.max(effectiveLimit, suchPrefs.tiefe);
  // Der Spiegel Ruf gehoert in den Effect: so stand er einmal pro Render im
  // Korper und bewarf die Settings-Route bei jeder Bewegung der Oberflaeche.
  useEffect(() => {
    try { localStorage.setItem('ki_gehirn_semantic', String(semanticEnabled)); } catch { /* ignore */ }
    spiegelePrefs();
  }, [semanticEnabled]);

  // 180ms Debounce für Suche — vermeidet hybridSearch bei jedem Keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Importer State
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  // URL-Clipper State
  const [clipUrl, setClipUrl] = useState("");
  const [clipping, setClipping] = useState(false);
  const [clipErr, setClipErr] = useState<string | null>(null);
  const [clipOk, setClipOk] = useState<string | null>(null);

  // Inbox Auto-Import — Gehirn liest immer mit (File-Watcher)
  const [inbox, setInbox] = useState<InboxStatus | null>(null);
  const [inboxScanBusy, setInboxScanBusy] = useState(false);
  const refreshInbox = useCallback(async ()=>{
    try {
      const r = await fetch('/api/inbox/status');
      if(!r.ok) return;
      const d = await r.json();
      // An der Grenze normalisiert, nicht später abgesichert: die Fläche liest
      // inbox.files.length direkt, und eine Teilantwort (Server im Hochlauf,
      // ältere Fassung, Teilauswertung) warf bisher die ganze Dashboard-Schicht
      // raus — derselbe Fehler, der einmal den Einstellungs-Bildschirm gekostet
      // hat. Auch files:"drei" wäre durchgerutscht und als „drei in Inbox"
      // aufgetaucht.
      setInbox(inForm(d, LEERE_INBOX));
    } catch {}
  }, []);
  useEffect(()=>{ refreshInbox(); const id=setInterval(refreshInbox, 12000); return ()=> clearInterval(id); }, [refreshInbox]);
  const handleInboxScan = async ()=>{
    setInboxScanBusy(true);
    try {
      const r = await fetch('/api/inbox/scan', {method:'POST'});
      const d = await r.json();
      const marke = `Inbox: ${d.scanned} files scanned, ${d.imported} nodes imported`;
      setImportMsg(marke);
      setTimeout(()=> setImportMsg((c) => (c === marke ? null : c)), QUITTUNG_MS);
      refreshInbox();
    } catch {
      const marke = 'Inbox scan failed';
      setImportErr(marke);
      setTimeout(() => setImportErr((c) => (c === marke ? null : c)), QUITTUNG_MS);
    } finally { setInboxScanBusy(false); }
  };

  // Duplikate: erkannt in src/lib/duplicates (Blocking statt Alle-gegen-alle,
  // vollstaendig statt "die ersten acht"). Was der Nutzer als "kein Duplikat"
  // markiert hat, bleibt draussen.
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  // Rechner-Scan: im Assistenten angeboten, hier geoeffnet. Der Wunsch wird
  // ueber localStorage weitergereicht, damit der Assistent nichts davon wissen muss.
  const [scanOpen, setScanOpen] = useState(false);
  /** Kommt der Dialog aus dem Assistenten, sieht er sofort nach. */
  const [scanAusAssistent, setScanAusAssistent] = useState(false);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => loadDismissed());
  useEffect(() => {
    if (!duplicatesOpen) setDismissedPairs(loadDismissed());
  }, [duplicatesOpen]);
  const duplicateGroups = useMemo(
    () => findDuplicateGroups(memories, { dismissed: dismissedPairs }),
    [memories, dismissedPairs]
  );
  const duplicateCount = useMemo(() => redundantCount(duplicateGroups), [duplicateGroups]);

  // palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Adaptiver Wizard: öffnet sich automatisch NUR beim echten Erstbesuch.
  // „Later“ wird persistiert — der Wizard kämpft nie gegen den Nutzer (Persona-Finding A1).
  const wizardDismissed = (): boolean => {
    try { return localStorage.getItem('ki_gehirn_wizard_dismissed') === '1'; } catch { return false; }
  };
  const [wizardOpen, setWizardOpen] = useState(false);
  const closeWizard = () => {
    setWizardOpen(false);
    try { localStorage.setItem('ki_gehirn_wizard_dismissed', '1'); } catch { /* ignore */ }
    // Wer im Assistenten zugestimmt hat, den Rechner ansehen zu lassen, bekommt
    // die Zustimmungsfrage direkt danach — beantwortet wird sie dort, nicht hier.
    try {
      if (localStorage.getItem('kepta_scan_wunsch') === '1') {
        localStorage.removeItem('kepta_scan_wunsch');
        setScanAusAssistent(true);
        setTimeout(() => setScanOpen(true), 350);
      }
    } catch { /* ignore */ }
  };
  // A7-10, gemessen am 09.10. an einem neuen Datenordner mit 12 Notizen: der
  // Assistent stand nach 2 920 ms ueber der Flaeche, die Kopfzeile zaehlte das
  // Bild da schon. Sein Wecker lief ab dem Mount — 600 ms fuer die leere Base,
  // 2 500 ms fuer die gefuellte — und fragte nie, ob ueberhaupt eine Auskunft
  // ueber den Bestand da ist. Also: erst die erste Antwort, dann ein gemalter
  // Rahmen, dann der Assistent. Nie frueher und nie spaeter nach der Uhr.
  //
  // (a) und (b) sind getrennt: dieser Wecker entscheidet nur, WANN. OB ueberhaupt
  // einer kommt, steht in der Datenbank (Der Assistenten-Merker) und wird vor
  // dem Lesen nicht ueberholt — `praeferenzenGelesen` ist die Schwelle.
  useEffect(() => {
    if (!initialLoaded || !praeferenzenGelesen) return;
    try {
      if (wizardDismissed()) return;
      const p = loadProfile();
      if (p?.hasCompletedOnboarding) return;
    } catch { return; }
    let naechster = 0;
    let gemalt = 0;
    // Zwei Rahmen: der erste stellt das Bild ins DOM, der zweite ist sicher
    // gemalt. Der Assistent tritt hinter dem Bild auf, nicht vor ihm.
    naechster = requestAnimationFrame(() => {
      gemalt = requestAnimationFrame(() => setWizardOpen(true));
    });
    return () => {
      cancelAnimationFrame(naechster);
      cancelAnimationFrame(gemalt);
    };
    // Der Dismiss-Speicher entscheidet dauerhaft, beide Gaende kippen genau
    // einmal — das ist Absicht, nicht Vergessen.
  }, [initialLoaded, praeferenzenGelesen]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Windowing / Virtualisierung: nur 48 Karten initial, Rest per "Mehr laden" + IntersectionObserver
  const PAGE_SIZE = 48;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Die Tür nennt ihren Bestand in derselben Nachricht wie die Seite: der
    // Subscriber bringt die geladenen Knoten, `bestandGroesse()` sagt, wie viele
    // die Tür wirklich hält. Beides zusammen ist die Zahl, die die Fläche zeigt.
    const empfang = (neue: Memory[]) => {
      setMemories(neue);
      setTuerBestand(bestandGroesse());
      // Die Tuer nennt ihren Grund in derselben Nachricht: der Speicher merkt ihn,
      // die schon vorhandene Zeile malt ihn. Keine neue Flaeche, kein neuer Knopf.
      setLadFehler(ladeFehler());
    };
    const unsubscribe = subscribeMemories(empfang);
    empfang(getMemoriesSync());
    return unsubscribe;
  }, []);

  useCommandPaletteHotkey(() => setPaletteOpen(true));

  // --- Gehirn-Status (Paket 2): was /api/health weiß, steht auf der Fläche ---
  // Version, Erinnerungs-Zähler, Verschlüsselung (mit Schlüssel-Ablage) und
  // das Embedding-Modell samt Zähler — kein API-only-Wissen mehr.
  interface GehirnStatus {
    version: string | null;
    count: number;
    verschluesselt: boolean;
    hatVerschluesselung: boolean;
    ablage: string | null;
    embedModelle: { name: string; anzahl: number }[];
    embedTotal: number;
    embedEmbedded: number;
  }
  const [gehirn, setGehirn] = useState<GehirnStatus | null>(null);
  /**
   * /api/health — einmal beim Einhaengen und jedes Mal, wenn sich der Speicher
   * geaendert hat. Der Zähler in dieser Antwort ist die einzige Zahl der Fläche,
   * die nicht aus der Notizliste kommt; blieb er stehen, zeigte der Kopf „74
   * nodes" während die Liste längst 75 zählte und der Toast eine Agenten-
   * speicherung meldete.
   */
  const holeGesundheit = useCallback(async (abgebrochen?: { current: boolean }) => {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      if (abgebrochen?.current) return;
      if (!d || typeof d !== 'object') return;
      const e = (d.embeddings ?? {}) as Record<string, unknown>;
      const v = (d.encryption ?? {}) as Record<string, unknown>;
      const modelle = (e.models ?? {}) as Record<string, unknown>;
      setGehirn({
        version: typeof d.version === 'string' ? d.version : null,
        count: typeof d.count === 'number' ? d.count : 0,
        hatVerschluesselung: typeof d.encryption === 'object' && d.encryption !== null,
        verschluesselt: v.aktiv === true,
        ablage: typeof v.ablage === 'string' ? v.ablage : null,
        embedTotal: typeof e.total === 'number' ? e.total : 0,
        embedEmbedded: typeof e.embedded === 'number' ? e.embedded : 0,
        embedModelle: Object.entries(modelle).map(([name, anzahl]) => ({ name, anzahl: Number(anzahl) })),
      });
    } catch { /* der Server meldet sich, wenn er bereit ist */ }
  }, []);
  /**
   * #77 — die Bestandszahl der zwei Zeilen, durch dieselben Regeln wie die Flaeche.
   * Die Liste haelt hoechstens SEITE_MAX Notizen; ohne diese Zahl waere „0 Code"
   * auf der Seite ein Urteil ueber den Laden, und der Laden haelt Tausende
   * Programme. Kein Puffer auf der Seite: die Zahl kommt, wenn die Tür antwortet.
   */
  const [bestandGruppen, setBestandGruppen] = useState<{
    bestand: number; ohneThema: number; ms: number;
  } & AchsenZahlen | null>(null);
  const holeGruppen = useCallback(async (abgebrochen?: { current: boolean }) => {
    try {
      const r = await fetch('/api/memories/gruppen');
      const d = await r.json();
      if (abgebrochen?.current || !d || typeof d !== 'object' || typeof d.bestand !== 'number') return;
      setBestandGruppen(d);
    } catch { /* die Zahl fehlt, bis die Tür antwortet */ }
  }, []);
  useEffect(() => {
    const flag = { current: false };
    void holeGesundheit(flag);
    void holeGruppen(flag);
    return () => { flag.current = true; };
  }, [holeGesundheit, holeGruppen]);

  // #116 — die Queue arbeitet im Hintergrund und meldet sich nicht bei der Flaeche: am
  // ausgelieferten 3.2.68 gemessen 21:52 bis 21:56, wo der Hinweis bei "0 of 500" stehen
  // blieb, langst 500 von 500 eingebettet war. Solange eine Zahl fehlt, fragt die Flaeche
  // nach; ist sie voll, hoert das Fragen von selbst auf.
  useEffect(() => {
    if (!gehirn || gehirn.embedTotal <= 0 || gehirn.embedEmbedded >= gehirn.embedTotal) return;
    const timer = setInterval(() => void holeGesundheit(), 3000);
    return () => clearInterval(timer);
  }, [gehirn, holeGesundheit]);

  // --- Activity-Stream: das Gehirn lebt — Agent-Aktionen live sehen ---
  const [brainPulse, setBrainPulse] = useState(0);
  const [agentActive, setAgentActive] = useState(false);
  const agentIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);  useEffect(() => {
    return subscribeActivity((evt) => {
      setBrainPulse((p) => p + 1);
      // Liste live aktualisieren, wenn sich der Speicher ändert (auch via MCP!)
      if (evt.type === 'save' || evt.type === 'update' || evt.type === 'delete' || evt.type === 'consolidate') {
        void refreshMemories().catch(() => { /* der Speicher meldet den Grund, die Liste zeigt ihn */ });
        void holeGesundheit();
        void holeGruppen();
      }
      if (evt.source === 'agent') {
        setAgentActive(true);
        if (agentIdleTimer.current) clearTimeout(agentIdleTimer.current);
        agentIdleTimer.current = setTimeout(() => setAgentActive(false), 9000);
        // Named messages („Claude saved …“) come from /api/agents below — this
        // stream only knows that something changed, not who did it.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Named and live: which AI app saved what. The MCP server of every app writes
  // its calls to the database (src/lib/aktivitaet.ts); the app asks what is new
  // every four seconds and says it in plain words.
  const [appsLive, setAppsLive] = useState(false);
  useEffect(() => {
    let letzte: number | null = null;
    let vorbei = false;
    const holen = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await fetch(`/api/agents${letzte === null ? '' : `?after=${letzte}`}`);
        if (!r.ok) return;
        const d = await r.json() as { entries?: { id: number; who: string; tool: string; text: string | null }[]; agents?: { lastSeen: number }[] };
        if (vorbei || !d || typeof d !== 'object') return;
        const neu = Array.isArray(d.entries) ? d.entries : [];
        setAppsLive((Array.isArray(d.agents) ? d.agents : []).some((a) => Date.now() - a.lastSeen < 5 * 60_000));
        const erstes = letzte === null;
        letzte = neu.length ? Math.max(letzte ?? 0, ...neu.map((e) => e.id)) : (letzte ?? 0);
        if (erstes) return;
        const schreibend = neu.filter((e) => /^memory_(save|update|delete|forget)$/.test(e.tool));
        if (!schreibend.length) return;
        const e = schreibend[0];
        const verb = e.tool === 'memory_save' ? 'saved' : e.tool === 'memory_update' ? 'changed' : e.tool === 'memory_delete' ? 'moved to the trash' : 'marked as outdated';
        toast.push({ message: `${e.who} ${verb}${e.text ? ` “${e.text.slice(0, 60)}”` : ''}${schreibend.length > 1 ? ` — and ${schreibend.length - 1} more` : ''}.`, kind: 'info' });
        void refreshMemories().catch(() => { /* der Speicher meldet den Grund, die Liste zeigt ihn */ });
      } catch { /* the next round tries again */ }
    };
    void holen();
    const takt = setInterval(() => void holen(), 4000);
    return () => { vorbei = true; clearInterval(takt); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tags nach Häufigkeit (Finding C2: Sidebar muss bei großen Basen sortiert zählen)
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memories) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
  }, [memories]);

  /**
   * Die Basis, über die diese Fläche zählt: `null` heißt, sie malt den ganzen
   * Bestand. Sonst ist es die Ladung, und jede Zelle, die nur liegen zählen
   * kann (Typen, Kategorien, Seitenverhältnis, Tag-Ziffern), nennt sie — sonst
   * liest der Mensch „3 categories" als Aussage über 2.000 Notizen.
   */
  const ladung = tuerBestand !== null && tuerBestand > memories.length ? memories.length : null;

  /**
   * Zeile 1 als Zahl: Notes · Files · Code. Vorher standen hier die vier
   * Rechen-Arten („4 Facts · 1 Events · 1 How-tos · 5 Documents") — dieselben
   * Wörter, die Damian verworfen hat, an der sichtbarsten Stelle der Fläche.
   *
   * Der Traeger ist erschoepfend: jede Notiz zaehlt in genau einer Spalte, die
   * drei Zahlen summieren immer auf die Heldenzahl. Die alten typeCounts
   * uebersprachen still jeden Typ ausserhalb der vier — eine Verteilung, die
   * kleiner war als die Zahl darueber, und niemand sah es.
   */
  const traegerCounts = useMemo(() => {
    const c: Record<Traeger, number> = { notes: 0, files: 0, code: 0, daten: 0, anderes: 0 };
    for (const m of memories) c[gruppenVonNotiz(m).traeger] += 1;
    return c;
  }, [memories]);

  /**
   * Ein Zensus ueber ALLE Traeger, nicht drei auswendig gelernte Namen. Mit fuenf Faechern
   * haette jede festgeschriebene Dreier-Zeile still einen Korb unter den Tisch gelegt.
   */
  const traegerSumme = (c: Record<Traeger, number>) => TRAEGER_REIHENFOLGE.reduce((n, k) => n + c[k], 0);
  const traegerVoll = (c: Record<Traeger, number>) => TRAEGER_REIHENFOLGE.filter((k) => c[k] > 0);
  /** Der Streifen zeigt den Laden, sobald die Tür geantwortet hat — vorher das Blatt. */
  const zeigeTraeger = bestandGruppen?.traeger ?? traegerCounts;
  /**
   * Der Nenner der Anteile ist genau die Menge, deren Zahlen darüber stehen: der Laden, wenn
   * die Tür geantwortet hat, sonst das Blatt. Ein Anteil, dessen Grundgesamtheit eine andere
   * ist als die der Zahl neben ihm, ist keine Auskunft, sondern ein zweiter Rechenweg.
   */
  const traegerNenner = bestandGruppen?.bestand ?? traegerSumme(traegerCounts);
  /** Wie viele Faecher ueberhaupt fuellen: unter zwei ist ein Anteil keine Auskunft. */
  const traegerFaelter = traegerVoll(zeigeTraeger).length;
  /** Die Bestandzahl genau der Gruppe, die ins Leere lief — eingelesen, nicht geschätzt. */
  const zahlDerWahl = zahlDerAuswahl(bestandGruppen, aktiveTraeger, aktiveThemen);
  /** Zaehlen Blatt und Laden verschieden, nennt die Chip-Zeile die Zahl des Blatts. */
  const blattWeichtAb = bestandGruppen !== null
    && TRAEGER_REIHENFOLGE.some((k) => zeigeTraeger[k] !== traegerCounts[k]);

  // Begrüßung nach Tageszeit + Name aus dem adaptiven Profil
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Good night' : h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const profileName = (() => { try { return loadProfile()?.displayName || ''; } catch { return ''; } })();

  // --- Tag-gefilterte Basis ---
  const tagFiltered = useMemo(() => {
    if (selectedTags.length === 0) return memories;
    return memories.filter(m => selectedTags.every(t => m.tags.includes(t)));
  }, [memories, selectedTags]);

  // --- Semantisches Ranking (hybridSearch) — instant lokal, überholt von der Server-Engine ---
  const scoredResults: ScoredMemory[] | null = useMemo(() => {
    if (!semanticEnabled) return null;
    const q = debouncedSearchQuery.trim();
    if (!q || q.length < 2) return null;
    try {
      const res = hybridSearch(tagFiltered, q, effectiveLimit, { ngram: 1 });
      return res;
    } catch {
      return null;
    }
  }, [tagFiltered, debouncedSearchQuery, semanticEnabled, effectiveLimit]);

  // --- Server-Engine (BM25 + Vektoren + Graph → RRF) lädt asynchron nach ---
  const [serverScored, setServerScored] = useState<ScoredMemory[] | null>(null);
  /** Wie viele Treffer es INSGESAMT gab — auch die, die das Limit abschneidet. */
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  /**
   * Der Such-Cache des Kerns (3.1.1): nach dem ersten Zugriff ist das Gehirn
   * warm — Delta-Writes patchen den Cache, statt ihn neu aufzubauen. Die App
   * kennt den ersten Request-Zeitpunkt: vor der ersten Antwort wärmt sich das
   * Gehirn, danach zeigt sie die zuletzt gemessene Antwortzeit.
   */
  const [gehirnWaermt, setGehirnWaermt] = useState(false);
  const [gehirnWarm, setGehirnWarm] = useState(false);
  const [suchDauerMs, setSuchDauerMs] = useState<number | null>(null);
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!semanticEnabled || q.length < 2) {
      setServerScored(null);
      setServerTotal(null);
      return;
    }
    let cancelled = false;
    if (!gehirnWarm) setGehirnWaermt(true);
    void (async () => {
      const start = performance.now();
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Paket 2 (UI-Parität): die Such-Einstellungen reisen mit jedem Call —
          // Suchtiefe (topk) und die drei Spuren (engine: params.tracks).
          body: JSON.stringify({
            query: q,
            topK: anfrageLimit,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            tracks: { bm25: suchPrefs.spurBm25, vector: suchPrefs.spurVektor, entity: suchPrefs.spurGraph },
          }),
        });
        const data = await res.json();
        if (!cancelled) {
          setServerScored(Array.isArray(data.results) ? (data.results as ScoredMemory[]) : []);
          setServerTotal(typeof data.total === 'number' ? data.total : null);
          setSuchDauerMs(Math.round(performance.now() - start));
          setGehirnWarm(true);
          setGehirnWaermt(false);
        }
      } catch {
        if (!cancelled) { setServerScored(null); setServerTotal(null); } // Server unerreichbar → lokales Ranking bleibt
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, semanticEnabled, anfrageLimit, suchPrefs.spurBm25, suchPrefs.spurVektor, suchPrefs.spurGraph, JSON.stringify(selectedTags)]);
  const effectiveScored = serverScored ?? scoredResults;

  // --- Angezeigte Karten ---
  const { displayedMemories, scoredForDisplay } = useMemo(() => {
    /**
     * Zeile 1 und 2 zuerst, dann alles andere: die Chips sind eine Achse durch
     * den Bestand, kein zusaetzlicher Suchtext. Traeger UND Themen — ein aktives
     * Thema mit gewaehltem Traeger "Files" zeigt Files-Stuecke mit diesem Thema,
     * nicht die Vereinigung beider Zeilen.
     */
    const durchGruppenFilter = (liste: Memory[], scored: ScoredMemory[] | null) => {
      if (!gruppenFilterAktiv) return { displayedMemories: liste, scoredForDisplay: scored };
      const gefiltert = liste.filter((m) => {
        const g = gruppenVonNotiz(m);
        if (aktiveTraeger.length > 0 && !aktiveTraeger.includes(g.traeger)) return false;
        if (aktiveThemen.length > 0 && !g.themen.some((t) => aktiveThemen.includes(t))) return false;
        return true;
      });
      if (!scored) return { displayedMemories: gefiltert, scoredForDisplay: null as ScoredMemory[] | null };
      const ids = new Set(gefiltert.map((m) => m.id));
      return { displayedMemories: gefiltert, scoredForDisplay: scored.filter((r) => ids.has(r.memory.id)) };
    };
    // Semantik aktiv + Query vorhanden -> zeige gerankte Top-k (Server-Engine, Fallback lokal)
    if (semanticEnabled && effectiveScored !== null) {
      const q = debouncedSearchQuery.trim();
      if (q.length >= 2) {
        if (effectiveScored.length > 0) {
          // Punkt 4: die Trefferstufe kantt die ANZEIGE. Die Anfrage bleibt tief
          // (`anfrageLimit`, Zeile 517 — sonst fielen Kandidaten aus der Rangfolge), aber was
          // dasteht, ist die Zahl, die der Regler sagt. Gemessen 31.10. 11:28 im echten Fenster:
          // Stufe 5, Titel "Showing at most 5 hits", Liste 16 Zeilen. Der Rueckweg ueber die
          // Kappe ist die Auskunft darunter ("5 of 16 matches · show all"), die serverTotal
          // braucht — die gibt es nur in diesem Zweig, darum kappt er auch nur hier.
          const gekappt = effectiveScored.length > effectiveLimit ? effectiveScored.slice(0, effectiveLimit) : effectiveScored;
          return durchGruppenFilter(gekappt.map(r => r.memory), gekappt);
        }
        return durchGruppenFilter([] as Memory[], [] as ScoredMemory[]);
      }
    }
    // Kein semantisches Ranking -> klassischer Keyword-Filter oder nur Tag-Filter
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) {
      const filtered = tagFiltered.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q)));
      return durchGruppenFilter(filtered, null);
    }
    return durchGruppenFilter(tagFiltered, null);
  }, [tagFiltered, effectiveScored, semanticEnabled, debouncedSearchQuery, gruppenFilterAktiv, aktiveTraeger, aktiveThemen]);

  // --- Automatisches Retrieval für Chat: Top-k relevante Knoten statt alle gefilterten ---
  const chatMemories: Memory[] = useMemo(() => {
    if (semanticEnabled) {
      const q = debouncedSearchQuery.trim();
      if (q.length >= 2) {
        if (effectiveScored && effectiveScored.length > 0) return effectiveScored.slice(0, Math.min(effectiveLimit, CHAT_CONTEXT_LIMIT)).map(r => r.memory);
        // Query vorhanden aber keine Treffer -> leerer Kontext (verhindert Halluzination mit irrelevanten Knoten)
        if (effectiveScored && effectiveScored.length === 0) return [];
      }
      // Keine Query -> neueste Top-k als Kontext (statt alle Knoten = Token-Sparmaßnahme)
      return [...tagFiltered].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.min(effectiveLimit, CHAT_CONTEXT_LIMIT));
    }
    // Semantik aus: altes Verhalten – alle gefilterten in den Kontext
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) return tagFiltered.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
    return tagFiltered;
  }, [effectiveScored, semanticEnabled, effectiveLimit, tagFiltered, debouncedSearchQuery]);

  /** Opens a note from Today, a dossier or the activity — by its id. */
  const oeffneNotiz = useCallback((id: string) => {
    const m = memories.find((x) => x.id === id);
    if (m) setVorschauMemory(m);
    else toast.push({ message: 'This note is no longer there — it may have been deleted or replaced.', kind: 'warn' });
  }, [memories, toast]);

  const handleSave = async (memoryData: Partial<Memory> & { beziehungen?: BehauptungEingabe[] }) => {
    const result = await saveMemory(
      editingMemory?.id ? { ...memoryData, id: editingMemory.id } : memoryData
    );
    if (result === null) {
      // Punkt 126: die Absage nennt ihr Wort. "Save failed" ohne Grund ist ein Raetsel —
      // bei einer Behauptung, die ein Systemwort enthaelt, wuesste die Person sonst nicht,
      // was sie andern soll, und tippte dieselbe Eingabe noch einmal.
      const grund = letzteAblehnung();
      toast.push({
        message: grund ? `Not saved — ${grund}` : 'Save failed — your changes were not applied.',
        kind: 'warn',
      });
    } else {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
  };

  /**
   * Viele Notizen auf einmal — fuer das Aufraeumen von Duplikaten.
   *
   * Frueher rief das Duplikate-Fenster handleDelete je Notiz auf. Bei 155
   * Duplikaten waren das 155 Anfragen, 155 Meldungen und 155-mal Neuladen;
   * ab der einundsechzigsten griff die Schreibdrossel und alles Weitere
   * scheiterte lautlos. Hier: ein Aufruf, eine Meldung, ein Rueckgaengig, das
   * die ganze Aktion zuruecknimmt.
   */
  const handleDeleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { deleted, ids: erledigt } = await deleteMemories(ids);
    if (deleted === 0) {
      toast.push({ message: 'Nothing was deleted — the server refused the request.', kind: 'warn' });
      return;
    }
    const fehlend = ids.length - deleted;
    toast.push({
      message: fehlend > 0
        ? `${deleted} notes moved to the trash · ${fehlend} were already gone`
        : `${deleted} notes moved to the trash`,
      kind: 'info',
      action: {
        label: 'Undo',
        onClick: async () => {
          const zurueck = await restoreMemories(erledigt);
          toast.push({
            message: zurueck === erledigt.length ? `${zurueck} restored` : `${zurueck} of ${erledigt.length} restored`,
            kind: zurueck > 0 ? 'success' : 'warn',
          });
        },
      },
    });
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    const victim = memories.find(m => m.id === id);
    // Sofort aus dem Grid nehmen — der Refresh kam früher erst mit dem nächsten
    // Event, die gelöschte Karte stand sichtbar im Raum (Funktionsbefund 5.9.).
    void deleteMemory(id).then(() => void refreshMemories().catch(() => { /* geloescht ist geloescht; der Grund der Liste liegt im Speicher */ }));
    if (editingMemory?.id === id) {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
    toast.push({
      message: `“${(victim?.title || 'Node').slice(0, 40)}” moved to the trash`,
      kind: 'info',
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await fetch(`/api/memories/${encodeURIComponent(id)}/restore`, { method: 'POST' });
            void refreshMemories().catch(() => { /* Restore gemalt; der Grund der Liste liegt im Speicher */ });
            toast.push({ message: 'Restored', kind: 'success' });
          } catch {
            toast.push({ message: 'Restore failed', kind: 'warn' });
          }
        },
      },
    });
  };

  const copyContextForAI = () => {
    const contextText = chatMemories.map(m => (
      `--- ${m.title} ---\n${m.content}\n`
    )).join('\n');
    const prompt = `[CONTEXT]\n${contextText}\n[/CONTEXT]\n\nPlease use this context when answering my questions.`;
    navigator.clipboard.writeText(prompt);
    if (kopierTimer.current) clearTimeout(kopierTimer.current);
    setCopied(true);
    kopierTimer.current = setTimeout(() => { setCopied(false); kopierTimer.current = null; }, QUITTUNG_MS);
  };

  const handleSaveToBrain = (content: string) => {
    setEditingMemory({
      id: '',
      userId: 'local',
      title: 'New assistant node',
      content: content,
      tags: ['ai-log'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    setIsEditorOpen(true);
  };

  const handleSaveToBrainWithMeta = useCallback((payload: { title: string; content: string; tags: string[] }) => {
    setEditingMemory({
      id: '',
      userId: 'local',
      title: payload.title || 'Kernaussage',
      content: payload.content,
      tags: payload.tags.length ? payload.tags : ['ai-log'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsEditorOpen(true);
  }, []);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.(pdf|md|txt|json)$/i.test(f.name) || f.type.startsWith("text/") || f.type === "application/json" || f.type === "application/pdf");
    if (list.length === 0) {
      const marke = "No supported files (PDF, MD, TXT, JSON).";
      setImportErr(marke);
      setTimeout(() => setImportErr((c) => (c === marke ? null : c)), QUITTUNG_MS);
      return;
    }
    setImporting(true);
    setImportErr(null);
    setImportMsg(null);
    let totalNodes = 0;
    try {
      for (const file of list) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const text = await extractTextFromFile(file);
        const chunks = chunkText(text, 2000);
        // Electron liefert den Pfad mit — damit die Karte spaeter zur
        // Original-Datei zurueckfuehren kann (dieselbe Konvention wie der
        // Rechner-Scan: "— Source: <pfad>" am Ende).
        const pfad = (file as unknown as { path?: string }).path;
        for (let i = 0; i < chunks.length; i++) {
          const title = chunks.length === 1 ? baseName : `${baseName} — Teil ${i + 1}/${chunks.length}`;
          const tags = ["import", file.name.split(".").pop()?.toLowerCase() || "file"];
          if (file.name.toLowerCase().endsWith(".pdf")) tags.push("pdf");
          const content = pfad ? `${chunks[i]}\n\n— Source: ${pfad}` : chunks[i];
          await saveMemory({ title, content, tags });
          totalNodes++;
        }
      }
      // D2(c) Z7: eine Zahl spricht wie ein Mensch — „3 file(s)" war eine
      // Klammer, wo ein Wort hingehört.
      const marke = `Imported ${totalNodes} ${totalNodes === 1 ? "node" : "nodes"} from ${list.length} ${list.length === 1 ? "file" : "files"}.`;
      setImportMsg(marke);
      setTimeout(() => setImportMsg((c) => (c === marke ? null : c)), QUITTUNG_MS);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const marke = msg || "Import failed";
      setImportErr(marke);
      setTimeout(() => setImportErr((c) => (c === marke ? null : c)), QUITTUNG_MS);
    } finally {
      setImporting(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleClip = useCallback(async () => {
    const url = clipUrl.trim();
    if (!url) return;
    setClipping(true);
    setClipErr(null);
    setClipOk(null);
    try {
      const res = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clip failed");
      const title: string = data.title || new URL(url).hostname;
      const content: string = data.content || "";
      const tags = ["clip", new URL(url).hostname.replace(/^www\./, "")];
      await saveMemory({ title, content: `Source: ${data.url || url}\n\n${content}`, tags });
      const marke = `„${title.slice(0, 48)}“ importiert`;
      setClipOk(marke);
      setClipUrl("");
      setTimeout(() => setClipOk((c) => (c === marke ? null : c)), QUITTUNG_MS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setClipErr(msg);
      setTimeout(() => setClipErr((c) => (c === msg ? null : c)), QUITTUNG_MS);
    } finally {
      setClipping(false);
    }
  }, [clipUrl]);

  const paletteActions = buildPaletteActions({
    onNewNode: () => { setEditingMemory(null); setIsEditorOpen(true); },
    onFocusSearch: () => { setCurrentView("memories"); setTimeout(() => searchInputRef.current?.focus(), 50); },
    onGoMemories: () => setCurrentView("memories"),
    onGoChat: () => setCurrentView("chat"),
    onGoSettings: () => setCurrentView("settings"),
    onGoGraph: () => setCurrentView("graph"),
    onImportFileClick: () => fileInputRef.current?.click(),
    onFocusUrl: () => { setCurrentView("memories"); setTimeout(() => clipInputRef.current?.focus(), 60); },
  });

  const scoredMap = useMemo(() => {
    if (!scoredForDisplay) return new Map<string, ScoredMemory>();
    return new Map(scoredForDisplay.map(r => [r.memory.id, r]));
  }, [scoredForDisplay]);

  // Pagination / Windowing: nur erste 48 Karten, Rest per "Mehr laden" + IntersectionObserver
  const paginatedMemories = useMemo(() => displayedMemories.slice(0, visibleCount), [displayedMemories, visibleCount]);

  // --- Gruppierungen: Datei, Typ, Zeitraum ---
  //
  // Gebaut aus dem SICHTBAREN Ausschnitt (paginatedMemories): „Load more"
  // faellt neue Eintraege einfach in ihre Gruppe. Reihenfolge = erstes
  // Auftreten, „Ohne Quelle" wandert nach hinten.
  interface KarteGruppe {
    schluessel: string;
    titel: string;
    untertitel: string;
    /** Zum Öffnen im Gruppenkopf — Datei oder Weblink, wenn alle denselben Ursprung haben. */
    quelle: Quelle | null;
    typMix: string | null;
    memories: Memory[];
  }
  // Bei aktiver Suche zählt Relevanz: dann wird flach angezeigt, egal welche
  // Gruppierung gewählt war — sonst versinkt der beste Treffer in einer Gruppe.
  const effektivGruppierung = debouncedSearchQuery.trim() ? 'alle' : gruppierung;
  const gruppen: KarteGruppe[] | null = useMemo(() => {
    if (effektivGruppierung === 'alle') return null;
    const map = new Map<string, KarteGruppe>();
    const hinueber = (schluessel: string, titel: string, untertitel: string, quelle: Quelle | null, m: Memory) => {
      let g = map.get(schluessel);
      if (!g) { g = { schluessel, titel, untertitel, quelle, typMix: null, memories: [] }; map.set(schluessel, g); }
      g.memories.push(m);
    };
    for (const m of displayedMemories) {
      if (effektivGruppierung === 'datei') {
        const q = parseQuelle(m);
        if (q?.art === 'datei') hinueber(`datei:${q.pfad}`, q.name, 'Datei', q, m);
        else if (q?.art === 'url') hinueber(`url:${q.url}`, q.name, 'Web', q, m);
        else if (q?.art === 'inbox') hinueber(`inbox:${q.name}`, q.name, 'Inbox', null, m);
        else hinueber('ohne', t('list.noSource'), 'Handnotiz o. Agent', null, m);
      } else if (effektivGruppierung === 'typ') {
        const typ = m.type ?? 'semantic';
        hinueber(`typ:${typ}`, TYP_BESCHREIBUNG[typ] ?? typ, '', null, m);
      } else {
        const tag = new Date(m.createdAt);
        const heute = new Date(); heute.setHours(0, 0, 0, 0);
        const woche = new Date(heute); woche.setDate(woche.getDate() - 6);
        if (tag >= heute) hinueber('heute', t('list.today'), '', null, m);
        else if (tag >= woche) hinueber('woche', t('list.thisWeek'), '', null, m);
        else hinueber('aelter', t('list.older'), '', null, m);
      }
    }
    const liste = [...map.values()];
    // „Ohne Quelle“ nach hinten; im Typ-/Zeitraum-Modus bleibt die Auffolge.
    if (effektivGruppierung === 'datei') {
      liste.sort((a, b) => (a.schluessel === 'ohne' ? 1 : 0) - (b.schluessel === 'ohne' ? 1 : 0));
    }
    for (const g of liste) {
      // Die Mischung unter einer Gruppe spricht die Menschensprache: erst der
      // Traeger (Zeile 1), dann die Themen, die in der Gruppe wirklich vorkommen.
      // Die vier Rechen-Arten stehen hier nicht mehr — sie sind im Schema und in
      // der Farbe, nicht im Text, den ein Nutzer lesen muss.
      const abgeleitet = g.memories.map((m) => gruppenVonNotiz(m));
      const traeger = TRAEGER_REIHENFOLGE.filter((t) => abgeleitet.some((x) => x.traeger === t));
      const themen = THEMA_REIHENFOLGE.filter((t) => abgeleitet.some((x) => x.themen.includes(t)));
      const worte = [...traeger.map((t) => TRAEGER_LABELS[t]), ...themen.map((t) => THEMA_LABELS[t])];
      g.typMix = worte.length === 0 ? '—' : worte.slice(0, 3).join(' · ') + (worte.length > 3 ? ' …' : '');
    }
    return liste;
  }, [displayedMemories, effektivGruppierung]);

  // Ganze Gruppen statt halber: das Sichtfenster („Load more“) schließt eine
  // Gruppe immer KOMPLETT ein, sobald ihr Anfang dran ist — eine 5-teilige
  // Akte, von der 2 Teile fehlen, sieht wie ein Bug aus.
  const sichtbareGruppen = useMemo(() => {
    if (!gruppen) return null;
    const out: KarteGruppe[] = [];
    let laufend = 0;
    for (const g of gruppen) {
      if (laufend >= visibleCount) break;
      out.push(g);
      laufend += g.memories.length;
    }
    return out;
  }, [gruppen, visibleCount]);

  // Eine Karte, an beiden Renderorten (flach + gruppiert) identisch.
  // Klick = Vorschau; der Editor kommt aus der Vorschau heraus.
  const karteFuer = (memory: Memory) => {
    const scored = scoredMap.get(memory.id);
    // Server-Scores sind rohe RRF-Werte (~0,02) — als Prozent wären sie Unsinn.
    // Prozent nur bei der lokalen Fusion (0..1) zeigen.
    const pct = serverScored ? undefined : scored?.score;
    // Spuren-Herkunft: nur die Server-Engine kennt die Bein-Ränge.
    const herkunft = scored?.tracks
      ? { bm25: scored.tracks.bm25, vektor: scored.tracks.vektor, graph: scored.tracks.graph }
      : undefined;
    return (
      <MemoryCard
        key={memory.id}
        memory={memory}
        score={pct}
        matchedTerms={scored?.matchedTerms}
        herkunft={herkunft}
        onClick={() => setVorschauMemory(memory)}
      />
    );
  };

  // Der komplette Listen-Inhalt als gecachtes JSX.
  //
  // Ohne diesen Cache lief bei JEDEM Ansichtswechsel der komplette Dashboard-
  // Render erneut: 3.241 Karten je ~40 DOM-Elemente (≈124.000 Objekte) wurden
  // neu als Elemente gebaut und von React durchgediffen — gemessen ~1,9 s
  // reine Renderzeit pro Klick auf „Knowledge“. Mit dem Cache bleibt die
  // Element-Referenz identisch, solange sich Bestand, Such-Scores, Paginierung
  // oder Gruppierung nicht ändern — React überspringt dann den gesamten
  // Teilbaum (referenzielle Gleichheit), und der Ansichtswechsel kostet
  // praktisch nichts.
  const listenInhalt = useMemo(() => (
    <>
      {gruppen ? (
        <div className="space-y-7">
          {(sichtbareGruppen ?? []).map((g) => (
            <section key={g.schluessel}>
              <div className="flex items-center gap-2 mb-2 px-1 min-w-0">
                {g.quelle?.art === 'datei' && <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                {g.quelle?.art === 'url' && <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                <h3 className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }} title={g.quelle?.art === 'datei' ? g.quelle.pfad : g.titel}>
                  {g.titel}
                </h3>
                <span className="text-[11px] tnum whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                  {g.memories.length} {g.memories.length === 1 ? 'entry' : 'entries'}{g.typMix ? ` · ${g.typMix}` : ''}
                </span>
                {g.quelle && (
                  <button
                    onClick={() => void oeffneQuelle(g.quelle!)}
                    className="btn-ghost min-h-6 px-2 inline-flex items-center rounded text-[11px] shrink-0"
                    title={g.quelle.art === 'datei' ? `Open file: ${g.quelle.pfad}` : `Open link: ${g.quelle.url}`}
                  >
                    {g.quelle.art === 'url' ? 'Open link' : 'Open file'}
                  </button>
                )}
              </div>
              <div className="flex flex-col ledger">
                <AnimatePresence>
                  {g.memories.map(memory => karteFuer(memory))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col ledger">
          <AnimatePresence>
            {paginatedMemories.map(memory => karteFuer(memory))}
          </AnimatePresence>
        </div>
      )}
      {visibleCount < displayedMemories.length && (
        <>
          <div className="flex justify-center pt-6">
            <button
              onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayedMemories.length))}
              className="btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium"
            >
              Load more ({displayedMemories.length - visibleCount} more)
            </button>
          </div>
          <div className="text-center text-[11px] mt-2 tnum" style={{ color: 'var(--text-3)' }}>
            {paginatedMemories.length.toLocaleString('en-GB')} of {displayedMemories.length.toLocaleString('en-GB')} shown
          </div>
        </>
      )}
      {/* Der Anker hängt jetzt außerhalb beider Blöcke: vorher verschwand er genau in dem
          Augenblick, in dem die Fläche ihn brauchte — beim Erreichen des Caches. So kann der
          Beobachter auch die nächste Seite fragen, nicht nur die nächsten 48 Karten. */}
      <div ref={loadMoreRef} className="h-1" aria-hidden />
      {visibleCount >= displayedMemories.length && seiteIstBegrenzt() && (
        <div className="flex justify-center pt-3">
          <button
            onClick={() => void holeNaechsteSeite(setSeitenHinweis)}
            className="btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium"
          >
            More in the store — fetch the next {SEITE_NACHLAD.toLocaleString('en-GB')}
          </button>
        </div>
      )}
      {visibleCount >= displayedMemories.length && displayedMemories.length > PAGE_SIZE && (
        <div className="text-center text-[11px] mt-4 tnum" style={{ color: 'var(--text-3)' }}>
          {/* „All 100 entries shown" über einer Tür, die 14.702 hält, war die
              stille Kappe: das „All" galt der Ladung, nicht dem Bestand. Seit dem
              Brief gilt die Kappe selbst als Zeugnis — nicht nur die Zahl. */}
          {seiteIstBegrenzt() || (tuerBestand !== null && tuerBestand > displayedMemories.length)
            ? <>All {displayedMemories.length.toLocaleString('en-GB')} loaded{tuerBestand !== null ? ` · ${groessenZahl(tuerBestand)} in the store` : ' · the door says more follow'}</>
            : <>All {groessenZahl(displayedMemories.length)} entries shown</>}
          {seitenHinweis && <> · {seitenHinweis}</>}
        </div>
      )}
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [gruppen, sichtbareGruppen, paginatedMemories, displayedMemories, visibleCount, scoredMap, serverScored, loadMoreRef, seitenHinweis]);

  // Reset Paginierung bei Filter-/Suche-Wechsel
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearchQuery, selectedTags, semanticEnabled, topK]);

  // IntersectionObserver: automatisches Nachladen beim Scrollen (400px Vorlauf).
  // Zwei Wege, ein Anker: solange der Cache Karten hat, die noch nicht gemalt sind, wächst das
  // Fenster; ist der Cache am Ende und meldet die Tür `begrenzt`, holt die Fläche die nächste Seite.
  // Vorher endete dieser Effekt genau an der Stelle, an der die Frage hätte beginnen müssen
  // (`BRIEF-SEITE-100-20-10.md`, Auftrag 3 — hier und nur hier hat `seiteIstBegrenzt()` seinen
  // Verbraucher; die Wache `tests/components/dashboard-seiten-wache.test.ts` hält den Faden fest).
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const cacheAmEnde = visibleCount >= displayedMemories.length;
    if (cacheAmEnde && !seiteIstBegrenzt()) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (visibleCount < displayedMemories.length) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayedMemories.length));
          return;
        }
        void holeNaechsteSeite(setSeitenHinweis);
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, displayedMemories.length]);

  return (
    <div
      className={cn("huelle flex h-full overflow-hidden text-zinc-900 dark:text-zinc-100", schmal && "huelle-schmal")}
      data-fenster={schluessel ? "schluessel" : "gedaempft"}
      data-einrichtung={wizardOpen ? "offen" : undefined}
    >
      <Sidebar
        tags={allTags}
        selectedTags={selectedTags}
        onSelectTag={(tag) => {
          setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
          );
        }}
        onClearTags={() => setSelectedTags([])}
        currentView={currentView}
        onNavigate={(ansicht) => {
          setCurrentView(ansicht);
          // #27: bei schmalem Fenster liegt eine offene Leiste ueber der Flaeche — wer
          // dort eine Ansicht waehlt, hat gewaehlt, also rueckt sie zurueck. Sonst geht
          // der naechste Klick an die Leiste, nicht an das Formular dahinter.
          if (schmal) setIsFocusMode(true);
        }}
        totalMemories={tuerBestand ?? memories.length}
        tagsAusLadung={ladung}
        appsLive={appsLive}
        teamVisible={teamVorhanden}
        isFocusMode={isFocusMode}
        toggleFocusMode={() => setIsFocusMode(!isFocusMode)}
        showSetup={(() => { try { const p = loadProfile(); return !p?.hasCompletedOnboarding; } catch { return false; } })()}
        onOpenSetup={() => setWizardOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden my-3 mr-3 panel rounded-2xl relative z-10">
        {/**
         * #32: der Auf-Schalter lebte bisher nur in der Kopfzeile der memories-Ansicht.
         * Die andern Ansichten sitzen in denselben Rahmen, haben aber keine Kopfzeile —
         * und ihr Behaelter ist ausserhalb von `memories` auf `hidden` gestellt, also ist
         * der Knopf zwar im Blatt, aber nicht anfassbar (display:none erbt keine Treffer-
         * flaeche). Wer bei schmalem Fenster eine Ansicht waehlt, schliesst damit die
         * Leiste (#27) und fand in den Einstellungen keinen Weg zurueck. Dieser Streif
         * gilt fuer jede Ansicht ohne eigne Kopfzeile; in `memories` uebernimmt weiterhin
         * deren Kopf den Schalter, damit das Steuer nie zweimal zaehlt.
         */}
        {isFocusMode && currentView !== 'memories' && (
          <div className="h-12 px-3 flex items-center shrink-0 border-gradient-b">
            <button
              onClick={() => setIsFocusMode(false)}
              className="btn-ghost p-2 rounded-lg"
              aria-label="Show sidebar"
            >
              <PanelLeftOpen className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 flex flex-col h-full min-h-0 rounded-2xl overflow-hidden", currentView === 'memories' ? 'flex' : 'hidden')}
        >
          <header className="h-14 px-5 flex items-center gap-3 shrink-0 border-gradient-b">
            {isFocusMode && (
              <button
                onClick={() => setIsFocusMode(false)}
                className="btn-ghost p-2 rounded-lg"
                aria-label="Show sidebar"
              >
                <PanelLeftOpen className="w-4.5 h-4.5" />
              </button>
            )}
            <div className="flex items-center gap-2 shrink-0" style={{ color: 'var(--text-1)' }}>
              <KeptaMark size={22} />
              <span className="hidden md:block font-semibold text-[13px] tracking-[-0.02em]">K3PTA</span>
            </div>
            <div className="flex-1 max-w-xl relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
              {/* D1-15, nachgemessen: „Search… (⌘K for commands)" brauchte bei
                  390 px 188,6 px in 106 px Raum und schnitt bei „…(⌘K foi" hart
                  ab — ein Eingabefeld kennt keine Ellipse von selbst. Der
                  ⌘-Hinweis steht schon auf dem eigenen Knopf daneben; eine
                  Fläche, die beim Schmalwerden 82 px verliert, trägt keine
                  zweite Behauptung. */}
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search your memory"
                placeholder={schmal ? "Search" : "Search your memory"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); } }}
                className="hud-input w-full min-w-0 truncate pl-9 pr-4 py-2 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  setTrashOpen((v) => !v);
                  try {
                    const res = await fetch('/api/storage-info');
                    const data = await res.json();
                    setTrashCount(typeof data.trashed === 'number' ? data.trashed : 0);
                  } catch { /* ignore */ }
                }}
                className="btn-ghost hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                title="Trash — restore deleted entries"
              >
                <Trash2 className="w-4 h-4" />
                {trashCount > 0 && <span className="tnum">{trashCount}</span>}
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="btn-ghost hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                title="Command palette"
              >
                <ScanSearch className="w-4 h-4" /> <span className="kbd !py-px">⌘K</span>
              </button>
              <button
                onClick={copyContextForAI}
                className="btn-ghost flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-xs"
                title={`${chatMemories.length} entries in the chat context — copy as a prompt`}
              >
                {copied ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : `Context (${chatMemories.length})`}</span>
              </button>
              <button
                onClick={() => {
                  setEditingMemory(null);
                  setIsEditorOpen(true);
                }}
                className="btn-primary flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-xs"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </header>

          {/* Papierkorb */}
          {trashOpen && (
            <div className="px-5 py-3 shrink-0 overflow-auto" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)', maxHeight: '30vh' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                  {papierkorbKappe
                    ? <>Trash — first {trashedMemories.length} of {groessenZahl(papierkorbKappe.gesamt)} deleted entries</>
                    : <>Trash — {trashedMemories.length} deleted entries, all restorable</>}
                </span>
                <button onClick={() => setTrashOpen(false)} className="btn-ghost px-2 py-1 rounded-md text-[11px]">Close</button>
              </div>
              {papierkorbGrund && (
                <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>{papierkorbGrund} — the trash may hold more than this page.</p>
              )}
              {trashedMemories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{papierkorbGrund ? 'Nothing loaded.' : 'Empty.'}</p>
              ) : (
                <ul className="space-y-1">
                  {trashedMemories.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate" style={{ color: 'var(--text-2)' }}>{m.title || 'Untitled'}</span>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/memories/${encodeURIComponent(m.id)}/restore`, { method: 'POST' });
                            setTrashedMemories((prev) => prev.filter((x) => x.id !== m.id));
                            void refreshMemories().catch(() => { /* Papierkorb-Zeile gemalt; der Grund liegt im Speicher */ });
                          } catch { /* ignore */ }
                        }}
                        className="btn-ghost px-2 py-1 rounded-md text-[11px] shrink-0"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Werkzeugleiste: Suche-Modus, Kontextgröße, Quellen-Status */}
          <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={semanticEnabled}
                onChange={(e) => setSemanticEnabled(e.target.checked)}
                className="sr-only"
              />
              <span className="switch" data-on={semanticEnabled}><span className="knob" /></span>
              <span className="text-[13px] font-medium" style={{ color: semanticEnabled ? 'var(--text-1)' : 'var(--text-2)' }}>
                Semantic search
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>Results</span>
              <input
                type="range"
                min={0}
                max={RESULT_STOPS.length - 1}
                step={1}
                value={Math.max(0, RESULT_STOPS.indexOf(topK as typeof RESULT_STOPS[number]))}
                onChange={(e) => setTopK(RESULT_STOPS[parseInt(e.target.value, 10)] ?? 5)}
                className="h-7 w-24"
                aria-label="Number of results shown"
                title="How many hits the index shows. The last step shows everything that matches."
              />
              <span
                className="chip tnum !px-2"
                title={topK === 0
                  ? 'Showing every note that matches — nothing is cut off. The chat still gets only the most relevant ones.'
                  : `Showing at most ${topK} hits. Slide to the end for all of them.`}
              >
                {resultLabel(topK)}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs">
              {/* Such-Cache-Status: der Kern baut den Suchindex beim ersten
                  Zugriff einmal auf und patcht ihn danach nur noch — die App
                  misst die Antwortzeit und zeigt, wenn das Gehirn warm ist. */}
              {gehirnWaermt && (
                <span className="chip" title="The search cache is being built once — from now on, every write only patches it.">
                  <span className="agent-dot" /> Brain warming up…
                </span>
              )}
              {gehirnWarm && !gehirnWaermt && (
                <span className="chip tnum" title="Search cache warm — every write patches it instead of rebuilding. The time is the last search as measured by the app.">
                  <span className="status-dot" />
                  Brain warm — answer in {suchDauerMs ?? 0} ms
                </span>
              )}
              {/* Die Zahl muss zu den gezeigten Karten passen: hier stand vorher das
                  LOKALE Ranking (150 Treffer), waehrend die Liste daneben die 261
                  Treffer der Server-Engine zeigte. Zwei Zahlen fuer dieselbe Sache. */}
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && effectiveScored && effectiveScored.length > 0 && (
                <span
                  className="chip tnum"
                  title={`${effectiveScored.length} hits · similarity of the best match ${Math.round(effectiveScored[0].cosineScore * 100)} %`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ok)' }} />
                  {/* Punkt 4: die Zahl im Streifen ist, was die Tuer **geschickt** hat. Passt
                      mehr, als die Bestellung hergab, sagt der Streifen beide Zahlen — sonst
                      steht "16 hits" ueber einer Liste, deren Rueckweg "5 of 30 matches" heisst.
                      Gemessen 31.10. 11:51 im echten Fenster an dreissig gesaeten Notizen. */}
                  <span>{serverTotal !== null && serverTotal > effectiveScored.length
                    ? `${effectiveScored.length} of ${serverTotal} ${serverTotal === 1 ? 'hit' : 'hits'}`
                    : `${effectiveScored.length} ${effectiveScored.length === 1 ? 'hit' : 'hits'}`}</span>
                  {/* Nicht der Fusionswert: der ist ein RRF-Rohwert (rund 0,02) und
                      ergibt als Prozentzahl "best 2 %" — hier steht die echte
                      Vektor-Aehnlichkeit, oder gar nichts, wenn ohne Vektoren gesucht wird. */}
                  {effectiveScored[0].cosineScore > 0 && (
                    <span style={{ color: 'var(--text-3)' }}>best {Math.round(effectiveScored[0].cosineScore * 100)} %</span>
                  )}
                </span>
              )}
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && effectiveScored && effectiveScored.length === 0 && (
                <span className="chip" style={{ color: 'var(--warn)' }}>
                  <AlertCircle className="w-3 h-3" /> No matches
                </span>
              )}
              {!semanticEnabled && debouncedSearchQuery.trim() && (
                <span className="chip tnum">{displayedMemories.length} {displayedMemories.length === 1 ? 'hit' : 'hits'}</span>
              )}

              <span
                className="chip"
                title={inbox?.inboxDir ? `Inbox folder: ${inbox.inboxDir}` : 'Watch the inbox folder'}
              >
                <UploadCloud className="w-3 h-3" style={{ color: inbox?.watching ? 'var(--ok)' : 'var(--text-3)' }} />
                {inbox ? `${inbox.files.length} in Inbox` : 'Inbox…'}
                <button
                  onClick={handleInboxScan}
                  disabled={inboxScanBusy}
                  className="ml-1 -mr-1 min-h-6 px-2 inline-flex items-center rounded text-[11px] font-semibold hover:opacity-80 disabled:opacity-40"
                  style={{ color: 'var(--accent)' }}
                  title="Scan the inbox now and import"
                >
                  {inboxScanBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Scan'}
                </button>
              </span>

              {duplicateGroups.length === 0 ? (
                <span className="chip hidden lg:inline-flex" title="Nothing to do — the knowledge base has no obvious duplicates">
                  <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--ok)' }} /> Clean
                </span>
              ) : (
                <button
                  onClick={() => setDuplicatesOpen(true)}
                  className="chip"
                  style={{ color: 'var(--warn)', background: 'var(--warn-soft)', borderColor: 'transparent', cursor: 'pointer' }}
                  title="Review every duplicate side by side and remove the copies you do not want"
                >
                  <AlertCircle className="w-3 h-3" /> {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'}
                  <span className="ml-1 font-semibold underline underline-offset-2">Review</span>
                </button>
              )}
            </div>
          </div>

          {/* Quellen: Datei-Import + URL-Clipper — eine Fläche, eine Geste */}
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className="import-band"
              data-drag={dragOver}
            >
              <div className="flex-1 flex items-center gap-3 px-4 py-3">
                {importing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "var(--accent)" }} /> : <UploadCloud className="w-4 h-4 shrink-0" style={{ color: dragOver ? "var(--accent)" : "var(--text-3)" }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                    {importing ? "Importing…" : dragOver ? "Drop to import" : "Drag files here"}
                  </div>
                  {/* Die Formate auf eigener Zeile: in einer Reihe mit dem Satz
                      abgeschnitten, gemessen +137 px bei 1 024 px und +130 px bei
                      820 px Fensterbreite — ein `sm:inline` misst die Breite des
                      Fensters, die Zeile kriegt die Breite der Fläche. */}
                  <div className="text-[11px] tnum" style={{ color: "var(--text-2)" }}>
                    PDF · MD · TXT · JSON
                  </div>
                  {importMsg && <div className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "var(--ok)" }}><CheckCircle2 className="w-3 h-3" />{importMsg}</div>}
                  {importErr && <div className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "var(--danger)" }}><AlertCircle className="w-3 h-3" />{importErr}</div>}
                </div>
                <label className="btn-ghost px-3 py-2 text-xs font-medium cursor-pointer shrink-0">
                  Choose
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.md,.txt,.json,text/markdown,text/plain,application/json,application/pdf"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.length) processFiles(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>
              <div className="import-divider hidden md:block" />
              <div className="hidden lg:flex items-center px-4 py-3 shrink-0">
                <button
                  onClick={() => setScanOpen(true)}
                  className="btn-ghost px-3 py-2 text-xs font-medium flex items-center gap-2"
                  title="Let K3PTA look through this computer for documents — you see what would be imported before anything is read"
                >
                  <HardDriveDownload className="w-3.5 h-3.5" /> Scan this computer
                </button>
              </div>
              <div className="import-divider hidden lg:block" />
              <div className="flex-1 hidden md:flex items-center gap-3 px-4 py-3">
                <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                <input
                  ref={clipInputRef}
                  value={clipUrl}
                  onChange={(e) => setClipUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleClip(); }}
                  aria-label="Paste a URL to import"
                  placeholder="Paste a URL…"
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-1)" }}
                />
                <button
                  onClick={handleClip}
                  disabled={clipping || !clipUrl.trim()}
                  className="btn-ghost px-3 py-2 text-xs font-medium shrink-0 disabled:opacity-40"
                >
                  {clipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Import'}
                </button>
              </div>
            </div>
            {(clipErr || clipOk) && (
              <div className="text-[11px] flex items-center gap-2 mt-2" style={{ color: clipErr ? "var(--danger)" : "var(--ok)" }}>
                {clipErr ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {clipErr || clipOk}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="max-w-6xl mx-auto h-full flex flex-col">
              {/* Persönlicher Kopf — Datum als Zeile, Aussage als Display */}
              <div className="mb-4 shrink-0">
                <h1 className="display">
                  {greeting}{profileName ? `, ${profileName}` : ''}
                </h1>
                <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {agentActive ? ' — an agent is working right now' : ''}
                </p>
              </div>

              {/* Übersicht — der Index-Streifen: eine dominante Zahl, leise Zweitgrößen */}
              <div className="index-strip mb-4 shrink-0 flex-wrap gap-y-3">
                <div className="index-cell" style={{ flex: '0 1 auto' }}>
                  <span className="num-hero">{(tuerBestand ?? memories.length).toLocaleString('en-GB')}</span>
                  <span className="k">{(tuerBestand ?? memories.length) === 1 ? 'entry in the index' : 'entries in the index'}</span>
                </div>
                <div className="index-cell">
                  <span className="v">
                    {/* Farben sind vorhandene Token (index.css haelt E1) — die
                        Farbe zeigt die Ebene, das Wort ist Zeile 1. Gezählt wird
                        der Laden (#77), nicht das Blatt: die Heldenzahl oben ist
                        auch der Laden, und zwei Zahlen derselben Fläche müssen
                        sich auf dieselbe Menge beziehen.
                        Ein Fach mit null Stücken ist keine Auskunft, sondern
                        Schmuck (Damians Bild von 19:02: „150 Notes 0 Files 0
                        Code" — zwei von drei Zahlen sagen nichts). Darum steht
                        hier nur, was da ist; fehlt alles, sagt die Zeile es.
                        Die Token stehen als eigne Zeile da, nicht als
                        zusammengebaute Zeichenkette: `scripts/design-wache.mjs`
                        liest die wörtlichen Namen aus der Quelle, und ein
                        `var(--type-${t})` wäre für sie unsichtbar — gemessen
                        22.10. 21:09:14, wo die Ruhe-Ebenen-Wache von 20 auf 16
                        Zeilen fiel. */}
                    {TRAEGER_KLEID.filter((k) => zeigeTraeger[k.key] > 0).map((k) => {
                      /* Der Anteil dahinter sagt, was die Menge allein nicht sagt: an einem
                         echten Bestand von 21 066 sind 92 selbst getippte Stuecke 0,4 %.
                         Sein Nenner ist dieselbe Menge, die die Zeile unter ihm nennt.
                         Kleid: --text-3 ohne Deckkraft, gemessen 4,65:1 (index.css:299) —
                         die Ebene, die erklaert. Das Woertchen daneben traegt weiterhin
                         opacity-70 und liegt damit in der bekannten Schuld (index.css:609,
                         3,45 gegen die Latte 4,5); neue Auskunft bekommt keinen Ton unter
                         der Latte, auch nicht der Gleichheit wegen. */
                      const anteil = anteilZahl(zeigeTraeger[k.key], traegerNenner, traegerFaelter);
                      return (
                        <span key={k.key} style={{ color: k.color }}>
                          {groessenZahl(zeigeTraeger[k.key])} <span className="text-[10px] opacity-70">{TRAEGER_LABELS[k.key]}</span>
                          {anteil !== '' && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}> {anteil}</span>}
                        </span>
                      );
                    })}
                    {traegerVoll(zeigeTraeger).length === 0 && (
                      <span style={{ color: 'var(--text-3)' }}>nothing here yet</span>
                    )}
                  </span>
                  {/* Der Satz nennt die Menge, die diese Zahlen zählen — nicht noch
                      einmal ihre Grösse: die steht zwei Zellen weiter als Heldenzahl,
                      und dieselbe Zahl zweimal in einem Streifen ist die Krankheit,
                      die #77 gerade nicht wollte. Solange die Tür nicht geantwortet
                      hat, sagt die Zeile, wie weit sie überhaupt gesehen hat. */}
                  <span className="k">{TRAEGER_FRAGE_SATZ} · {bestandGruppen ? 'the whole store' : ladung !== null ? `counting the ${groessenZahl(ladung)} loaded` : 'in the index'}</span>
                </div>
                <div className="index-cell">
                  <span className="v">{groessenZahl(allTags.length)}</span>
                  <span className="k">tags{ladung !== null ? ` in the ${groessenZahl(ladung)} loaded` : ""}</span>
                </div>
                <div className="index-cell ml-auto">
                  <span className="v">
                    {agentActive ? <span className="agent-dot" /> : <span className="status-dot" />}
                    {agentActive ? 'Agent working' : 'In sync'}
                  </span>
                  <span className="k">local, private, MCP</span>
                </div>
              </div>

              {/* Gehirn-Status (Paket 2): der Kern legt Rechenschaft ab — Version,
                  Erinnerungs-Zähler, Verschlüsselung samt Schlüssel-Ablage und das
                  Embedding-Modell mit seinem Zähler. Was /api/health weiß, steht hier. */}
              {gehirn && (
                <div className="mb-4 shrink-0 flex flex-wrap items-center gap-2 text-[11.5px]" data-testid="gehirn-status">
                  {gehirn.version && (
                    <span className="chip" title="The running version — also reported over MCP and /api/health.">
                      K3PTA {gehirn.version}
                    </span>
                  )}
                  <span className="chip tnum" title="Active nodes in the local database.">
                    {groessenZahl(gehirn.count)} {gehirn.count === 1 ? 'node' : 'nodes'} in the brain
                  </span>
                  {gehirn.hatVerschluesselung && (
                    <span
                      className="chip"
                      style={gehirn.verschluesselt ? { color: 'var(--ok)' } : { color: 'var(--warn)' }}
                      title={gehirn.verschluesselt
                        ? `The knowledge base file is encrypted (AES-256)${gehirn.ablage ? ` — key in the ${gehirn.ablage}` : ''}.`
                        : 'The knowledge base file is not encrypted.'}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      {gehirn.verschluesselt ? 'Encrypted' : 'Not encrypted'}
                    </span>
                  )}
                  {(gehirn.embedModelle.length > 0 || gehirn.embedTotal > 0) && (
                    <span
                      className="chip tnum"
                      title="The embedding model behind vector search and how many of the text chunks carry its vectors."
                    >
                      Embeddings: {gehirn.embedModelle.map((m) => `${m.name} ${groessenZahl(m.anzahl)} of ${groessenZahl(gehirn.embedTotal)} chunks`).join(' · ')}
                      {gehirn.embedModelle.length === 0 ? `${groessenZahl(gehirn.embedEmbedded)}/${groessenZahl(gehirn.embedTotal)} embedded` : ''}
                    </span>
                  )}
                </div>
              )}

              {/* #116 — die Queue arbeitet im Hintergrund (2,1 Stuecke je Sekunde, gemessen
                  27.10. an 3 000 Notizen: 256 von 6 000 nach 120 s). Solange das laeuft, findet
                  die semantische Suche weniger, als der Laden hergibt. Der Chip im Status-Streifen
                  nennt die Zahl; diese Zeile steht ueber den Ergebnissen und sagt, was sie fuer
                  das bedeutet, was gleich fehlt. */}
              {gehirn && gehirn.embedTotal > 0 && gehirn.embedEmbedded < gehirn.embedTotal && (
                <div
                  className="chip mb-3 w-fit"
                  data-testid="suche-fuellend"
                  style={{ color: 'var(--warn)' }}
                  title="The vector index is still being built in the background. Until every text chunk carries its vector, a semantic search can miss notes that are already saved — the words still find them."
                >
                  {`Semantic index is still filling: ${groessenZahl(gehirn.embedEmbedded)} of ${groessenZahl(gehirn.embedTotal)} pieces done — a saved note can be missing from these results`}
                </div>
              )}

              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-3 text-[12px] tnum" style={{ color: 'var(--text-3)' }}>
                  <span>{displayedMemories.length.toLocaleString('en-GB')} of {tagFiltered.length.toLocaleString('en-GB')} {ladung !== null ? 'on this page' : 'entries'}</span>
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && (
                    serverTotal !== null && serverTotal > displayedMemories.length ? (
                      <button
                        onClick={() => setTopK(0)}
                        className="chip !py-px"
                        style={{ color: 'var(--warn)', cursor: 'pointer' }}
                        title="More notes match this topic than are shown — click to show all of them"
                      >
                        {displayedMemories.length} of {serverTotal} matches · show all
                      </button>
                    ) : (
                      <span className="chip !py-px">{topK === 0 ? 'All matches' : `Top ${topK}`}</span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
                  {agentActive ? (
                    <>
                      <span className="agent-dot" />
                      <span style={{ color: 'var(--accent)', fontWeight: 560 }}>Agent active</span>
                    </>
                  ) : (
                    <span className="status-dot" title="Local storage in sync" />
                  )}
                </div>
              </div>

              {displayedMemories.length === 0 && !initialLoaded ? (
                <div className="flex flex-col ledger">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card p-4 h-52 rounded-xl flex flex-col gap-3">
                      <div className="skeleton h-3 w-16" />
                      <div className="skeleton h-5 w-4/5" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-2/3" />
                      <div className="mt-auto flex gap-2">
                        <div className="skeleton h-5 w-14 rounded-md" />
                        <div className="skeleton h-5 w-12 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Die Kontrolle bleibt stehen, solange etwas gefiltert werden
                      kann — ein leerer Bestand ohne Auswahl braucht sie nicht. */}
                  {(displayedMemories.length > 0 || gruppenFilterAktiv || memories.length > 0) && (
                  <>
                  {/* NEUN WOERTER, ZWEI ZEILEN — Zeile 1 nach FORM (Notes · Files ·
                      Code, erschoepfend), Zeile 2 nach WORUM (sechs kombinierbare
                      Themen). Themen greifen nie in Code: die Sperre ist hier
                      sichtbar, nicht nur im Code. Das Wort der Zeile 1 heisst seit
                      29.10. "In what form" und nicht "Where it came from": das
                      zweite Wort gehoert der Herkunft im Graphen
                      (`graphHerkunft.ts → HERKUNFT_FRAGE`), und eine Zahl unter
                      dem falschen Wort ist keine Auskunft. */}
                  <div className="flex flex-wrap items-center gap-2 mb-2" role="group" aria-label={TRAEGER_FRAGE}>
                    <span className="text-[11px] shrink-0" style={{ color: 'var(--text-3)' }}>Form</span>
                    {TRAEGER_REIHENFOLGE.map((t) => {
                      const an = aktiveTraeger.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={an}
                          title={TRAEGER_HINWEISE[t]}
                          onClick={() => setAktiveTraeger((vorher) => vorher.includes(t) ? vorher.filter((x) => x !== t) : [...vorher, t])}
                          className="row-quiet min-h-6 px-2"
                          style={an ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                        >
                          {TRAEGER_LABELS[t]}
                        </button>
                      );
                    })}
                    {gruppenFilterAktiv && (
                      <button
                        type="button"
                        className="row-quiet min-h-6 px-2"
                        title="Show everything again"
                        onClick={() => { setAktiveTraeger([]); setAktiveThemen([]); }}
                      >
                        Clear
                      </button>
                    )}
                    {/* #77 — die zweite Zahl, getrennt: was das Blatt haelt, ueber
                        das der Filter wirklich laeuft. */}
                    {blattWeichtAb && (
                      <span
                        className="text-[11px] shrink-0 tnum"
                        style={{ color: 'var(--text-3)' }}
                        title={`The chips run over the ${groessenZahl(memories.length)} entries loaded on this page, not over the store.`}
                      >
                        on this page {TRAEGER_REIHENFOLGE.map((k) => groessenZahl(traegerCounts[k])).join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label={THEMA_FRAGE}>
                    <span className="text-[11px] shrink-0" style={{ color: 'var(--text-3)' }}>About</span>
                    {THEMA_REIHENFOLGE.map((t) => {
                      const an = aktiveThemen.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={an}
                          disabled={nurCode}
                          title={nurCode ? 'Code is not sorted by topic — a program is a program' : THEMA_HINWEISE[t]}
                          onClick={() => setAktiveThemen((vorher) => vorher.includes(t) ? vorher.filter((x) => x !== t) : [...vorher, t])}
                          className="row-quiet min-h-6 px-2 disabled:opacity-45"
                          style={an ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                        >
                          {THEMA_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="apple-seg mb-3" role="group" aria-label="Grouping of the list">
                    {([['alle', t('list.all')], ['datei', t('list.byFile')], ['typ', t('list.byType')], ['zeitraum', t('list.period')]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setGruppierung(key)}
                        disabled={!!debouncedSearchQuery.trim()}
                        className="apple-seg-btn min-h-7 text-[11px] font-medium disabled:opacity-40"
                        data-on={effektivGruppierung === key ? "true" : "false"}
                        title={debouncedSearchQuery.trim()
                          ? 'Grouping is off while you search — results are ranked by relevance'
                          : key === 'alle' ? 'Flat grid, newest relevance first'
                          : key === 'datei' ? 'Group all chunks under their source file or link'
                          : key === 'typ' ? Object.values(TYP_BESCHREIBUNG).join(' · ')
                          : 'Today, this week, older'}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  </>
                  )}
                  {/* Der leer gefilterte Zustand steht innerhalb derselben
                      Zweige wie die Zeilen: ein Klick auf ein Wort, das die
                      geladene Seite nicht trifft, darf die Kontrolle nicht
                      mitnehmen, die ihn zuruecknimmt (GF, v6-code-leer.png). */}
                  {ladFehler && displayedMemories.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center" role="status" data-testid="lad-fehler">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--danger-soft)', border: '1px solid var(--border-subtle)' }}>
                        <AlertCircle className="w-6 h-6" style={{ color: 'var(--danger)' }} />
                      </div>
                      <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>The server did not answer</h3>
                      <p className="text-[13px] mb-4 max-w-[420px]" style={{ color: 'var(--text-3)' }}>{ladFehler}</p>
                      <button
                        className="btn-ghost px-3 py-2 text-[13px]"
                        onClick={() => { setLadFehler(null); setLadVersuch((v) => v + 1); }}
                      >
                        Try again
                      </button>
                    </div>
                  ) : displayedMemories.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                        <KeptaMark size={34} />
                      </div>
                      <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                        {debouncedSearchQuery || selectedTags.length > 0
                          ? 'No matches'
                          : gruppenFilterAktiv ? `No entries ${gruppenGrund}` : 'No entries yet'}
                      </h3>
                      <p className="text-[13px] max-w-sm mx-auto leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        {debouncedSearchQuery || selectedTags.length > 0
                          ? semanticEnabled && debouncedSearchQuery.trim().length >= 2
                            ? `Nothing found for “${debouncedSearchQuery.trim().slice(0, 48)}”. Try different terms, raise the result count, or switch to keyword search.`
                            : "No entries match the search criteria."
                          : gruppenFilterAktiv
                            ? `Nothing ${gruppenGrund} among the ${groessenZahl(memories.length)} loaded entries` +
                              (zahlDerWahl !== undefined
                                ? ` — the store holds ${groessenZahl(zahlDerWahl)} of them, and this filter only sees what is loaded.`
                                : tuerBestand !== null && tuerBestand > memories.length
                                  ? ` — the store holds ${groessenZahl(tuerBestand)}, and this filter only sees what is loaded.`
                                  : '.')
                            : "Drop files here, import a URL, or start with “New” — agents write into the very same base over MCP."}
                      </p>
                      {gruppenFilterAktiv && (
                        <button
                          onClick={() => { setAktiveTraeger([]); setAktiveThemen([]); }}
                          className="mt-4 btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium"
                        >
                          Show everything again
                        </button>
                      )}
                      {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && displayedMemories.length === 0 && (
                        <button onClick={() => setSemanticEnabled(false)} className="mt-4 btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium">
                          Switch to keyword search
                        </button>
                      )}
                    </div>
                  ) : listenInhalt}
                </>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 h-full overflow-hidden", currentView === 'chat' ? 'flex' : 'hidden')}
        >
          <Chat
            activeMemories={chatMemories}
            onSaveToBrain={handleSaveToBrain}
            onSaveToBrainWithMeta={handleSaveToBrainWithMeta}
            isFocusMode={isFocusMode}
            onToggleFocus={() => setIsFocusMode(!isFocusMode)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 flex flex-col h-full min-h-0 overflow-hidden px-2 py-3 md:px-5", currentView === 'graph' ? 'flex' : 'hidden')}
        >
          <div className="flex items-center gap-3 mb-2 shrink-0">
            <div className="text-[13px] font-medium shrink-0" style={{ color: 'var(--text-1)' }}>Graph</div>
            {/* Der lange Satz ist schmückende Auskunft, keine Zahl: in einem
                Fenster, das ihn nicht trägt, bricht er um und rückt das Bild
                nach unten (A7-06). Die Zählung bleibt stehen, der Rest nicht.

                „schmal" allein reicht nicht: gemessen 15.10. im 820-er Fenster war
                der Kasten 343 px breit und der Satz brauchte 387 — er endete
                abgeschnitten mit „…similarity and knowledg…" (leitung-bilder/
                graph-820x1180.png). Darum entscheidet der Kasten, nicht die
                Geräteklasse: der Satz bleibt nur stehen, wenn er passt. Der Kasten
                wird vom Inhalt nicht gedehnt (min-w-0 und truncate in einer
                flex-Zeile), also misst die Beobachtung die verfügbare Breite. */}
            <div ref={satzKastenRef} className="text-[12px] tnum min-w-0 truncate" style={{ color: 'var(--text-3)' }}>
              {mengensatz(feldZaehlung ?? memories.length, tuerBestand)}{!schmal && satzPasst ? " · connected through tags, similarity and knowledge entities" : ""}
            </div>
            <div className="ml-auto shrink-0">
              <button onClick={() => setCurrentView("memories")} className="btn-ghost px-3 py-2 rounded-md text-xs font-medium">Back to the list</button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flaeche-huelle">
            <KnowledgeGraph
              memories={memories}
              sichtbar={currentView === 'graph'}
              onFeldZaehlung={setzeFeldZaehlung}
              onSelectMemory={(m) => { setEditingMemory(m); setIsEditorOpen(true); }}
              onSelectConcept={(name) => { setDossierThema({ text: name, nr: (dossierThema?.nr ?? 0) + 1 }); setCurrentView('dossier'); }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'today' ? 'block' : 'hidden')}
        >
          <TodayView aktiv={currentView === 'today'} onOpenMemory={oeffneNotiz} onGo={(v) => setCurrentView(v)} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'dossier' ? 'block' : 'hidden')}
        >
          <DossierView dossierThema={dossierThema} onOpenMemory={oeffneNotiz} onEditMemory={(id) => { const m = memories.find((x) => x.id === id); if (m) { setEditingMemory(m); setIsEditorOpen(true); } }} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'activity' ? 'block' : 'hidden')}
        >
          <ActivityView aktiv={currentView === 'activity'} onOpenMemory={oeffneNotiz} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'team' ? 'block' : 'hidden')}
        >
          <TeamView aktiv={currentView === 'team'} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 p-3 sm:p-5 h-full overflow-y-auto", currentView === 'settings' ? 'block' : 'hidden')}
        >
          <Settings />
        </motion.div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />

      <OnboardingWizard open={wizardOpen} onClose={closeWizard} onComplete={closeWizard} />

      <AnimatePresence>
        {vorschauMemory && (
          <MemoryPreview
            memory={vorschauMemory}
            onClose={() => setVorschauMemory(null)}
            onEdit={(m) => { setVorschauMemory(null); setEditingMemory(m); setIsEditorOpen(true); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorOpen && (
          <MemoryEditor
            memory={editingMemory}
            onSave={handleSave}
            onClose={() => setIsEditorOpen(false)}
            onDelete={editingMemory ? () => handleDelete(editingMemory.id) : undefined}
          />
        )}
      </AnimatePresence>
      <MachineScan
        open={scanOpen}
        autoPreview={scanAusAssistent}
        onClose={() => { setScanOpen(false); setScanAusAssistent(false); }}
        onImported={(n) => {
          void refreshMemories().catch(() => { /* Importzahl gemalt; der Grund liegt im Speicher */ });
          if (n > 0) toast.push({ message: `${n} notes imported from this computer — tagged “machine-scan”.`, kind: 'info' });
        }}
      />
      <DuplicatesPanel
        memories={memories}
        open={duplicatesOpen}
        onClose={() => { setDuplicatesOpen(false); setDismissedPairs(loadDismissed()); }}
        onDelete={handleDelete}
        onDeleteMany={handleDeleteMany}
        onOpenMemory={(m) => { setDuplicatesOpen(false); setEditingMemory(m); setIsEditorOpen(true); }}
      />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

// Shortcuts-Cheat-Sheet (per „?“)
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '⌘K', action: 'Command palette — quick actions and search' },
  { keys: '⌘N', action: 'New knowledge node' },
  { keys: '?', action: 'This overview' },
  { keys: 'Esc', action: 'Close dialog' },
  { keys: '⌘1–4', action: 'Knowledge, Chat, Graph, Settings' },
  { keys: '⌘5–7', action: 'Today, Dossier, Activity' },
];

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center hud-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl p-6 glass-strong"
          >
            <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Shortcuts</h3>
            <ul className="space-y-3">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4">
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>{s.action}</span>
                  <kbd className="px-2 py-1 rounded-lg text-xs font-mono shrink-0" style={{ background: 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}>
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="hud-label mt-4">Agents use the same brain over MCP — watch the activity live in the index.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
