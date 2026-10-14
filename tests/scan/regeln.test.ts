import { describe, it, expect } from "vitest";
import {
  beurteileDatei,
  istGeheimeDatei,
  istGeheimerPfad,
  istUebersprungenerOrdner,
  istLesbaresFormat,
  grundLabel,
  teileUnterWurzel,
  MAX_DATEI_BYTES,
  GEHEIME_ORDNER,
  LESBARE_ENDUNGEN,
} from "../../src/scan/regeln";

// Der Rechner-Scan ist die eingriffsstaerkste Funktion von K3PTA. Alles bleibt
// auf dem Geraet, aber was in der Wissensbasis steht, koennen angeschlossene
// Agenten ueber MCP lesen — ein eingesammelter Schluessel ist damit nicht mehr
// nur eine Datei auf der Platte. Eine Luecke in diesen Regeln ist kein
// Schoenheitsfehler, sondern ein Datenleck. Entsprechend ausfuehrlich.

// Nachtrag 11.9.2026: coverage/ fehlte in der Liste. Ein Scan des ganzen
// Heimordners nahm deshalb 950 Teile aus 62 Coverage-Seiten mit —
// Quelltextansichten mit Zeilennummern, die sich bei jedem Testlauf neu schreiben.
describe("Generierte Testberichte werden uebersprungen", () => {
  it.each(["coverage", "lcov-report", "htmlcov"])("betritt %s nicht", (ordner) => {
    expect(istUebersprungenerOrdner(ordner)).toBe(true);
    expect(beurteileDatei(`/Users/a/projekt/${ordner}/src/app.ts.html`, 100)).toEqual({ aufnehmen: false, grund: "systemordner" });
  });

  it("auch tief im Pfad, so wie vitest die Berichte ablegt", () => {
    expect(beurteileDatei("/Users/a/kepta/coverage/lcov-report/kepta/src/lib/store.ts.html", 5000, "/Users/a").grund).toBe("systemordner");
  });
});

describe("Geheimnisse werden nie gelesen", () => {
  const schluesseldateien = [
    ".env", ".env.local", ".env.production",
    "id_rsa", "id_rsa.pub", "id_ed25519", "id_ecdsa",
    "server.pem", "cert.key", "bundle.p12", "store.jks", "keys.kdbx",
    ".netrc", ".npmrc", ".pypirc", ".git-credentials", ".htpasswd",
    "known_hosts", "authorized_keys",
    "credentials", "credentials.json", "secrets.yaml", "secret.txt",
    "login.keychain-db", "my.wallet",
    "api-key.txt", "aws_secret_access_key.txt", "db_password.md",
  ];

  it.each(schluesseldateien)("lehnt %s ab", (name) => {
    expect(istGeheimeDatei(name), `${name} wurde durchgelassen`).toBe(true);
    expect(beurteileDatei(`/Users/a/${name}`, 100)).toEqual({ aufnehmen: false, grund: "geheim" });
  });

  it("prueft unabhaengig von Gross- und Kleinschreibung", () => {
    expect(istGeheimeDatei("ID_RSA")).toBe(true);
    expect(istGeheimeDatei("Credentials.JSON")).toBe(true);
    expect(istGeheimeDatei("Server.PEM")).toBe(true);
  });

  it.each([...GEHEIME_ORDNER])("betritt %s nicht", (ordner) => {
    expect(istUebersprungenerOrdner(ordner)).toBe(true);
    expect(beurteileDatei(`/Users/a/${ordner}/notiz.md`, 100).grund).toBe("geheim");
  });

  it("erkennt einen geheimen Ordner auch tief im Pfad", () => {
    expect(istGeheimerPfad("/Users/a/Projekte/backup/.ssh/config")).toBe(true);
    expect(istGeheimerPfad("/Users/a/Dokumente/notiz.md")).toBe(false);
  });

  it("haelt einen Ordner, der nur SO HEISST wie eine Datei, nicht faelschlich fuer harmlos", () => {
    expect(beurteileDatei("/Users/a/.aws/config", 10).grund).toBe("geheim");
    expect(beurteileDatei("/Users/a/1Password/export.md", 10).grund).toBe("geheim");
  });

  it("laesst eine harmlose Notiz mit dem Wort 'Passwort' im FLIESSTEXT zu — geprueft wird der Name", () => {
    // Der Inhalt wird nicht gelesen; die Regel greift am Dateinamen. Eine Notiz
    // "Urlaubsplanung.md" bleibt drin, "passwords.md" nicht.
    expect(beurteileDatei("/Users/a/Urlaubsplanung.md", 100).aufnehmen).toBe(true);
    expect(beurteileDatei("/Users/a/passwords.md", 100).grund).toBe("geheim");
  });
});

describe("Ordner ohne Erkenntniswert", () => {
  it.each(["node_modules", ".git", "__pycache__", "dist", "build", "Caches", "AppData", "$RECYCLE.BIN", "Windows", "Program Files"])(
    "ueberspringt %s",
    (o) => expect(istUebersprungenerOrdner(o)).toBe(true)
  );

  it("ueberspringt jeden versteckten Ordner", () => {
    expect(istUebersprungenerOrdner(".irgendwas")).toBe(true);
    expect(istUebersprungenerOrdner(".config")).toBe(true);
  });

  it("laesst normale Ordner zu", () => {
    for (const o of ["Dokumente", "Projekte", "Notizen", "Kanzlei", "src"]) {
      expect(istUebersprungenerOrdner(o), o).toBe(false);
    }
  });

  it("meldet den Grund als Systemordner, wenn er im Pfad steckt", () => {
    expect(beurteileDatei("/Users/a/projekt/node_modules/pkg/README.md", 100).grund).toBe("systemordner");
  });
});

describe("Nur unterhalb der gewaehlten Wurzel wird geurteilt", () => {
  // Befund vom 6.9.2026: die Ordnerregeln liefen ueber den GANZEN absoluten
  // Pfad. Ein Heimverzeichnis unter /private/tmp/... fiel damit komplett durch
  // ("private" und "tmp" stehen auf der Ueberspringen-Liste) — der Scan fand
  // null Dokumente. Auf einem Linux-Rechner mit /home/build/... waere dasselbe
  // passiert. Was oberhalb der Wurzel liegt, hat der Nutzer nicht gewaehlt.
  it("schneidet die Wurzel ab", () => {
    expect(teileUnterWurzel("/private/tmp/heim/Dokumente/a.md", "/private/tmp/heim")).toEqual(["dokumente", "a.md"]);
    expect(teileUnterWurzel("/private/tmp/heim/", "/private/tmp/heim")).toEqual([]);
    expect(teileUnterWurzel("C:\\Users\\a\\Doks\\b.md", "C:\\Users\\a")).toEqual(["doks", "b.md"]);
  });

  it("laesst den Pfad unveraendert, wenn keine Wurzel angegeben ist", () => {
    expect(teileUnterWurzel("/a/b/c.md")).toEqual(["a", "b", "c.md"]);
  });

  it("laesst den Pfad unveraendert, wenn er gar nicht unter der Wurzel liegt", () => {
    expect(teileUnterWurzel("/anderswo/c.md", "/heim")).toEqual(["anderswo", "c.md"]);
  });

  it("nimmt ein Dokument an, dessen Heimverzeichnis unter tmp oder build liegt", () => {
    for (const wurzel of ["/private/tmp/heim", "/home/build", "/var/system/nutzer", "/data/cache/max"]) {
      expect(
        beurteileDatei(`${wurzel}/Dokumente/Fristen.md`, 3000, wurzel),
        `${wurzel} wurde faelschlich verworfen`
      ).toEqual({ aufnehmen: true });
    }
  });

  it("greift unterhalb der Wurzel weiterhin voll durch", () => {
    const wurzel = "/private/tmp/heim";
    expect(beurteileDatei(`${wurzel}/Projekt/node_modules/pkg/README.md`, 100, wurzel).grund).toBe("systemordner");
    expect(beurteileDatei(`${wurzel}/.ssh/config`, 100, wurzel).grund).toBe("geheim");
    expect(beurteileDatei(`${wurzel}/Projekt/.env`, 100, wurzel).grund).toBe("geheim");
  });
});

describe("Formate und Groessen", () => {
  it.each([...LESBARE_ENDUNGEN])("liest %s", (e) => {
    expect(istLesbaresFormat(`notiz${e}`)).toBe(true);
  });

  it.each([".exe", ".dll", ".zip", ".png", ".jpg", ".mp4", ".sqlite", ".db", ".docx", ".xlsx", ".bin", ".so"])(
    "liest %s nicht",
    (e) => expect(istLesbaresFormat(`datei${e}`)).toBe(false)
  );

  it("behandelt Dateien ohne Endung als nicht lesbar", () => {
    expect(istLesbaresFormat("README")).toBe(false);
    expect(istLesbaresFormat(".gitignore")).toBe(false);
  });

  it("lehnt zu grosse und leere Dateien ab", () => {
    expect(beurteileDatei("/a/gross.txt", MAX_DATEI_BYTES + 1).grund).toBe("zu-gross");
    expect(beurteileDatei("/a/leer.txt", 0).grund).toBe("leer");
    expect(beurteileDatei("/a/gerade-noch.txt", MAX_DATEI_BYTES).aufnehmen).toBe(true);
  });

  it("lehnt versteckte Dateien ab", () => {
    expect(beurteileDatei("/a/.notiz.md", 100).grund).toBe("versteckt");
  });

  it("nimmt eine gewoehnliche Notiz auf", () => {
    expect(beurteileDatei("/Users/a/Dokumente/Kanzlei/Fristen.md", 4200)).toEqual({ aufnehmen: true });
  });
});

describe("Beschriftung", () => {
  it.each(["geheim", "systemordner", "versteckt", "format", "zu-gross", "leer", "abgewaehlt"] as const)(
    "benennt %s verstaendlich",
    (g) => expect(grundLabel(g).length).toBeGreaterThan(3)
  );
});

describe("Was der Nutzer einstellen darf — und was nicht", () => {
  // Die Trennung ist die wichtigste Zusage der ganzen Datei: einstellbar ist,
  // was WEITER einschraenkt. Die harten Sperren lassen sich nicht oeffnen.
  const heim = "/home/x";

  it("nimmt eine Einschraenkung der Dateiarten an", () => {
    expect(beurteileDatei(`${heim}/a.md`, 100, heim, { endungen: [".md"] }).aufnehmen).toBe(true);
    const abgelehnt = beurteileDatei(`${heim}/a.pdf`, 100, heim, { endungen: [".md"] });
    expect(abgelehnt.aufnehmen).toBe(false);
    expect(abgelehnt.grund).toBe("format");
  });

  it("laesst sich damit NICHT zum Lesen von Geheimnissen ueberreden", () => {
    // Der Versuch, .pem freizuschalten, darf nichts bewirken.
    const u = beurteileDatei(`${heim}/server.pem`, 100, heim, { endungen: [".pem", ".md"] });
    expect(u.aufnehmen).toBe(false);
    expect(u.grund).toBe("geheim");
    expect(beurteileDatei(`${heim}/.env`, 100, heim, { endungen: [".env"] }).grund).toBe("geheim");
    expect(beurteileDatei(`${heim}/.ssh/id_rsa`, 100, heim, { endungen: [".md"] }).grund).toBe("geheim");
  });

  it("erlaubt eine kleinere Groessengrenze, aber keine groessere", () => {
    expect(beurteileDatei(`${heim}/a.md`, 5000, heim, { maxDateiBytes: 1000 }).grund).toBe("zu-gross");
    // Ueber der harten Grenze bleibt es abgelehnt, egal was eingestellt wird.
    expect(beurteileDatei(`${heim}/a.md`, 9_000_000, heim, { maxDateiBytes: 99_000_000 }).grund).toBe("zu-gross");
  });

  it("laesst eigene Ordner aus und sagt das auch so", () => {
    const u = beurteileDatei(`${heim}/archiv/alt.md`, 100, heim, { zusaetzlichAusgelassen: ["Archiv"] });
    expect(u.aufnehmen).toBe(false);
    expect(u.grund).toBe("abgewaehlt");
    expect(beurteileDatei(`${heim}/notizen/alt.md`, 100, heim, { zusaetzlichAusgelassen: ["archiv"] }).aufnehmen).toBe(true);
  });

  it("beurteilt eine eingeschraenkte Endungsliste fuer sich", () => {
    expect(istLesbaresFormat("a.md", [".md"])).toBe(true);
    expect(istLesbaresFormat("a.txt", [".md"])).toBe(false);
    expect(istLesbaresFormat("ohnepunkt", [".md"])).toBe(false);
  });
});
