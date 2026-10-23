// Texte der Oberflaeche und Schriftgroesse. K3PTA ist englisch — eine Sprache,
// kein Umschalter (so entschieden mit 2.6.0, bestaetigt am 11.9.2026; der
// Deutsch-Umschalter aus 2.10 ist wieder entfernt). Die Tabelle gibt gemeinsam
// benutzten Texten einen Namen; t() liefert den Text zum Schluessel oder, fehlt
// er, den Schluessel selbst.
const ZOOM_KEY = "ki_gehirn_zoom";

/** Exportiert fuer den Waechter in tests/lib/uiText.test.ts: kein Eintrag ist deutsch. */
export const TEXTE: Record<string, string> = {
  "nav.knowledge": "Knowledge",
  "nav.chat": "Chat",
  "nav.graph": "Graph",
  "nav.settings": "Settings",
  "nav.today": "Today",
  "nav.dossier": "Dossier",
  "nav.activity": "Activity",
  "nav.team": "Team",
  "search.placeholder": "Search… (⌘K for commands)",
  "search.semantic": "Semantic search",
  "search.results": "Results",
  "action.new": "New",
  "list.all": "All",
  "list.byFile": "By file",
  "list.byType": "By type",
  "list.period": "Period",
  "list.noSource": "No source",
  "list.today": "Today",
  "list.thisWeek": "This week",
  "list.older": "Older",
  "list.loadMore": "Load more",
  "list.empty.title": "No entries yet",
  // Drei Kantenarten, drei Namen. „real connection" deckte zwei davon zu — und
  // seit dem 6.10. liegen beide im Bild: die Spinne von der Notiz zum Begriff
  // und die Behauptung zwischen zwei Begriffen.
  "legend.claim": "claimed link",
  "legend.mention": "mention",
  "legend.hierarchy": "hierarchy",
  "legend.similarity": "Similarity",
  // Der zweite Kanal im Knoten: ein Buchstabe, der die Art auch ohne Farbe
  // nennt, und eine Zahl, die sagt, was ein Begriff traegt.
  "legend.glyph": "A letter in a node is its type · A number in a concept is the notes behind it · ×N means the group is folded",
  // Die Kantkarte: was eine Kante ist, wenn sie keinen Typ nennt.
  "edge.similar": "similarity",
  "preview.close": "Close",
  "preview.edit": "Edit",
  "preview.copyText": "Copy text",
  "preview.copied": "Copied",
  "preview.open": "Open",
  "preview.part": "Part",
  "preview.confidence": "Confidence",
  "hint.force": "Drag: a node stays where you drop it · Double-click: open the note · Wheel: zoom · Size = connections · Width = claims · Hover a link to read it",
  "hint.tree": "Root → type → entity → note · Double-click a group: fold it, the count stays · Double-click a note: open it · Drag: pan · Wheel: zoom",
  "hint.semantic": "Positions: the projection of your vectors · Distance is meaning, not a claim · Drag: pan · Wheel: zoom · Double-click: open the note",
  "list.noMatch": "No match",
  "settings.display": "Display",
  "settings.fontSize": "Text size",
  "team.loading": "Loading team…",
  "team.title": "Team workspace",
  // Kein Angebot, kein Preis: Team-Speicher ist eine Funktion der verwalteten
  // Konfiguration. Fehlt die Rollen-Datei, ist die Ansicht leer und sagt warum.
  "team.keineRollen": "A team workspace is switched on by your organisation's managed settings (managed-settings.json). Nothing was provisioned on this computer, so there is nothing to show — every note you make stays personal and encrypted here.",
  "team.rollen": "Roles",
  "team.rollenLeer": "No roles assigned yet — your admin lists them in the managed settings file.",
  "team.dieserRechner": "this computer",
  "team.mdmHinweis": "Roles are centrally managed (managed-settings.json via MDM). This view shows them; it does not edit them.",
  "team.notizen": "Team workspace notes",
  "team.notizenLeer": "No team notes yet — save a note with a team workspace to share it.",
  "team.notizenHinweis": "visible to everyone with a role in this workspace",
  // Kein Angebot, kein Preis: Fremdcode wird nicht geladen, und die Gratis-Stufe kennt darum
  // weder Schluessel noch Sperre. Der Satz steht in der Flaeche, damit die Abwesenheit eine
  // Erklaerung hat und kein leeres Regal ist.
  "settings.keineFremderweiterungen": "K3PTA has no plugin store and loads no third-party code. Everything in this window is the app's own work, and the download is the same program on a personal machine and on a managed one — nothing is switched off for lack of a key, because nothing is switched on by payment either.",
};

/** Text zum Schluessel; fehlt er, der Schluessel selbst. */
export function t(schluessel: string): string {
  return TEXTE[schluessel] ?? schluessel;
}

export function getZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v === 115 || v === 130 ? v : 100;
  } catch { return 100; }
}

export function setZoom(prozent: number): void {
  try { localStorage.setItem(ZOOM_KEY, String(prozent)); } catch { /* ignore */ }
}

export function getZoomProzent(): number {
  return getZoom();
}

/** Schriftgröße anwenden — die App-Shell ist Chromium, zoom greift sauber. */
export function wendeZoomAn(): void {
  const z = getZoom();
  (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = z === 100 ? "" : String(z / 100);
}
