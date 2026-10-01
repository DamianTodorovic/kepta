// Activity-Subscription — SSE-Stream des Activity Hubs (mit Auto-Reconnect).
export interface ActivityEvent {
  type: "save" | "update" | "delete" | "search" | "consolidate";
  source: "app" | "agent";
  title?: string;
  ts: number;
}

export function subscribeActivity(onEvent: (evt: ActivityEvent) => void): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      es = new EventSource("/api/activity");
      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as ActivityEvent;
          if (data && data.type && data.source) onEvent(data);
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) retryTimer = setTimeout(connect, 3000);
      };
    } catch {
      retryTimer = setTimeout(connect, 5000);
    }
  };
  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}
