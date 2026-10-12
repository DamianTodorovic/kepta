// Die zweite Haelfte der Gegenprobe: eine Datei, die eine Produktgrenze **liest**, die
// eine andere gelockert hat. Zusammen mit `locker-ohne-rueckbau.fixture.ts` ist das das
// Paar, das der Vertrag benennen muss — Schluessel, Setzer, Leserin.
export const geleseneGrenze = Number(process.env.KEPTA_MAX_ACTIVE ?? 5000);
