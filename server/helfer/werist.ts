// Wer hat gehandelt? Die eigene Oberfläche ("You") erkennt sich an der
// Herkunft: gleicher Host wie der Server heißt App, sonst HTTP API.
import type express from "express";

export function werIst(req: express.Request): string {
  const herkunft = req.get("origin") ?? req.get("referer") ?? "";
  try {
    return herkunft && new URL(herkunft).host === req.get("host") ? "You" : "HTTP API";
  } catch {
    return "HTTP API";
  }
}
