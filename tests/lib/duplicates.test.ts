import { describe, it, expect } from "vitest";
import {
  findDuplicateGroups,
  normalizeTitle,
  normalizeContent,
  contentTokens,
  contentWords,
  contentShingles,
  jaccard,
  pairKey,
  signatureLength,
  suggestKeeper,
  reasonLabel,
  redundantCount,
} from "../../src/lib/duplicates";
import type { Memory } from "../../src/types";

// Das Dashboard zeigte "9 duplicates" und einen Knopf, der die ERSTE Notiz im
// Editor oeffnete. Welche Paare gemeint waren, stand nirgends; entfernen liess
// sich nichts. Zudem brach die Suche nach acht Funden ab — die Zahl war also
// nicht einmal die Wahrheit. Diese Tests halten beide Punkte fest.

let zaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`,
    userId: "local",
    title: `Titel ${zaehler}`,
    content: `Inhalt ${zaehler}`,
    tags: [],
    createdAt: 1_000 + zaehler,
    updatedAt: 1_000 + zaehler,
    ...over,
  };
}

const LANG = "Docker startet den Dienst im Hintergrund und legt ein Volume an, damit die Datenbank einen Neustart ueberlebt und nichts verloren geht.";

describe("Normalisierung und Mengenmasse", () => {
  it("vereinheitlicht Titel ueber Gross-/Kleinschreibung und Leerraum", () => {
    expect(normalizeTitle("  Docker   Setup ")).toBe("docker setup");
    expect(normalizeTitle("DOCKER SETUP")).toBe(normalizeTitle("docker setup"));
  });

  it("normalisiert Inhalte nach derselben Regel", () => {
    expect(normalizeContent("A\n\nB")).toBe("a b");
  });

  it("zerlegt Titel und Inhalt gemeinsam in Woerter ab zwei Zeichen", () => {
    const ts = contentTokens({ title: "Docker", content: "a Volume!" });
    expect(ts.has("docker")).toBe(true);
    expect(ts.has("volume")).toBe(true);
    expect(ts.has("a")).toBe(false);
  });

  it("jaccard: identisch = 1, disjunkt = 0, leer = 0", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });

  it("jaccard: halbe Ueberschneidung ergibt 1/3", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 6);
  });

  it("pairKey ist richtungslos", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
});

describe("signatureLength: die Garantie des Prefix-Filters", () => {
  it("waechst mit der Menge und faellt mit der Schwelle", () => {
    expect(signatureLength(20, 0.82)).toBeLessThan(signatureLength(200, 0.82));
    expect(signatureLength(100, 0.5)).toBeGreaterThan(signatureLength(100, 0.9));
  });

  it("indexiert nie weniger als ein Wort und nie mehr als noetig", () => {
    expect(signatureLength(0, 0.82)).toBe(0);
    expect(signatureLength(1, 0.99)).toBe(1);
    expect(signatureLength(5000, 0.1)).toBeLessThanOrEqual(32);
  });

  it("deckt bei Schwelle 0.82 rund ein Fuenftel der Woerter ab", () => {
    // 100 - ceil(0.82 * 100) + 1 = 19
    expect(signatureLength(100, 0.82)).toBe(19);
  });

  it("haelt die Garantie auch bei stark ungleichen Mengen", () => {
    // Genau der Fall, an dem die vorige Formel scheiterte: 20 gegen 31 Woerter
    // bei Schwelle 0.5. Der Prefix der laengeren Menge muss mindestens 15 sein.
    expect(signatureLength(31, 0.5)).toBeGreaterThanOrEqual(15);
  });
});

describe("findDuplicateGroups: exakte Treffer", () => {
  it("findet gleiche Titel", () => {
    const a = note({ title: "Docker Setup" });
    const b = note({ title: "docker   setup" });
    const g = findDuplicateGroups([a, b, note()]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("identical-title");
    expect(g[0].similarity).toBe(1);
    expect(g[0].members.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("findet gleichen Inhalt trotz anderem Titel", () => {
    const a = note({ title: "A", content: LANG });
    const b = note({ title: "B", content: LANG });
    const g = findDuplicateGroups([a, b]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("identical-content");
  });

  it("ignoriert kurze identische Inhalte — sonst waere jede Stichpunktnotiz ein Duplikat", () => {
    expect(findDuplicateGroups([note({ title: "A", content: "ok" }), note({ title: "B", content: "ok" })])).toEqual([]);
  });

  it("ignoriert leere Titel als Gruppierungsgrund", () => {
    expect(findDuplicateGroups([note({ title: "", content: "x" }), note({ title: "", content: "y" })])).toEqual([]);
  });

  it("liefert bei weniger als zwei Eintraegen nichts", () => {
    expect(findDuplicateGroups([])).toEqual([]);
    expect(findDuplicateGroups([note()])).toEqual([]);
  });
});

describe("findDuplicateGroups: Nah-Duplikate", () => {
  it("erkennt fast gleiche Texte oberhalb der Schwelle", () => {
    const a = note({ title: "Docker", content: LANG });
    const b = note({ title: "Docker", content: LANG + " Nachtrag." });
    const g = findDuplicateGroups([a, b]);
    expect(g).toHaveLength(1);
    expect(g[0].similarity).toBeGreaterThan(0.9);
    expect(g[0].similarity).toBeLessThan(1);
  });

  it("verschont Notizen sehr verschiedener Laenge", () => {
    // Der kurze Text steckt fast ganz im langen — trotzdem ist das keine Dublette.
    const kurz = note({ title: "K", content: LANG });
    const lang = note({ title: "L", content: LANG + " " + LANG + " " + LANG });
    expect(findDuplicateGroups([kurz, lang], { threshold: 0.1 })).toEqual([]);
  });

  it("laesst deutlich verschiedene Texte in Ruhe", () => {
    const a = note({ title: "Docker", content: LANG });
    const b = note({ title: "Kochen", content: "Echte Carbonara kommt ohne Sahne aus, nur Ei, Pecorino, Guanciale und Pfeffer gehoeren hinein." });
    expect(findDuplicateGroups([a, b])).toEqual([]);
  });

  it("respektiert eine eigene Schwelle", () => {
    const a = note({ title: "Docker", content: LANG });
    const b = note({ title: "Abweichung", content: LANG + " Und noch deutlich mehr Text, der beide Notizen klar voneinander unterscheidet." });
    // Bei 0,82 reicht die Ueberschneidung nicht mehr, bei 0,5 schon.
    expect(findDuplicateGroups([a, b])).toHaveLength(0);
    expect(findDuplicateGroups([a, b], { threshold: 0.5 })).toHaveLength(1);
  });

  it("findet ein aehnliches Paar auch dann, wenn nur EINE Seite eigene Woerter hat", () => {
    // Genau hier versagte die feste Sechs-Wort-Signatur: die Signatur der
    // laengeren Notiz bestand aus ihren Eigenwoertern, die der kuerzeren aus
    // gemeinsamen — kein gemeinsamer Bucket, kein Vergleich, kein Fund.
    const a = note({ title: "Docker", content: LANG });
    const b = note({ title: "Docker", content: LANG + " Nachtrag." });
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
  });

  it("bricht bei erschoepftem Vergleichsbudget ab, statt zu haengen", () => {
    const a = note({ title: "Docker", content: LANG });
    const b = note({ title: "Docker Notiz", content: LANG + " Nachtrag." });
    expect(findDuplicateGroups([a, b], { maxComparisons: 0 })).toEqual([]);
  });
});

describe("findDuplicateGroups: Gruppen statt Paare", () => {
  it("fasst drei gleiche Titel zu EINER Gruppe zusammen", () => {
    const ms = [note({ title: "Gleich" }), note({ title: "Gleich" }), note({ title: "Gleich" })];
    const g = findDuplicateGroups(ms);
    expect(g).toHaveLength(1);
    expect(g[0].members).toHaveLength(3);
  });

  it("zaehlt vollstaendig — der alte Abbruch nach acht Funden ist weg", () => {
    // 30 Paare mit je eigenem Titel: frueher meldete das Dashboard hoechstens
    // neun und verschwieg den Rest.
    const ms: Memory[] = [];
    for (let i = 0; i < 30; i++) {
      ms.push(note({ title: `Paar ${i}` }), note({ title: `Paar ${i}` }));
    }
    const g = findDuplicateGroups(ms);
    expect(g).toHaveLength(30);
    expect(redundantCount(g)).toBe(30);
  });

  it("sortiert groessere Gruppen nach oben", () => {
    const ms = [
      note({ title: "Drei" }), note({ title: "Drei" }), note({ title: "Drei" }),
      note({ title: "Zwei" }), note({ title: "Zwei" }),
    ];
    const g = findDuplicateGroups(ms);
    expect(g[0].members).toHaveLength(3);
    expect(g[1].members).toHaveLength(2);
  });

  it("haelt den Gruppenschluessel ueber Neuberechnungen stabil", () => {
    const ms = [note({ title: "Gleich" }), note({ title: "Gleich" })];
    expect(findDuplicateGroups(ms)[0].key).toBe(findDuplicateGroups([...ms].reverse())[0].key);
  });
});

describe("findDuplicateGroups: Ablehnung durch den Nutzer", () => {
  it("verbindet ein abgelehntes Paar nicht mehr", () => {
    const a = note({ title: "Gleich" });
    const b = note({ title: "Gleich" });
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
    expect(findDuplicateGroups([a, b], { dismissed: new Set([pairKey(a.id, b.id)]) })).toEqual([]);
  });
});

describe("suggestKeeper", () => {
  it("behaelt den inhaltsreichsten Eintrag", () => {
    const kurz = note({ content: "kurz" });
    const lang = note({ content: LANG });
    expect(suggestKeeper([kurz, lang]).id).toBe(lang.id);
  });

  it("entscheidet Gleichstand ueber das juengere Datum", () => {
    const alt = note({ content: "gleich lang", updatedAt: 1 });
    const neu = note({ content: "gleich lang", updatedAt: 2 });
    expect(suggestKeeper([alt, neu]).id).toBe(neu.id);
  });

  it("entscheidet vollstaendigen Gleichstand deterministisch ueber die ID", () => {
    const a = { ...note({ content: "x", updatedAt: 5 }), id: "aaa" };
    const b = { ...note({ content: "x", updatedAt: 5 }), id: "bbb" };
    expect(suggestKeeper([b, a]).id).toBe("aaa");
    expect(suggestKeeper([a, b]).id).toBe("aaa");
  });

  it("steht in der Gruppe vorn", () => {
    const kurz = note({ title: "Gleich", content: "kurz" });
    const lang = note({ title: "Gleich", content: LANG });
    const g = findDuplicateGroups([kurz, lang])[0];
    expect(g.members[0].id).toBe(lang.id);
    expect(g.keepId).toBe(lang.id);
  });
});

describe("Beschriftung und Zaehlung", () => {
  it("benennt jeden Grund verstaendlich", () => {
    expect(reasonLabel("identical-title", 1)).toBe("Same title");
    expect(reasonLabel("identical-content", 1)).toBe("Same content");
    expect(reasonLabel("near-identical", 0.874)).toBe("87 % word overlap");
  });

  it("redundantCount zaehlt, was nach dem Aufraeumen verschwindet", () => {
    expect(redundantCount([])).toBe(0);
    const g = findDuplicateGroups([note({ title: "G" }), note({ title: "G" }), note({ title: "G" })]);
    expect(redundantCount(g)).toBe(2);
  });
});

describe("Ketten", () => {
  it("verschmilzt eine Kette fast gleicher Notizen zu einer Gruppe", () => {
    // A ~ B ~ C, ohne dass A und C direkt aehnlich sein muessen: Union-Find
    // zieht die Kette zusammen. Das ist gewollt — beim Aufraeumen will man die
    // ganze Familie sehen, nicht drei getrennte Paare.
    const ms = [
      note({ title: "Kette", content: LANG }),
      note({ title: "Kette", content: LANG + " Eins." }),
      note({ title: "Kette", content: LANG + " Zwei." }),
    ];
    const g = findDuplicateGroups(ms);
    expect(g).toHaveLength(1);
    expect(g[0].members).toHaveLength(3);
  });
});

describe("Wortpaare statt Einzelwoerter", () => {
  it("bildet Wortpaare ueber Titel und Inhalt hinweg", () => {
    expect([...contentShingles({ title: "Docker", content: "startet den Dienst" })]).toEqual([
      "docker startet", "startet den", "den dienst",
    ]);
  });

  it("faellt bei einem einzigen Wort auf das Wort selbst zurueck", () => {
    expect([...contentShingles({ title: "", content: "docker" })]).toEqual(["docker"]);
    expect([...contentShingles({ title: "", content: "" })]).toEqual([]);
  });

  it("behaelt einzelne Ziffern, verwirft einzelne Buchstaben", () => {
    // "Eintrag 0" und "Eintrag 1" waren nach der alten Laengenregel wortgleich —
    // und damit faelschlich Dubletten.
    expect(contentWords({ title: "", content: "Eintrag 0 x 12" })).toEqual(["eintrag", "0", "12"]);
  });

  it("trennt einen ausgetauschten Wortstamm schaerfer als eine Wortmenge", () => {
    const a = { title: "", content: "der bericht nennt fuenf faelle und wurde am montag versendet an alle" };
    const b = { title: "", content: "der bericht nennt sieben faelle und wurde am montag versendet an alle" };
    // Als Wortmenge fast gleich, als Wortpaare deutlich verschieden.
    expect(jaccard(contentTokens(a), contentTokens(b))).toBeGreaterThan(0.8);
    expect(jaccard(contentShingles(a), contentShingles(b))).toBeLessThan(0.8);
  });

  it("haelt eine echte Kopie mit Zusatz weiterhin ueber der Schwelle", () => {
    const a = { title: "Wartung", content: LANG };
    const b = { title: "Wartung", content: LANG + " Nachtrag." };
    expect(jaccard(contentShingles(a), contentShingles(b))).toBeGreaterThan(0.85);
  });
});

describe("Schablonen: keine Kette aus hunderten Notizen", () => {
  // Der Befund vom 6.9.2026: 411 Testnotizen, davon 11 echte Dubletten — die
  // Oberflaeche meldete 396. Ursache waren Eintraege nach einer Schablone, die
  // sich nur in einer Zahl unterschieden; ueber Union-Find wuchsen sie zu EINER
  // Riesengruppe zusammen. Solche Familien sind keine Dubletten.
  function schablone(anzahl: number): Memory[] {
    return Array.from({ length: anzahl }, (_, i) =>
      note({
        title: `agentdojo/runs/claude-${i}`,
        content: `Lauf ${i} des Agenten mit dem Werkzeugsatz A, Ergebnis erfolgreich, Dauer ${i} Sekunden, Protokoll unter runs/claude-${i}/log.txt abgelegt.`,
      })
    );
  }

  it("verwirft eine Aehnlichkeitskette, die zu gross wird", () => {
    expect(findDuplicateGroups(schablone(60))).toEqual([]);
  });

  it("findet echte Dubletten trotzdem, wenn sie in derselben Menge stecken", () => {
    const echt = note({ title: "Echt doppelt", content: "Diese Notiz existiert versehentlich zweimal in der Wissensbasis." });
    const kopie = { ...echt, id: "kopie" };
    const g = findDuplicateGroups([...schablone(60), echt, kopie]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toBe("identical-title");
  });

  it("laesst kleine Ketten unterhalb der Grenze bestehen", () => {
    const g = findDuplicateGroups(schablone(4));
    expect(g.length).toBeLessThanOrEqual(1);
  });
});

describe("Skalierung", () => {
  it("bewaeltigt 2000 Notizen, ohne in die Alle-gegen-alle-Falle zu laufen", () => {
    // Inhalte muessen wirklich verschieden sein, sonst misst der Test nur, dass
    // 2000 Beinahe-Dubletten korrekt zu einer Kette verschmelzen.
    const woerter = ["hafen", "segel", "anker", "kompass", "leuchtturm", "duene", "moewe", "flut", "ebbe", "kiel"];
    const ms: Memory[] = [];
    for (let i = 0; i < 2000; i++) {
      const eigen = Array.from({ length: 12 }, (_, k) => `${woerter[(i + k) % woerter.length]}${i * 13 + k}`).join(" ");
      ms.push(note({ title: `Notiz ${i}`, content: `Eine Aufzeichnung ueber ${eigen} mit ausreichender Laenge fuer den Nahvergleich.` }));
    }
    ms.push(note({ title: "Doppelt" }), note({ title: "Doppelt" }));
    // 2002 Notizen sind 2 Mio. Paare — die alte Doppelschleife haette das im
    // Browser bei jedem Tastendruck gerechnet.
    // Eine Einzelstichprobe misst den Runner mit (GC, Scheduler, fremde Last).
    // Zwei Laeufe, der beste zaehlt; die Latte bleibt 3000. findDuplicateGroups
    // ist rein, die Wiederholung ist also dieselbe Messung, nicht zwei Zustaende.
    let dauer = Infinity;
    for (let i = 0; i < 2; i++) {
      const start = performance.now();
      const g = findDuplicateGroups(ms);
      dauer = Math.min(dauer, performance.now() - start);
      expect(g).toHaveLength(1);
    }
    expect(dauer, `zwei Laeufe, bester ${dauer.toFixed(0)} ms`).toBeLessThan(3000);
  });
});
