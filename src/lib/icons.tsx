// KEPTA-Icon-Serie — Solar „Linear" (24 px, 1,5 px Strich, currentColor),
// gesammelt und offline eingebettet (Iconify-Collection, keine Laufzeit-
// Netzwerkfetches). Eine Serie für alles: gleicher Strich, gleiche
// Geometrie, gleiche Ecken. Gesammelt mit better-icons (Iconify).
import type { CSSProperties } from "react";
import { addCollection, Icon } from "@iconify/react";
import keptaData from "./kepta-icons.json";

addCollection(keptaData);

type IconProps = {
  className?: string;
  style?: CSSProperties;
  /** Phosphor-Kompatibilität: wird ignoriert (früher nur für Brain nötig) */
  weight?: string;
  size?: number | string;
};

function make(keptaName: string) {
  // Der Name wird beim Modul-Load gegen das Dataset geprüft — Tippfehler
  // fliegen sofort, nicht erst zur Laufzeit.
  if (!(keptaName in keptaData.icons)) {
    throw new Error(`Kepta-Icons: icon "${keptaName}" does not exist`);
  }
  return function KeptaIcon({ className, style }: IconProps) {
    return (
      <Icon
        icon={`kepta:${keptaName}`}
        className={className}
        style={style}
        aria-hidden="true"
      />
    );
  };
}

export const Search = make("search");
export const Plus = make("plus");
export const Database = make("database");
export const CheckCircle = make("checkcircle");
export const Copy = make("copy");
export const PanelLeftOpen = make("panelleft");
export const PanelLeftClose = make("panelleft");
export const ScanSearch = make("scansearch");
export const UploadCloud = make("uploadcloud");
export const Globe = make("globe");
export const Loader2 = make("loader");
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
export const Sitemap = make("tree");
export const EditPen = make("editpen");
export const ZoomIn = make("plus");
export const ZoomOut = make("minus");
export const X = make("x");
export const Save = make("save");
export const Key = make("key");
export const ShieldCheck = make("shieldcheck");
export const SettingsIcon = make("settings");
export const Download = make("download");
export const RefreshCw = make("loader");
export const Cpu = make("cpu");
export const HardDriveDownload = make("database");
export const Server = make("server");
export const Plug = make("plug");
export const Terminal = make("terminal");
export const Braces = make("braces");
export const Layers = make("globe");
export const ExternalLink = make("external");
export const XCircle = make("xcircle");
export const ChevronRight = make("chevronright");
export const ChevronLeft = make("chevronleft");
export const FolderOpen = make("folder");
export const Target = make("target");
export const PartyPopper = make("rocket");
export const Moon = make("moon");
export const Sun = make("sun");
export const Network = make("network");
export const MessageSquare = make("messagesquare");
export const Info = make("info");

/* Aliase, unter denen Komponenten die Icons lokal kennen */
export const CheckCircle2 = CheckCircle;
export const UserIcon = User;

/* Praxis-Sync / Sicherheit / Wissen — aus derselben Serie wie alles andere */
export const FileUp = make("uploadcloud");
export const Upload = make("uploadcloud");
export const ShieldAlert = make("shieldalert");
export const KeyRound = make("key");
export const FileJson = make("filejson");
export const Brain = make("brain");
export const Lock = make("lock");
export const Eye = make("eye");
export const Archive = make("archive");
