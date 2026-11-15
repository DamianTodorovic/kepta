// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiFehler, getJson, getJsonOderNull, sendJson } from "../../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("getJson parst die Antwort", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(getJson<{ ok: boolean }>("/api/health")).resolves.toEqual({ ok: true });
  });

  it("sendJson überträgt JSON-Body und Methode", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ changed: 3 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendJson<{ changed: number }>("/api/memories/reclassify", { apply: true })).resolves.toEqual({ changed: 3 });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init?.body as string)).toEqual({ apply: true });
  });

  it("wandelt den K3PTA-Fehlervertrag ({error}) in eine ApiFehler-Meldung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "URL missing or too long" }), { status: 400 })));
    const fehler = await getJson("/api/clip").catch((e) => e);
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect((fehler as ApiFehler).message).toBe("URL missing or too long");
    expect((fehler as ApiFehler).status).toBe(400);
  });

  it("fällt ohne JSON im Fehlerfall auf den HTTP-Status zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaputt", { status: 500 })));
    const fehler = await getJson("/api/health").catch((e) => e);
    expect((fehler as ApiFehler).message).toBe("HTTP 500");
  });

  it("getJsonOderNull schluckt Fehler als null — für Anzeige-Zustände", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Server weg"); }));
    await expect(getJsonOderNull("/api/health")).resolves.toBeNull();
  });
});
