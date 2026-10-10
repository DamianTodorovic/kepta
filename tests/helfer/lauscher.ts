// Ein Horcher, der den bestellten Port nimmt und — wenn er belegt ist — auf
// einen frischen ausweicht und ihn nennt.
//
// Warum nicht einfach `listen(0)`: die Scheibe hat bestellte Ports (8801, 8813),
// und ein Messlauf, der seinen Port nennt, ist nachfahrbar. Warum nicht einfach
// `listen(8801)`: in diesem Baum laufen mehrere Agenten, und die Suite der App
// hat schon Antworten von einer fremden App bekommen (die Erklärung steht in
// tests/helfer/hoerer.ts). Ein Port, der still gegen eine fremde Installation
// messen laesst, ist dieselbe Blindheit mit einem schoeneren Protokoll.
//
// Der Riegel dort nimmt nur `createServer(app)` auseinander — hier wird ohne
// Handler gelauscht, damit dieser eine Port haelt.
import http from "node:http";

export interface Horcher {
  readonly server: http.Server;
  readonly port: number;
  readonly urle: string;
}

function binden(server: http.Server, port: number): Promise<void> {
  return new Promise((los, fehler) => {
    server.once("error", fehler);
    server.listen(port, "127.0.0.1", () => los());
  });
}

export async function lauscht(
  auf: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  bestellterPort: number,
): Promise<Horcher> {
  const server = http.createServer();
  server.on("request", auf);
  try {
    await binden(server, bestellterPort);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    await binden(server, 0); // belegt: frischer Port, aber derselbe Baum
  }
  const adresse = server.address();
  if (adresse === null || typeof adresse === "string") throw new Error("Der Horcher hat keinen Port");
  return { server, port: adresse.port, urle: `http://127.0.0.1:${adresse.port}` };
}

export async function niederlegen(server: http.Server): Promise<void> {
  await new Promise<void>((los) => server.close(() => los()));
}
