// Only this computer may use KEPTA's HTTP API — not a website that happens to
// be open in a browser on it.
//
// Two attacks, both reproduced against the server before this guard existed:
// - A foreign page sends a simple cross-site request: an HTML form posting
//   url-encoded data needs no preflight. CORS only hides the response from the
//   page — the request itself runs, and a note was written.
// - DNS rebinding: a page on evil.example points its name at 127.0.0.1 and then
//   talks to the API as if it were same-origin. Its Host header still names
//   evil.example.
//
// So: the Host header must name this machine, and a request that changes
// anything must not come from another website. The app window, local dev
// servers, AI apps over MCP and scripts (which send no Origin) keep working.
import type { RequestHandler } from "express";

const LESEND = new Set(["GET", "HEAD", "OPTIONS"]);

/** localhost, *.localhost, 127.0.0.0/8 and [::1] — with or without a port. */
export function hostIstDieserRechner(host: string | undefined): boolean {
  // Browsers always send a Host header; a request without one is not a browser.
  if (!host) return true;
  const h = host.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.replace(/:\d+$/, "");
  return name === "localhost" || name.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(name) || name === "[::1]";
}

/**
 * The app window and local dev servers. Never "null": sandboxed frames of any
 * website send exactly that.
 */
export function herkunftIstDieserRechner(origin: string): boolean {
  if (origin === "app://." || origin === "file://") return true;
  try {
    const u = new URL(origin);
    return (u.protocol === "http:" || u.protocol === "https:") && u.origin === origin && hostIstDieserRechner(u.host);
  } catch {
    return false;
  }
}

/**
 * The guard for every request. With KEPTA_HOST set to a network address the
 * Host check is off — the owner chose to serve the network — but requests from
 * other websites still cannot change anything.
 */
export function nurDieserRechner(opts: { bindHost?: string } = {}): RequestHandler {
  const hostPruefen = !opts.bindHost || hostIstDieserRechner(opts.bindHost);
  return (req, res, next) => {
    if (hostPruefen && !hostIstDieserRechner(req.headers.host)) {
      res.status(403).json({ error: "Forbidden host." });
      return;
    }
    if (!LESEND.has(req.method)) {
      const herkunft = req.headers.origin;
      const fremd = herkunft !== undefined ? !herkunftIstDieserRechner(herkunft) : req.headers["sec-fetch-site"] === "cross-site";
      if (fremd) {
        res.status(403).json({ error: "Forbidden origin." });
        return;
      }
    }
    next();
  };
}
