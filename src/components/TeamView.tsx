// Team-Ansicht (Milestone E2) — die Admin-Konsole in Kurzform.
//
// Eine Karte, die sagt: wer hat welche Rolle im Workspace, und wie viele
// team:*-Notizen gibt es. Rollen werden zentral verwaltet
// (managed-settings.json, MDM) — diese Ansicht liest sie und erklärt
// den Admins, wo sie sie ändern; sie editiert sie nicht. Ohne Rollen-Datei
// sagt sie genau das, statt eine Sackgasse zu sein.
import { useEffect, useState } from "react";
import { User as UsersIcon, ShieldCheck, Lock } from "../lib/icons";
import { t } from "../lib/uiText";
import { getJson } from "../lib/api";

export interface TeamInfo {
  team: { name?: string; rollen: Record<string, string>; meineRolle: string } | null;
}

export interface ApiMemoryKurz { id: string; scope: string; title: string }

export function TeamView({ aktiv }: { aktiv: boolean }) {
  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [teamNotizen, setTeamNotizen] = useState<ApiMemoryKurz[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!aktiv) return;
    let vorbei = false;
    getJson<TeamInfo>("/api/team")
      .then((d) => { if (!vorbei) setInfo(d); })
      .catch(() => { if (!vorbei) setFehler("Team status not available"); });
    // Team-Notizen zählen: GET /api/memories liefert alle Scopes; der Scope steht
    // im API-Datensatz, also reicht ein clientseitiger Filter für die Übersicht.
    getJson<{ memories?: ApiMemoryKurz[]; memoriesList?: ApiMemoryKurz[] }>("/api/memories")
      .then((d) => {
        if (vorbei) return;
        const liste = (d.memories ?? d.memoriesList ?? []).filter((m) => m.scope?.startsWith("team:"));
        setTeamNotizen(liste);
      })
      .catch(() => { if (!vorbei) setTeamNotizen([]); });
    return () => { vorbei = true; };
  }, [aktiv]);

  if (fehler) {
    return <div className="p-5 fs-4 lh-lesbar" style={{ color: "var(--text-muted)" }}>{fehler}</div>;
  }
  if (!info) {
    return <div className="p-5 fs-4 lh-lesbar" style={{ color: "var(--text-muted)" }}>{t("team.loading")}</div>;
  }

  if (!info.team) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border, rgba(255,255,255,0.1))" }}>
          <div className="flex items-center gap-2 mb-2">
            <UsersIcon className="w-5 h-5" />
            <h2 className="fs-5 lh-lesbar font-semibold">{t("team.title")}</h2>
          </div>
          <p className="fs-4 lh-lesbar" data-testid="team-keine-rollen" style={{ color: "var(--text-muted)" }}>{t("team.keineRollen")}</p>
        </div>
      </div>
    );
  }

  const rollen = info.team.rollen ?? {};
  const rollenListe = Object.entries(rollen);

  return (
    <div className="max-w-2xl mx-auto mt-8 space-y-4 px-5">
      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border, rgba(255,255,255,0.1))" }}>
        <div className="flex items-center gap-2 mb-1">
          <UsersIcon className="w-5 h-5" />
          <h2 className="fs-5 lh-lesbar font-semibold">{info.team.name ?? t("team.title")}</h2>
        </div>
        <div className="flex items-center gap-2 fs-4 lh-lesbar" style={{ color: "var(--text-muted)" }}>
          <span data-testid="team-meine-rolle">{info.team.meineRolle}</span>
        </div>
      </div>

      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border, rgba(255,255,255,0.1))" }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5" />
          <h3 className="fs-4 lh-lesbar font-semibold">{t("team.rollen")}</h3>
        </div>
        {rollenListe.length === 0 ? (
          <p className="fs-4 lh-lesbar" style={{ color: "var(--text-muted)" }}>{t("team.rollenLeer")}</p>
        ) : (
          <table className="w-full fs-4 lh-lesbar" data-testid="team-rollen">
            <tbody>
              {rollenListe.map(([person, rolle]) => (
                <tr key={person} style={{ borderTop: "1px solid var(--border, rgba(255,255,255,0.07))" }}>
                  <td className="py-2">{person}{person === "local" ? ` (${t("team.dieserRechner")})` : ""}</td>
                  <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{rolle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="fs-2 lh-dicht mt-3" style={{ color: "var(--text-muted)" }}>{t("team.mdmHinweis")}</p>
      </div>

      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border, rgba(255,255,255,0.1))" }}>
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-5 h-5" />
          <h3 className="fs-4 lh-lesbar font-semibold">{t("team.notizen")}</h3>
        </div>
        <p className="fs-4 lh-lesbar" data-testid="team-notizen-count" style={{ color: "var(--text-muted)" }}>
          {teamNotizen.length === 0
            ? t("team.notizenLeer")
            : `${teamNotizen.length} ${teamNotizen.length === 1 ? "note" : "notes"} · ${t("team.notizenHinweis")}`}
        </p>
      </div>
    </div>
  );
}
