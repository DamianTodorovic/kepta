// Die Wort-Sonde der Design-Wache, als reines Modul -- damit ihr Biss nicht am
// Inhalt einer Datei haengt und ein Fall sie fuettern kann, ohne die Platte zu lesen.
//
// Vorgeschichte, gemessen 13.10. (e1-code/zensus.mjs) und 5.11.: die erste Sonde
// verglich den Quelltext mit `includes(k)`. `glass` galt als gerufen, weil
// `glass-strong` dasteht, `inset` wegen `hud-inset`, `ikone` wegen `ikone-1`,
// `label` wegen `hud-label`. Sie meldete 16 Waisen, es waren 20. Dieselbe Taetzung
// liess umgekehrt eine gerufene Klasse ohne Regel ganz unsichtbar (hud-raised in
// PraxisSync.tsx:172,183). Seit 5.11. zaehlt die Wache Woerter in beide Richtungen,
// und die 18 Sitze der Datei sind geloescht -- der Vertrag verbietet in §10 die
// Regel, die niemand ruft.
//
// Die Funktionen sind absichtlich frei von Dateizugriff: der Fall in
// `tests/design-wache.test.ts` setzt Baelle ein, statt auf die lebende Zahl zu bauen.

/**
 * Die drei reinen Schritte der Klassen-Sonde, exportiert, damit ihr Biss nicht am
 * Inhalt der Datei haengt.
 *
 * Anlass, gemessen 5.11. 14:40:34 MEZ: die Wache zaehlte 18 Waisen, und der Fall in
 * `tests/design-wache.test.ts` hielt die Sonde an der Zahl "mindestens 16" fest — ein
 * Biss, der mit der Datei mitwaechst. Seit die 18 Sitze geloescht sind (der Vertrag
 * verbietet in §10 die Regel, die niemand ruft), meldet die lebende Datei 0, und die
 * alte Kontrolle waere Stillstand, nicht Pruefung. Dieselbe Sonde faehrt jetzt gegen
 * eingesetzte Baelle: ein Fall, der nicht mehr gruen werden kann, indem die Datei
 * leerer wird.
 *
 * Ein Selektor mit Escape-Folge (`.text-\[8\.5px\]`) nennt keinen Haus-Baustein,
 * sondern uebergreift eine Tailwind-Willkuerklasse — und keine Wortliste eines
 * Bausteins nennt ein `[`. Die alte Sonde brach den Namen am Backslash ab und erfand
 * eine Waise namens `text-`: 18.10. gemessen, als die Leiter-Regeln in index.css
 * einzogen (drei Selektoren, 10 WillkuerGroessen).
 */
export function klassenAusSelektor(selektor) {
  const out = [];
  for (const m of String(selektor).matchAll(/\.([a-zA-Z][-\w]*)/g)) {
    if (selektor[m.index + m[0].length] === "\\") continue;
    out.push(m[1]);
  }
  return out;
}

/** Die gerufenen Klassen: className-Wortlisten, cn()/clsx()/twMerge()-Stringe, classList-Setzer. */
export function klassenAusWortlisten(text) {
  const geruft = new Set();
  const wort = (t) => String(t).replace(/\$\{[^}]*\}/g, " ").split(/\s+/).filter((k) => /^[A-Za-z_][-\w]*$/.test(k));
  const quelltext = String(text);
  for (const m of quelltext.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\})/g))
    for (const k of wort(m[1] ?? m[2] ?? m[3])) geruft.add(k);
  for (const m of quelltext.matchAll(/\b(?:cn|clsx|twMerge)\(([^)]*)\)/g))
    for (const q of m[1].matchAll(/(["'`])([^"'`]*)\1/g)) {
      // currentView === 'chat' ist eine Flaeche, keine Klasse
      if (/(?:===|!==|==|!=|>=|<=)$/.test(m[1].slice(0, q.index).trimEnd())) continue;
      for (const k of wort(q[2])) geruft.add(k);
    }
  for (const m of quelltext.matchAll(/classList\.(?:add|remove|toggle|replace)\(\s*["']([^"']+)["']/g))
    for (const k of wort(m[1])) geruft.add(k);
  return geruft;
}

const STAMM = new Set(("flex grid block inline hidden absolute relative fixed sticky overflow truncate w h size min-w min-h max-w max-h p px py pt pb pl pr m mx my mt mb ml mr space gap place items justify content self basis grow shrink top right bottom left inset z border rounded bg text font leading tracking whitespace break indent align list decoration underline no-underline normal-case uppercase lowercase capitalize italic shadow outline ring opacity blur backdrop transition delay duration ease animate scale rotate translate transform origin cursor select resize touch fill stroke antialiased sr not-sr pointer-events divide prose appearance line-clamp caret columns object aspect group peer container").split(" "));

/** Tailwind-Erkennung: Stamm als Praeschnitt, weil Staemme selbst Bindestriche tragen. */
export function istTailwindStamm(k) {
  return /^(sm|md|lg|xl|2xl|hover|focus|focus-visible|focus-within|active|disabled|first|last|odd|even|aria|data|max-min)-/.test(k) ||
    (() => {
      const t = k.split(/-(?=\d|[$[{a-z])/);
      return t.some((_, i) => STAMM.has(t.slice(0, i + 1).join("-")));
    })();
}

/** Wort gegen Wort, in beide Richtungen: Waise (Regel ohne Rufer) und nackter Rufer. */
export function waisenUndNackte(klassen, geruft) {
  const tot = [...klassen].filter((k) => !geruft.has(k) && !/^dark$/.test(k)).sort();
  const fremd = [...geruft].filter((k) => !klassen.has(k) && !istTailwindStamm(k)).sort();
  return { tot, fremd };
}
