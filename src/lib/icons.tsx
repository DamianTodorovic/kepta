// KEPTA-Icon-Serie — Solar „Linear" (24 px, 1,5 px Strich, currentColor),
// gesammelt und offline eingebettet (Iconify-Collection, keine Laufzeit-
// Netzwerkfetches). Eine Serie für alles: gleicher Strich, gleiche
// Geometrie, gleiche Ecken. Gesammelt mit better-icons (Iconify).
//
// Der Vertrag (D1-09, Z-06) — geprüft von scripts/design-wache.mjs:
//   1. Ein Name = ein Bild. Zwei Namen auf demselben Körper sind ein Fehler,
//      kein Stilmittel; Absichten, die dasselbe Zeichen brauchen, werden
//      Aliasse (unten, eigener Block) und keine zweiten make()-Aufrufe.
//   2. Kleine Stufen gibt es nicht unter 14 px (--icon-min in index.css);
//      bei 10 px wäre der Strich 0,63 px und damit subpixel-grau.
//   3. Zusätzliche Zeichen stehen in ZUSATZ unten und werden vor
//      addCollection in die Collection gemischt — die generierte
//      kepta-icons.json bleibt unverändert, und die neuen Körper kopieren
//      die Struktur der Serie (gleiche Gruppe, gleicher Strich, runde Kappe).
import type { CSSProperties } from "react";
import { addCollection, Icon } from "@iconify/react";
import keptaData from "./kepta-icons.json";

/* Zwei Körper, die die gesampelte Collection nicht hat, in ihrer Schreibweise. */
const PANEL =
  '<g fill="none" stroke="currentColor" stroke-width="1.5"><path fill="currentColor" d="M2 11C2 7.22876 2 5.34315 3.17157 4.17157C4.34315 3 6.22876 3 10 3H14C17.7712 3 19.6569 3 20.8284 4.17157C22 5.34315 22 7.22876 22 11V13C22 16.7712 22 18.6569 20.8284 19.8284C19.6569 21 17.7712 21 14 21H10C6.22876 21 4.34315 21 3.17157 19.8284C2 18.6569 2 16.7712 2 13V11Z"/><path fill="currentColor" stroke-linecap="round" d="M5.5 10H11.5"/><path fill="currentColor" stroke-linecap="round" d="M6.5 14H10.5"/><path fill="currentColor" stroke-linecap="round" d="M15 21L15 3"/>';

const ZUSATZ = {
  icons: {
    // Das Zu/Auf-Paar brauchte bisher dasselbe Bild: ein Knopf, der zwei
    // Zustände hat, zeigte in beiden dasselbe. Der Pfeil steht in der
    // Inhaltsseite der Leiste und sagt, wohin die Kante geht.
    "panelleft-close": { body: `${PANEL}<path fill="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.6 9.4L17 12L19.6 14.6"/></g>` },
    "panelleft-open": { body: `${PANEL}<path fill="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M17 9.4L19.6 12L17 14.6"/></g>` },
    // Ein Ladezeichen war bisher das Erneuerungszeichen — und umgekehrt.
    // „loader" in dieser Collection ist kreuzweise mit zwei Pfeilspitzen
    // gezeichnet (das ist Erneuern/synchronisieren, richtig für RefreshCw);
    // der Spinner bekommt eigenen Bogen mit Lücke, der sich drehen kann.
    "loader-circle": {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path fill="currentColor" d="M21 12A9 9 0 1 1 14.8 3.44"/></g>',
    },
    // Drei legte Blätter: die Liste der Werkzeuge heißt Layers und zeigte
    // eine Erdkugel.
    layers: {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="currentColor" d="M12 3.4L3.6 7.7 12 12l8.4-4.3L12 3.4Z"/><path fill="currentColor" d="M3.6 12.2L12 16.5l8.4-4.3"/><path fill="currentColor" d="M3.6 16.4L12 20.7l8.4-4.3"/></g>',
    },
  },
};

const daten = { ...keptaData, icons: { ...keptaData.icons, ...ZUSATZ.icons } };
addCollection(daten);

type IconProps = {
  className?: string;
  style?: CSSProperties;
  /**
   * Kompatibilität mit den Bausteinen, die aus der Phosphor-Zeit `weight`
   * setzen (MemoryCard: „duotone", Sidebar: „regular"/„duotone"). Diese
   * Serie hat EINEN Strich — 1,5 px, linear — und daher genau eine
   * Antwort: der Wert wird angenommen und ignoriert. Wer eine zweite
   * Stärke will, zeichnet keine zweite Serie pro Knopf, sondern wählt
   * Dicke über --icon-stroke.
   */
  weight?: string;
  size?: number | string;
};

function make(keptaName: string) {
  // Der Name wird beim Modul-Load gegen das Dataset geprüft — Tippfehler
  // fliegen sofort, nicht erst zur Laufzeit.
  if (!(keptaName in daten.icons)) {
    throw new Error(`Kepta-Icons: icon "${keptaName}" does not exist`);
  }
  return function KeptaIcon({ className, style, size }: IconProps) {
    return (
      <Icon
        icon={`kepta:${keptaName}`}
        className={className}
        style={style}
        width={size}
        height={size}
        aria-hidden="true"
      />
    );
  };
}

/* ---------- Zeichen, ein Name pro Bild ---------- */
export const Search = make("search");
export const Plus = make("plus");
export const Database = make("database");
export const CheckCircle = make("checkcircle");
export const Copy = make("copy");
export const PanelLeftOpen = make("panelleft-open");
export const PanelLeftClose = make("panelleft-close");
export const UploadCloud = make("uploadcloud");
export const Globe = make("globe");
export const Loader2 = make("loader-circle");
export const RefreshCw = make("loader");
export const AlertCircle = make("alertcircle");
export const Sparkles = make("sparkles");
export const SlidersHorizontal = make("sliders");
export const Trash2 = make("trash");
export const Hash = make("hash");
export const Clock = make("clock");
export const Zap = make("zap");
export const Send = make("send");
export const Bot = make("bot");
export const User = make("user");
export const AlertTriangle = make("alerttriangle");
export const Square = make("square");
export const Check = make("check");
export const Coins = make("coins");
export const FileText = make("filetext");
export const Maximize2 = make("maximize");
export const Atom2 = make("atom");
export const Sitemap = make("sitemap");
export const EditPen = make("editpen");
export const ZoomIn = make("zoomin");
export const ZoomOut = make("zoomout");
export const X = make("x");
export const Save = make("save");
export const Key = make("key");
export const ShieldCheck = make("shieldcheck");
export const SettingsIcon = make("settings");
export const Download = make("download");
export const Cpu = make("cpu");
export const Server = make("server");
export const Plug = make("plug");
export const Terminal = make("terminal");
export const Braces = make("braces");
export const Layers = make("layers");
export const ExternalLink = make("external");
export const XCircle = make("xcircle");
export const ChevronRight = make("chevronright");
export const ChevronLeft = make("chevronleft");
export const FolderOpen = make("folder");
export const Target = make("target");
export const Moon = make("moon");
export const Sun = make("sun");
export const Network = make("network");
export const Scatter = make("scatter");
export const MessageSquare = make("messagesquare");
export const Info = make("info");
export const ShieldAlert = make("shieldalert");
export const FileJson = make("filejson");
export const Brain = make("brain");
export const Lock = make("lock");
export const Eye = make("eye");
export const Archive = make("archive");

/* ---------- Aliasse ----------
   Ein Bild, mehrere Namen, weil die Bausteine unter verschiedenen Namen
   importieren. Alias ist eine Umbenennung derselben Absicht — kein zweites
   Zeichen für dasselbe Bild (das wäre der Befund D1-09). */
export const CheckCircle2 = CheckCircle;
export const UserIcon = User;
/** Der ⌘K-Ruf und das Suchfeld meinen beide: suchen. */
export const ScanSearch = Search;
/** Datei hochladen, Drag-and-drop, Import — eine Absicht, ein Zeichen. */
export const FileUp = UploadCloud;
export const Upload = UploadCloud;
/** Schlüssel ist Schlüssel, ob „round" oder nicht. */
export const KeyRound = Key;
/** Phosphor-Name, der geblieben ist, weil Settings.tsx und Dashboard ihn
    importieren; das Bild ist der Download-Pfeil, und beide Aufrufe meinen
    denselben Weg: von der Platte herein, auf die Platte hinaus. */
export const HardDriveDownload = Download;
/** Phosphor-Name, importiert von OnboardingWizard („fast geschafft"). Das
    Bild ist der Start — ein Raketenzeichen, in dieser Serie einmalig und
    für „jetzt geht es los" die honesteste Form, die es gibt. Ein Alias auf
    Sparkles wäre derselbe Fehler mit umgekehrtem Vorzeichen: ein Zeichen,
    zwei Bedeutungen (Sparkles ist hier der Assistent). Umbenennen, sobald
    der Baustein frei ist. */
export const PartyPopper = make("rocket");
