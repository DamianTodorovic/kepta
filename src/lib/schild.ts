// The privacy shield: personal data and secrets stay on this computer.
//
// Three promises, all kept locally:
// 1. Cloud AI never sees email addresses, phone numbers, IBANs, card numbers,
//    passwords or keys — not from your notes, not from your questions. They
//    are swapped for placeholders like [EMAIL-1] before a request leaves the
//    machine, and the answer shows the real values again, so the model can
//    still work with them.
// 2. AI apps (Claude, Cursor & Co. over MCP) never read passwords, keys, card
//    numbers or IBANs. If an app writes such a note back, the real values stay.
// 3. Private notes never reach an AI app or a cloud model at all.
//
// Detection stays conservative where a false alarm would hurt: card numbers
// must pass the Luhn check, IBANs the mod-97 check, dates are never phones.
// Pure TypeScript — the settings page runs the same code for its preview.

export type Art = "email" | "phone" | "iban" | "card" | "secret";

/** In order of precedence: where two findings overlap, the earlier kind wins. */
export const ARTEN: readonly Art[] = ["secret", "iban", "card", "email", "phone"];
/** What AI apps never get to read. Contacts stay visible — agents need them. */
export const ARTEN_FUER_APPS: readonly Art[] = ["secret", "iban", "card"];

const MARKE: Record<Art, string> = { email: "EMAIL", phone: "PHONE", iban: "IBAN", card: "CARD", secret: "SECRET" };
const NAME: Record<Art, [string, string]> = {
  email: ["email address", "email addresses"],
  phone: ["phone number", "phone numbers"],
  iban: ["IBAN", "IBANs"],
  card: ["card number", "card numbers"],
  secret: ["password or key", "passwords and keys"],
};

export interface Treffer {
  art: Art;
  start: number;
  ende: number;
  wert: string;
}

function luhn(ziffern: string): boolean {
  let summe = 0;
  for (let i = 0; i < ziffern.length; i++) {
    let d = Number(ziffern[ziffern.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    summe += d;
  }
  return summe % 10 === 0;
}

/** A real IBAN: country, check digits and the mod-97 check. */
export function istIban(roh: string): boolean {
  const s = roh.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  let rest = 0;
  for (const z of s.slice(4) + s.slice(0, 4)) {
    const wert = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

/** A card number: 13 to 19 digits that pass the Luhn check. */
export function istKarte(roh: string): boolean {
  const ziffern = roh.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(ziffern) && !/^(\d)\1+$/.test(ziffern) && luhn(ziffern);
}

function istTelefon(roh: string): boolean {
  const s = roh.trim();
  // 01.02.2026, 2026-09-14, 05/03/24 — dates look like numbers with separators.
  if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(s)) return false;
  const n = s.replace(/\D/g, "").length;
  return n >= 7 && n <= 15;
}

interface Muster {
  art: Art;
  re: RegExp;
  /** Only part of the match is the value (e.g. after "password:"). */
  wert?: (m: RegExpExecArray) => [number, number];
  pruefe?: (s: string) => boolean;
}

const MUSTER: Muster[] = [
  { art: "secret", re: /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]{0,10000}?-----END [A-Z ]{0,40}PRIVATE KEY-----/g },
  {
    art: "secret",
    re: /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,200}|gh[pousr]_[A-Za-z0-9]{30,100}|github_pat_[A-Za-z0-9_]{40,200}|xox[abprs]-[A-Za-z0-9-]{10,200}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,100}|npm_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{10,2000})/g,
  },
  {
    art: "secret",
    re: /\b(?:password|passwort|kennwort|passcode|pwd|pin|secret|token|api[ _-]?key|zugangscode)\b[ \t]*[:=][ \t]*("[^"\n]{3,200}"|'[^'\n]{3,200}'|[^\s,;]{3,200})/gi,
    wert: (m) => [m.index + m[0].length - m[1]!.length, m.index + m[0].length],
  },
  { art: "iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, pruefe: istIban },
  { art: "card", re: /\b\d(?:[ -]?\d){12,18}\b/g, pruefe: istKarte },
  { art: "email", re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/g },
  { art: "phone", re: /(?<![\w+])(?:\+\d{1,3}[ .-]?|0)\(?\d{1,5}\)?(?:[ /.-]?\d{2,6}){1,5}(?!\w)/g, pruefe: istTelefon },
];

/** Everything the shield would hide in a text — without overlaps, in reading order. */
export function finde(text: string, arten: readonly Art[] = ARTEN): Treffer[] {
  if (!text) return [];
  const kandidaten: Treffer[] = [];
  for (const { art, re, wert, pruefe } of MUSTER) {
    if (!arten.includes(art)) continue;
    const r = new RegExp(re.source, re.flags);
    for (let m = r.exec(text); m && kandidaten.length < 5000; m = r.exec(text)) {
      const [start, ende] = wert ? wert(m) : [m.index, m.index + m[0].length];
      const w = text.slice(start, ende);
      if (w && (!pruefe || pruefe(w))) kandidaten.push({ art, start, ende, wert: w });
      if (m[0].length === 0) r.lastIndex++;
    }
  }
  const rang = (a: Art) => ARTEN.indexOf(a);
  kandidaten.sort((a, b) => rang(a.art) - rang(b.art) || b.ende - b.start - (a.ende - a.start) || a.start - b.start);
  const angenommen: Treffer[] = [];
  for (const k of kandidaten) {
    if (!angenommen.some((t) => k.start < t.ende && t.start < k.ende)) angenommen.push(k);
  }
  return angenommen.sort((a, b) => a.start - b.start);
}

export type Zaehlung = Partial<Record<Art, number>>;

/**
 * Hides values behind placeholders and puts them back later. The same value
 * always gets the same placeholder, so a model can refer to it consistently.
 */
export class Schild {
  private nachWert = new Map<string, string>();
  private nachMarke = new Map<string, string>();
  private naechste: Record<Art, number> = { email: 0, phone: 0, iban: 0, card: 0, secret: 0 };
  readonly arten: readonly Art[];

  constructor(arten: readonly Art[] = ARTEN) {
    this.arten = arten;
  }

  schirme(text: string): string {
    const treffer = finde(text, this.arten);
    if (!treffer.length) return text;
    let aus = "";
    let zuletzt = 0;
    for (const t of treffer) {
      aus += text.slice(zuletzt, t.start) + this.marke(t);
      zuletzt = t.ende;
    }
    return aus + text.slice(zuletzt);
  }

  private marke(t: Treffer): string {
    const schluessel = `${t.art}\u0000${t.wert}`;
    let m = this.nachWert.get(schluessel);
    if (!m) {
      m = `[${MARKE[t.art]}-${++this.naechste[t.art]}]`;
      this.nachWert.set(schluessel, m);
      this.nachMarke.set(m, t.wert);
    }
    return m;
  }

  entschirme(text: string): string {
    if (!this.nachMarke.size || !text) return text;
    return text.replace(/\[(?:EMAIL|PHONE|IBAN|CARD|SECRET)-\d{1,4}\]/g, (m) => this.nachMarke.get(m) ?? m);
  }

  /** How many different values of each kind were hidden. */
  get zaehlung(): Zaehlung {
    const z: Zaehlung = {};
    for (const a of ARTEN) if (this.naechste[a]) z[a] = this.naechste[a];
    return z;
  }

  get leer(): boolean {
    return this.nachMarke.size === 0;
  }

  /** Puts real values back into a streamed answer — a placeholder split across chunks waits until it is complete. */
  strom(): { weiter(stueck: string): string; ende(): string } {
    let puffer = "";
    return {
      weiter: (stueck: string) => {
        puffer += stueck;
        const i = puffer.lastIndexOf("[");
        let frei = puffer;
        if (i >= 0 && !puffer.includes("]", i) && puffer.length - i < 16) {
          frei = puffer.slice(0, i);
          puffer = puffer.slice(i);
        } else puffer = "";
        return this.entschirme(frei);
      },
      ende: () => {
        const rest = this.entschirme(puffer);
        puffer = "";
        return rest;
      },
    };
  }
}

/** „2 email addresses and 1 IBAN“ — for the note under a chat answer. */
export function beschreibe(z: Zaehlung): string {
  const teile = ARTEN.filter((a) => z[a]).map((a) => `${z[a]} ${NAME[a][z[a] === 1 ? 0 : 1]}`);
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} and ${teile[teile.length - 1]}`;
}

/** Only this computer counts as local — a server in the office network is already outside. */
export function istLokaleAdresse(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127\./.test(host);
  } catch {
    return false;
  }
}

/** A text an AI app wrote back: its placeholders become the real values of the note it came from. */
export function stelleWiederHer(original: string, neu: string, arten: readonly Art[] = ARTEN_FUER_APPS): string {
  const s = new Schild(arten);
  s.schirme(original);
  return s.entschirme(neu);
}

/** Drops private notes from a chat context built as „[ID: … | …]“ blocks. */
export function ohnePrivateBloecke(system: string, privat: ReadonlySet<string>): { text: string; entfernt: number } {
  if (!privat.size || !system.includes("[ID: ")) return { text: system, entfernt: 0 };
  let entfernt = 0;
  const teile = system.split(/(?=\[ID: )/).filter((t) => {
    const m = /^\[ID: ([^\s|\]]+)/.exec(t);
    if (m && privat.has(m[1]!)) {
      entfernt++;
      return false;
    }
    return true;
  });
  return { text: teile.join(""), entfernt };
}

export interface SchildEinstellungen {
  /** Hide personal data from cloud AI in the chat. */
  chat: boolean;
  /** Hide passwords, keys, card numbers and IBANs from AI apps. */
  apps: boolean;
}

// Deliberately without the „kepta_“ prefix: those keys are mirrored from the
// browser storage, and a stale copy there must never switch the shield back.
export const SCHILD_SCHLUESSEL = "privacy_shield";

/** Both protections are on unless someone switched them off. */
export function leseSchildEinstellungen(roh: string | null | undefined): SchildEinstellungen {
  try {
    const j = roh ? (JSON.parse(roh) as Partial<SchildEinstellungen>) : {};
    return { chat: j.chat !== false, apps: j.apps !== false };
  } catch {
    return { chat: true, apps: true };
  }
}
