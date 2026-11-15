// Die Wache hinter dem Einstellungs-Fenster (#85).
//
// Zwei Sätze, die diese Datei hält — beide abgeleitet, keiner abgeschrieben:
//
//   1. Was die App in localStorage schreibt, muss von einem Spiegel-Netz
//      gedeckt sein. Die Electron-Hülle bekommt bei jedem Start einen FREIEN
//      Port, und localStorage hängt am Ursprung inkl. Port: ein Schlüssel ohne
//      Netz ist nach einem Neustart weg, obwohl die Fläche ihn brav speichert.
//      Gedeckt heisst hier: `gehoertUns()` aus src/lib/settings.ts sagt true —
//      dasselbe Prädikat, das die Laufzeit benutzt, nicht eine Liste, die ich
//      nachpflege.
//
//   2. Ein Wert, der beim Start eine WIRKUNG braucht (er malt etwas an das
//      Dokument), muss von der Boot-Funktion aus erreichbar sein. Sonst sagt die
//      Fläche „115 %" und zeigt 100 % — genau der Fall, den der Lauf auf Port
//      9421/9422 am 14.10. gefunden hat: `ki_gehirn_zoom` überlebte den
//      Neustart, die Textgröße blieb trotzdem bei 14 px.
//
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { gehoertUns } from "../../src/lib/settings";

const WURZELN = ["src", "server"];
function dateien(re: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(re, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const voll = path.join(re, e.name);
    if (e.isDirectory()) out.push(...dateien(voll));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(voll);
  }
  return out;
}
const alle = WURZELN.flatMap(dateien);
const text = new Map(alle.map((d) => [d, fs.readFileSync(d, "utf-8")]));

// Schlüssel auflösen: Konstantenname -> Wert, sonst sieht die Wache Namen, wo
// sie Werte prüfen muss (die erste Fassung genau dieses Fehlers meldete zwei
// arbeitende Regler als leer).
const namen = new Map<string, string>();
for (const [, t] of text) {
  for (const m of t.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*['"`]((?:kepta|ki_gehirn)_[\w-]+|theme)['"`]/g)) {
    if (!namen.has(m[1])) namen.set(m[1], m[2]);
  }
}

const geschrieben = new Map<string, string>();
for (const [datei, t] of text) {
  for (const m of t.matchAll(/localStorage\.setItem\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`|([A-Za-z_$][\w$.]*))/g)) {
    const roh = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").split(".").pop() ?? "";
    if (!roh) continue;
    const key = namen.get(roh) ?? roh;
    if (!/^(kepta_|ki_gehirn_)|^theme$/.test(key) && !namen.has(roh)) continue; // fremde Speicher (Bibliotheken) gehören nicht uns
    if (!geschrieben.has(key)) geschrieben.set(key, datei);
  }
}

describe("Wache: jeder geschriebene Schlüssel überlebt den Neustart", () => {
  it(`deckt alle ${geschrieben.size} Schlüssel ab, die die App schreibt`, () => {
    const ohneNetz = [...geschrieben.entries()].filter(([k]) => !gehoertUns(k));
    expect(ohneNetz, `ohne Spiegel-Netz (überlebt keinen Neustart): ${ohneNetz.map(([k, d]) => `${k} in ${d}`).join(", ") || "keine"}`).toEqual([]);
  });

  it("findet überhaupt eine Menge — eine leere Sonde ist kein Beweis", () => {
    // Fällt diese Zahl, ist die Sonde kaputt, nicht die App: die vorige Fassung
    // las Object.keys(localStorage) an einer Hülle und meldete null Schlüssel.
    expect(geschrieben.size).toBeGreaterThanOrEqual(20);
  });

  it("kennt die zwei Netze, und die engeren sind eine Teilmenge der weiteren", () => {
    // prefs.ts spiegelt nur PREF_KEYS in ui_prefs; settings.ts spiegelt nach
    // Präfix. Ein Schlüssel kann also im weiteren, aber nicht im engeren Netz
    // stehen — das ist die Wahrheit hinter der Zahl 11 gegen 23.
    const prefsText = text.get("src/lib/prefs.ts") ?? "";
    const block = /export const PREF_KEYS\s*=\s*\[([\s\S]*?)\]/.exec(prefsText);
    const eng = block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    expect(eng.length).toBeGreaterThan(0);
    for (const k of eng) expect(gehoertUns(k), `${k} in PREF_KEYS, aber nicht „unser" — die Netze laufen auseinander`).toBe(true);
  });
});

describe("Wache: ein Wert mit Wirkung muss beim Start angewendet werden", () => {
  const bootText = text.get("src/lib/settings.ts") ?? "";
  const main = text.get("src/main.tsx") ?? "";

  // Alle exportierten Funktionen in src/lib, die etwas an das Dokument malen.
  const malend: { name: string; datei: string }[] = [];
  for (const [datei, t] of text) {
    if (!datei.startsWith("src/lib/") || datei.endsWith("settings.ts")) continue;
    for (const m of t.matchAll(/export function ([A-Za-z_$][\w$]*)\s*\(([\s\S]{0,700}?)\n\}/g)) {
      if (/document\.(body|documentElement)/.test(m[2]) && /style|classList|\.zoom/.test(m[2])) malend.push({ name: m[1], datei });
    }
  }

  it("weiß, welche Funktionen beim Start wirken müssten", () => {
    expect(malend.length, "die Sonde findet keine malende Funktion — sie prüft dann nichts").toBeGreaterThanOrEqual(1);
    expect(malend.map((m) => m.name)).toContain("wendeZoomAn");
  });

  it("ruft jede davon aus dem Boot-Weg", () => {
    const nieErreicht = malend.filter((m) => {
      const imBoot = new RegExp(`\\b${m.name}\\s*\\(`).test(bootText);
      const inMain = new RegExp(`\\b${m.name}\\s*\\(`).test(main);
      return !imBoot && !inMain;
    });
    expect(nieErreicht, `malt erst, wenn jemand den Regler anfasst — nach einem Neustart bleibt die Fläche leer: ${nieErreicht.map((m) => `${m.name} (${m.datei})`).join(", ") || "keine"}`).toEqual([]);
  });
});

describe("Die Boot-Folge wendet die gespeicherte Textgröße an", () => {
  beforeEach(() => { localStorage.clear(); document.body.removeAttribute("style"); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("130 % bleiben 130 % über den Neustart — gespeichert UND gemalt", async () => {
    localStorage.setItem("ki_gehirn_zoom", "130");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ki_gehirn_zoom: "130" }), { status: 200, headers: { "content-type": "application/json" } })));
    const { starteEinstellungen } = await import("../../src/lib/settings");
    await starteEinstellungen();
    expect(document.body.style.zoom).toBe("1.3");
  });

  it("ohne gespeicherte Größe bleibt das Dokument unbearbeitet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })));
    const { starteEinstellungen } = await import("../../src/lib/settings");
    await starteEinstellungen();
    expect(document.body.style.zoom).toBe("");
  });
});
