// Rate-Limiter — einmal pro App gebaut (server/app.ts), von den Routern genutzt.
// Schützt vor Brute-Force / DoS; die Grenzen sind lokal bewusst großzügig.
import rateLimit from "express-rate-limit";

export interface Limiter {
  global: ReturnType<typeof rateLimit>;
  chat: ReturnType<typeof rateLimit>;
  clip: ReturnType<typeof rateLimit>;
  write: ReturnType<typeof rateLimit>;
}

export function erstelleLimiter(): Limiter {
  return {
    global: rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — please wait a moment." } }),
    chat: rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Chat Rate-Limit: max 20/min" } }),
    clip: rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { error: "Clip Rate-Limit: max 12/min" } }),
    // Schreibdrossel: groß genug für jede Aufraeumaktion, klein genug, dass ein
    // verirrter Aufruf nicht die ganze Wissensbasis in einem Rutsch bewegt.
    write: rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Schreib-Limit: max 60/min" } }),
  };
}
