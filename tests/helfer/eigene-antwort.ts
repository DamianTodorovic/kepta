/**
 * Prueft, ob eine Antwort wirklich von der eignen Tuer kommt — nicht nur, ob eine Zahl
 * passt.
 *
 * Grund (Volllauf 3.11., Aufgabe #46): ein Fall bekam 401 mit dem Leib `auth required`,
 * einem Text, den dieser Baum nirgends sendet. Eine Antwort, die nur an ihrem Status
 * gepraueft wird, kann von einem fremden Hoerer stammen und trotzdem gruen werden.
 * Die Tuer setzt darum auf jede Antwort die Zeile `x-kepta-marke` (server/app.ts);
 * diese Funktion verlangt sie und gibt die Antwort weiter, damit der Fall danach
 * seinen Leib pruefen kann.
 */
export function eigeneAntwort<T extends { status: number; headers: Record<string, unknown> }>(res: T): T {
  const marke = res.headers?.["x-kepta-marke"];
  if (typeof marke !== "string" || !marke.startsWith("kepta/")) {
    const koppen = Object.keys(res.headers ?? {}).slice(0, 8).join(", ");
    throw new Error(
      `HTTP ${res.status} ist nicht die eigne Tuer: die Antwort fuehrt keine ` +
        `x-kepta-marke (Kopfe: ${koppen || "keine"}). Ein fremder Hoerer hat geantwortet — ` +
        `pruefe Hafen und Lauscher, bevor diese Zahl in einen Beleg kommt.`
    );
  }
  return res;
}
