// @vitest-environment node
//
// Der Privatsphäre-Schild: was er findet, was er nie für ein Geheimnis hält,
// wie er Werte verbirgt und in der Antwort zurückholt — auch gestreamt.
import { describe, it, expect } from "vitest";
import {
  finde,
  Schild,
  beschreibe,
  istIban,
  istKarte,
  istLokaleAdresse,
  stelleWiederHer,
  ohnePrivateBloecke,
  leseSchildEinstellungen,
  ARTEN_FUER_APPS,
} from "../../src/lib/schild";

describe("Privatsphäre-Schild: was er findet", () => {
  it("E-Mail, Telefon, IBAN, Karte und Schlüssel — in Lesereihenfolge", () => {
    const text =
      "Mail anna.berg@example.com, Tel +49 171 2345678, IBAN DE89 3704 0044 0532 0130 00, Karte 4111 1111 1111 1111, Key sk-proj-abcdefghijklmnopqrstuvwxyz123456, password: Geheim!42";
    expect(finde(text).map((t) => [t.art, t.wert])).toEqual([
      ["email", "anna.berg@example.com"],
      ["phone", "+49 171 2345678"],
      ["iban", "DE89 3704 0044 0532 0130 00"],
      ["card", "4111 1111 1111 1111"],
      ["secret", "sk-proj-abcdefghijklmnopqrstuvwxyz123456"],
      ["secret", "Geheim!42"],
    ]);
    expect(finde("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----").map((t) => t.art)).toEqual(["secret"]);
  });

  it("hält Daten, Uhrzeiten, Versionen, Bestellnummern und falsche Prüfziffern nicht für Geheimnisse", () => {
    const text = "Termin 01.02.2026 um 14:30, Version 2.12.0, Bestellnr. 12345, IBAN DE00 1234 5678 9012 3456 78, Karte 4111 1111 1111 1112, Jahr 2026-09-14";
    expect(finde(text)).toEqual([]);
  });

  it("Prüfziffern", () => {
    expect(istIban("DE89370400440532013000")).toBe(true);
    expect(istIban("DE89370400440532013001")).toBe(false);
    expect(istKarte("4111-1111-1111-1111")).toBe(true);
    expect(istKarte("0000000000000000")).toBe(false);
  });

  it("bleibt schnell bei großen Texten", () => {
    const start = Date.now();
    finde("a".repeat(200_000) + " x@y.de " + "1 ".repeat(50_000) + "0".repeat(10_000));
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe("Privatsphäre-Schild: verbergen und zurückholen", () => {
  it("gleiche Werte bekommen denselben Platzhalter, die Antwort bekommt die echten zurück", () => {
    const s = new Schild();
    expect(s.schirme("Schreib an anna@example.com und cc tom@example.com, dann nochmal anna@example.com")).toBe(
      "Schreib an [EMAIL-1] und cc [EMAIL-2], dann nochmal [EMAIL-1]"
    );
    expect(s.zaehlung).toEqual({ email: 2 });
    expect(s.leer).toBe(false);
    expect(s.entschirme("Erledigt: Mail an [EMAIL-1], Kopie an [EMAIL-2]. [EMAIL-9] kenne ich nicht.")).toBe(
      "Erledigt: Mail an anna@example.com, Kopie an tom@example.com. [EMAIL-9] kenne ich nicht."
    );
    expect(new Schild().entschirme("[EMAIL-1]")).toBe("[EMAIL-1]");
  });

  it("gestreamte Antworten: ein zerteilter Platzhalter wartet, bis er vollständig ist", () => {
    const s = new Schild();
    s.schirme("IBAN DE89 3704 0044 0532 0130 00");
    const strom = s.strom();
    const aus = ["Überweise auf [IB", "AN-", "1] bitte", " heute. [Hinweis"].map((t) => strom.weiter(t)).join("") + strom.ende();
    expect(aus).toBe("Überweise auf DE89 3704 0044 0532 0130 00 bitte heute. [Hinweis");
    expect(s.strom().weiter("[kein Platzhalter, sondern längerer Text]")).toBe("[kein Platzhalter, sondern längerer Text]");
  });

  it("beschreibt, was verborgen wurde", () => {
    expect(beschreibe({ email: 2, iban: 1 })).toBe("1 IBAN and 2 email addresses");
    expect(beschreibe({ secret: 1 })).toBe("1 password or key");
    expect(beschreibe({ phone: 1, card: 2, secret: 3 })).toBe("3 passwords and keys, 2 card numbers and 1 phone number");
    expect(beschreibe({})).toBe("");
  });
});

describe("Privatsphäre-Schild: Hilfen", () => {
  it("nur dieser Rechner ist lokal — ein Server im Büronetz nicht", () => {
    for (const u of ["http://localhost:11434/v1", "http://127.0.0.1:1234/v1", "http://[::1]:8080", "http://ollama.localhost"]) expect(istLokaleAdresse(u), u).toBe(true);
    for (const u of ["https://api.openai.com/v1", "http://192.168.1.20:11434", "kaputt", undefined]) expect(istLokaleAdresse(u), String(u)).toBe(false);
  });

  it("was eine KI-App zurückschreibt, behält die echten Geheimnisse", () => {
    const original = "Server: db.intern\npassword: Hunter2!x\nIBAN DE89 3704 0044 0532 0130 00";
    const gesehen = new Schild(ARTEN_FUER_APPS).schirme(original);
    expect(gesehen).toBe("Server: db.intern\npassword: [SECRET-1]\nIBAN [IBAN-1]");
    expect(stelleWiederHer(original, gesehen + "\nPort: 5432")).toBe(original + "\nPort: 5432");
  });

  it("private Notizen fallen aus dem Chat-Kontext", () => {
    const system = "Intro\n\n[ID: a | TAGS: x | TITEL: A]\nText A\n\n[ID: b | TAGS:  | TITEL: B]\nGeheim B\n\n[ID: c | TAGS:  | TITEL: C]\nText C\n\n";
    const r = ohnePrivateBloecke(system, new Set(["b"]));
    expect(r.entfernt).toBe(1);
    expect(r.text).toBe("Intro\n\n[ID: a | TAGS: x | TITEL: A]\nText A\n\n[ID: c | TAGS:  | TITEL: C]\nText C\n\n");
    expect(ohnePrivateBloecke(system, new Set())).toEqual({ text: system, entfernt: 0 });
  });

  it("Einstellungen: beides an, solange niemand es ausschaltet", () => {
    expect(leseSchildEinstellungen(undefined)).toEqual({ chat: true, apps: true });
    expect(leseSchildEinstellungen('{"chat":false}')).toEqual({ chat: false, apps: true });
    expect(leseSchildEinstellungen("kaputt")).toEqual({ chat: true, apps: true });
  });
});
