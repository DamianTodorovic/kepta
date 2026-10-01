import starterPacks from '../data/starter-packs.json';

// Frueher gab es acht Fachpakete: wer "Fishing" waehlte, bekam Forellenkoeder
// und Angelknoten in seine Datenbank geschrieben, wer "Dropshipping" waehlte
// Shopify-Pflichtseiten. Das war nicht nur schief positioniert — es war falsch:
// ein Gedaechtnis, das mit "dein Wissen" wirbt, darf nicht mit fremdem Wissen
// starten. Uebrig bleibt, was fuer jeden gilt und was KEPTA ueber sich selbst
// erklaert. Was der Nutzer fachlich macht, tippt er selbst ein — siehe
// normalizeTopics in profile.ts.

export interface StarterNote {
  title: string;
  content: string;
  tags: string[];
}

export function starterNotes(): StarterNote[] {
  const base = ((starterPacks as Record<string, unknown>)._base ?? []) as StarterNote[];
  const gesehen = new Set<string>();
  return base
    .filter((n) => n && typeof n.title === 'string' && typeof n.content === 'string')
    .filter((n) => {
      if (gesehen.has(n.title)) return false;
      gesehen.add(n.title);
      return true;
    })
    .map((n) => ({ title: n.title, content: n.content, tags: Array.isArray(n.tags) ? n.tags : [] }));
}
