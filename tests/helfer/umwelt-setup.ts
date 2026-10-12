// Die setupFile der Suite: vor JEDEM Testlauf einer Datei wird die Umwelt-Grundlage
// gesetzt (`tests/helfer/umwelt-basis.ts`), nach ihrem Lauf die Werte von vorher wieder
// hergestellt. Vitest faehrt Dateien in wiederverwendeten Forks; ohne diese Grundlage
// erbt eine Datei die Produktgrenze, die eine andere gelockert hat.
import { afterAll } from "vitest";
import { umweltGrundlegen } from "./umwelt-basis";

const zurueckbauen = umweltGrundlegen();
afterAll(() => zurueckbauen());
