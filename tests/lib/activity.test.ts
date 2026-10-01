// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { subscribeActivity, type ActivityEvent } from "../../src/lib/activity";

// Minimaler EventSource-Stub, den wir manuell feuern lassen.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((msg: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  fail() {
    this.onerror?.();
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("subscribeActivity", () => {
  it("leitet gültige Events an den Callback weiter", () => {
    const events: ActivityEvent[] = [];
    const unsub = subscribeActivity((e) => events.push(e));
    const es = FakeEventSource.instances[0]!;
    es.emit({ type: "save", source: "agent", title: "Neu", ts: 1 });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("save");
    unsub();
  });

  it("ignoriert kaputtes JSON und unvollständige Events", () => {
    const events: ActivityEvent[] = [];
    const unsub = subscribeActivity((e) => events.push(e));
    const es = FakeEventSource.instances[0]!;
    es.emit("{ kaputt ]");
    es.emit({ source: "app" }); // ohne type → ignoriert
    expect(events).toHaveLength(0);
    unsub();
  });

  it("reconnectet nach einem Fehler nach 3s", () => {
    vi.useFakeTimers();
    const unsub = subscribeActivity(() => {});
    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0]!.fail();
    vi.advanceTimersByTime(3000);
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(2);
    unsub();
  });

  it("Unsubscribe schließt die Verbindung und verhindert Reconnect", () => {
    vi.useFakeTimers();
    const unsub = subscribeActivity(() => {});
    const es = FakeEventSource.instances[0]!;
    unsub();
    expect(es.closed).toBe(true);
    es.fail();
    vi.advanceTimersByTime(5000);
    // keine neue Instanz nach Unsubscribe
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
