import { describe, it, expect } from "vitest";
import { scanne, scanneVollstaendig, nachOrdner, type Dateisystem, type Verzeichniseintrag } from "../../src/scan/walker";

// Erfundener Dateibaum: so lassen sich genau die Faelle pruefen, die man auf
// einer echten Platte nicht herstellen moechte — ein .ssh voller Schluessel etwa.
function baum(eintraege: Record<string, Verzeichniseintrag[]>): Dateisystem {
  return {
    lies: (ordner) => eintraege[ordner] ?? [],
    verbinde: (a, b) => (a.endsWith("/") ? a + b : `${a}/${b}`),
  };
}
const ordner = (name: string): Verzeichniseintrag => ({ name, istOrdner: true, groesse: 0 });
const datei = (name: string, groesse = 500): Verzeichniseintrag => ({ name, istOrdner: false, groesse });

const HEIM = "/Users/a";
const beispiel = baum({
  [HEIM]: [ordner("Dokumente"), ordner(".ssh"), ordner("node_modules"), datei("notiz.md", 800), datei(".env", 40)],
  [`${HEIM}/Dokumente`]: [ordner("Kanzlei"), datei("Urlaub.md", 1200), datei("bild.png", 90000)],
  [`${HEIM}/Dokumente/Kanzlei`]: [datei("Fristen.md", 3000), datei("credentials.json", 200)],
  [`${HEIM}/.ssh`]: [datei("id_rsa", 1600), datei("config", 200)],
  [`${HEIM}/node_modules`]: [datei("README.md", 900)],
});

describe("scanneVollstaendig", () => {
  it("findet die Dokumente und laesst alles andere liegen", () => {
    const s = scanneVollstaendig([HEIM], beispiel);
    expect(s.funde.map((f) => f.pfad).sort()).toEqual([
      `${HEIM}/Dokumente/Kanzlei/Fristen.md`,
      `${HEIM}/Dokumente/Urlaub.md`,
      `${HEIM}/notiz.md`,
    ]);
  });

  it("betritt weder .ssh noch node_modules", () => {
    const s = scanneVollstaendig([HEIM], beispiel);
    expect(s.funde.some((f) => f.pfad.includes(".ssh"))).toBe(false);
    expect(s.funde.some((f) => f.pfad.includes("node_modules"))).toBe(false);
    expect(s.uebersprungeneOrdner).toBeGreaterThanOrEqual(2);
  });

  it("nennt die Gruende fuer das Ausgelassene", () => {
    const s = scanneVollstaendig([HEIM], beispiel);
    expect(s.abgelehnt.geheim).toBeGreaterThanOrEqual(2); // .env und credentials.json
    expect(s.abgelehnt.format).toBeGreaterThanOrEqual(1); // bild.png
    expect(s.gesehen).toBe(6);
  });

  it("kommt mit einem leeren Baum zurecht", () => {
    const s = scanneVollstaendig(["/nichts"], baum({}));
    expect(s.funde).toEqual([]);
    expect(s.gesehen).toBe(0);
    expect(s.abgeschnitten).toBe(false);
  });

  it("laesst ausdruecklich ausgeschlossene Pfade aus — etwa K3PTAs eigenen Datenordner", () => {
    const mitDaten = baum({
      [HEIM]: [ordner("Dokumente"), ordner(".kepta")],
      [`${HEIM}/Dokumente`]: [datei("a.md")],
      [`${HEIM}/.kepta`]: [datei("export.md", 5000)],
    });
    const s = scanneVollstaendig([HEIM], mitDaten, { ausgeschlossen: [`${HEIM}/.kepta`] });
    expect(s.funde.map((f) => f.pfad)).toEqual([`${HEIM}/Dokumente/a.md`]);
  });

  it("sieht denselben Ordner nur einmal an, auch wenn er zweimal genannt wird", () => {
    const s = scanneVollstaendig([HEIM, `${HEIM}/`, HEIM], beispiel);
    expect(s.funde).toHaveLength(3);
    expect(s.gesehen).toBe(6);
  });

  it("laesst auch eine ausgeschlossene WURZEL aus", () => {
    const s = scanneVollstaendig([HEIM], beispiel, { ausgeschlossen: [HEIM] });
    expect(s.funde).toEqual([]);
    expect(s.gesehen).toBe(0);
    expect(s.uebersprungeneOrdner).toBe(1);
  });

  it("laeuft nicht in einen Kreis, wenn ein Ordner sich selbst enthaelt", () => {
    const ring = baum({
      "/r": [ordner("a"), datei("x.md")],
      "/r/a": [ordner("b")],
      "/r/a/b": [ordner("a2")],
      "/r/a/b/a2": [datei("y.md")],
    });
    const s = scanneVollstaendig(["/r"], ring);
    expect(s.funde).toHaveLength(2);
  });
});

describe("Grenzen", () => {
  function vieleDateien(anzahl: number): Dateisystem {
    return baum({ "/v": Array.from({ length: anzahl }, (_, i) => datei(`n${i}.md`, 100)) });
  }

  it("haelt die Obergrenze ein und sagt, dass es mehr gaebe", () => {
    const s = scanneVollstaendig(["/v"], vieleDateien(50), { maxDateien: 20 });
    expect(s.funde).toHaveLength(20);
    expect(s.abgeschnitten).toBe(true);
    expect(s.gesehen).toBe(50);
  });

  it("geht nicht tiefer als erlaubt", () => {
    const tief = baum({
      "/t": [ordner("1")],
      "/t/1": [ordner("2")],
      "/t/1/2": [ordner("3")],
      "/t/1/2/3": [datei("tief.md")],
    });
    expect(scanneVollstaendig(["/t"], tief, { maxTiefe: 2 }).funde).toHaveLength(0);
    expect(scanneVollstaendig(["/t"], tief, { maxTiefe: 9 }).funde).toHaveLength(1);
  });

  it("laesst sich abbrechen", () => {
    const s = scanneVollstaendig(["/v"], vieleDateien(100), { abbrechen: () => true });
    expect(s.abgeschnitten).toBe(true);
    expect(s.funde).toHaveLength(0);
  });
});

describe("Fortschritt", () => {
  it("meldet zwischendurch den Stand, statt am Stueck zu blockieren", () => {
    const fs = baum({ "/v": Array.from({ length: 1000 }, (_, i) => datei(`n${i}.md`, 100)) });
    const lauf = scanne(["/v"], fs, {}, 250);
    let meldungen = 0;
    let schritt = lauf.next();
    while (!schritt.done) { meldungen++; schritt = lauf.next(); }
    expect(meldungen).toBeGreaterThanOrEqual(3);
    expect(schritt.value.funde).toHaveLength(1000);
  });

  it("meldet bei wenigen Dateien gar nicht zwischendurch", () => {
    const lauf = scanne([HEIM], beispiel, {}, 400);
    expect(lauf.next().done).toBe(true);
  });
});

describe("nachOrdner", () => {
  it("zaehlt die Funde nach ihrem obersten Ordner", () => {
    const verteilung = nachOrdner(
      [
        { pfad: `${HEIM}/Dokumente/a.md`, groesse: 1 },
        { pfad: `${HEIM}/Dokumente/b.md`, groesse: 1 },
        { pfad: `${HEIM}/Projekte/c.md`, groesse: 1 },
        { pfad: `${HEIM}/oben.md`, groesse: 1 },
      ],
      [HEIM]
    );
    expect(verteilung[0]).toEqual({ ordner: "Dokumente", anzahl: 2 });
    expect(verteilung.find((v) => v.ordner === "Projekte")?.anzahl).toBe(1);
    expect(verteilung.find((v) => v.ordner === "(top level)")?.anzahl).toBe(1);
  });

  it("haelt sich an die Grenze", () => {
    const funde = Array.from({ length: 40 }, (_, i) => ({ pfad: `${HEIM}/o${i}/x.md`, groesse: 1 }));
    expect(nachOrdner(funde, [HEIM], 5)).toHaveLength(5);
  });

  it("kommt mit Pfaden ausserhalb der Wurzeln zurecht", () => {
    expect(nachOrdner([{ pfad: "/anderswo/x.md", groesse: 1 }], [HEIM])).toHaveLength(1);
  });

  it("gruppiert Windows-Pfade nach demselben Prinzip", () => {
    const v = nachOrdner(
      [
        { pfad: "C:\\Users\\a\\Dokumente\\x.md", groesse: 1 },
        { pfad: "C:\\Users\\a\\oben.md", groesse: 1 },
      ],
      ["C:\\Users\\a"]
    );
    expect(v.find((x) => x.ordner === "Dokumente")?.anzahl).toBe(1);
    expect(v.find((x) => x.ordner === "(top level)")?.anzahl).toBe(1);
  });
});

describe("Der Nutzer darf eigene Ordner aussen vor lassen", () => {
  // Die Forderung: "möchte ich auch explizit, dass man bei K3PTA einstellen
  // kann was genau und von wo genau er wissen herausziehen kann und darf."
  const HEIM2 = "/Users/b";
  const mitArchiv = baum({
    [HEIM2]: [ordner("Notizen"), ordner("Archiv")],
    [`${HEIM2}/Notizen`]: [datei("aktuell.md", 900)],
    [`${HEIM2}/Archiv`]: [datei("alt.md", 900), datei("aelter.md", 900)],
  });

  it("betritt einen abgewaehlten Ordner gar nicht erst", () => {
    const ohne = scanneVollstaendig([HEIM2], mitArchiv);
    expect(ohne.funde.map((f) => f.pfad)).toContain(`${HEIM2}/Archiv/alt.md`);

    const mit = scanneVollstaendig([HEIM2], mitArchiv, {
      einstellungen: { zusaetzlichAusgelassen: ["archiv"] },
    });
    const pfade = mit.funde.map((f) => f.pfad);
    expect(pfade).toContain(`${HEIM2}/Notizen/aktuell.md`);
    expect(pfade.some((p) => p.includes("/Archiv/"))).toBe(false);
    expect(mit.uebersprungeneOrdner).toBeGreaterThan(ohne.uebersprungeneOrdner);
  });

  it("achtet nicht auf Gross- und Kleinschreibung", () => {
    const mit = scanneVollstaendig([HEIM2], mitArchiv, {
      einstellungen: { zusaetzlichAusgelassen: ["ARCHIV"] },
    });
    expect(mit.funde.some((f) => f.pfad.includes("/Archiv/"))).toBe(false);
  });

  it("reicht auch die Endungswahl bis zur Datei durch", () => {
    const gemischt = baum({
      [HEIM2]: [datei("a.md", 500), datei("b.txt", 500), datei("c.pdf", 500)],
    });
    const nurMd = scanneVollstaendig([HEIM2], gemischt, { einstellungen: { endungen: [".md"] } });
    expect(nurMd.funde.map((f) => f.pfad)).toEqual([`${HEIM2}/a.md`]);
  });
});
