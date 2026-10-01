// Fuellwoerter fuer Deutsch und Englisch — EINE Quelle fuer beide Suchpfade.
//
// Die Liste lag frueher privat in src/lib/semantic.ts, also nur im Browser-Pfad.
// Die Engine (FTS5/BM25) kannte sie nicht und suchte nach jedem Token der Anfrage.
// Folge: "what do I cook with pasta" fand eine Notiz "The M4 with 64 GB", weil
// sie "with" enthaelt — und die verdraengte ueber die RRF-Fusion den richtigen
// Treffer. Deshalb liegt die Liste jetzt im Kern und wird von beiden benutzt.

const STOPWORDS_DE = new Set([
  "der","die","das","den","dem","des","ein","eine","einen","einem","einer","eines",
  "und","oder","aber","wenn","dann","also","auch","noch","schon","nur","sehr","wie",
  "was","wer","wo","wann","warum","wieso","weshalb","welche","welcher","welches",
  "dass","das","ist","sind","war","waren","sein","hat","haben","hatte","hatten",
  "wird","werden","wurde","wurden","kann","könnte","soll","sollen","muss","müssen",
  "will","wollen","möchte","möchten","bei","mit","von","zu","zum","zur","im","am",
  "an","auf","für","über","unter","vor","nach","zwischen","durch","gegen","ohne",
  "um","aus","ein","aus","im","in","als","so","diese","dieser","dieses","diesen",
  "diesem","jeder","jede","jedes","viele","vielen","mehr","weniger","hier","dort",
  "da","dabei","damit","dazu","darauf","darüber","darunter","nicht","kein","keine",
  "keinen","keinem","keiner","nichts","alles","etwas","man","es","er","sie","wir",
  "ihr","mein","dein","sein","ihr","unser","euer",
]);

const STOPWORDS_EN = new Set([
  "the","a","an","and","or","but","if","then","else","so","as","at","by","for","with",
  "about","against","between","into","through","during","before","after","above","below",
  "to","from","up","down","in","out","on","off","over","under","again","further","once",
  "here","there","when","where","why","how","all","any","both","each","few","more","most",
  "other","some","such","no","nor","not","only","own","same","than","too","very","can",
  "will","just","don","should","now","is","are","was","were","be","been","being","has",
  "have","had","do","does","did","being","having","doing","am","isnt","arent","wasnt",
  "hasnt","havent","hadnt","dont","doesnt","didnt","wont","wouldnt","shouldnt","cant",
  "cannot","could","would","should","may","might","must","shall","this","that","these",
  "those","i","me","my","myself","we","our","ours","you","your","yours","he","him","his",
  "she","her","hers","it","its","they","them","their","what","which","who","whom",
]);

export const STOPWORDS: ReadonlySet<string> = new Set<string>([...STOPWORDS_DE, ...STOPWORDS_EN]);

/** Hoechstzahl an Begriffen pro Anfrage — schuetzt die FTS5-Query vor Ausufern. */
export const MAX_QUERY_TERMS = 12;

/**
 * Zerlegt eine Anfrage in bedeutungstragende Begriffe: klein geschrieben, ohne
 * Satzzeichen, ohne Einzelzeichen, ohne Fuellwoerter.
 *
 * Unicode-Klassen statt a-z0-9, damit kyrillische und CJK-Anfragen nicht
 * verschwinden. Besteht die Anfrage nur aus Fuellwoertern, werden diese
 * behalten — eine stumme Suche waere schlechter als eine ungenaue.
 */
export function contentTerms(query: string): string[] {
  const roh = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (roh.length === 0) return [];
  const ohneFuellwoerter = roh.filter((t) => !STOPWORDS.has(t));
  return (ohneFuellwoerter.length > 0 ? ohneFuellwoerter : roh).slice(0, MAX_QUERY_TERMS);
}
