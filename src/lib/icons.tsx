// Majesticons-Bindung — alle App-Icons kommen aus diesem Set
// (https://majesticons.com, MIT). Die Sammlung wird offline eingebettet
// (addCollection), es gibt keine Laufzeit-Netzwerkfetches.
// Ausnahme: das „Wissen“-Gehirn bleibt bewusst Phosphor `Brain`.
import type { CSSProperties } from "react";
import { addCollection, Icon } from "@iconify/react";
import majesticonsData from "@iconify-json/majesticons/icons.json";

addCollection(majesticonsData);

type IconProps = {
  className?: string;
  style?: CSSProperties;
  /** Phosphor-Kompatibilität: wird von Majesticons ignoriert (nur Brain nutzt es) */
  weight?: string;
  size?: number | string;
};

function make(majesticonsName: string) {
  // Der Name wird beim Modul-Load gegen das Dataset geprüft — Tippfehler
  // fliegen sofort, nicht erst zur Laufzeit.
  if (!(majesticonsName in majesticonsData.icons)) {
    throw new Error(`Majesticons: icon "${majesticonsName}" does not exist`);
  }
  return function Majesticon({ className, style }: IconProps) {
    return (
      <Icon
        icon={`majesticons:${majesticonsName}`}
        className={className}
        style={style}
        aria-hidden="true"
      />
    );
  };
}

export const Search = make("search-line");
export const Plus = make("note-text-plus-line");
export const Database = make("database-line");
export const CheckCircle = make("check-circle-line");
export const Copy = make("clipboard-copy-line");
export const PanelLeftOpen = make("menu-expand-left-line");
export const PanelLeftClose = make("menu-expand-left-line");
export const ScanSearch = make("search-line");
export const UploadCloud = make("cloud-upload-line");
export const Globe = make("globe-line");
export const Loader2 = make("refresh-line");
export const AlertCircle = make("alert-circle-line");
export const Sparkles = make("sparkles-line");
export const SlidersHorizontal = make("filter-line");
export const Trash2 = make("trash-line");
export const Hash = make("hashtag-line");
export const Clock = make("clock-line");
export const Zap = make("lightning-bolt-line");
export const Send = make("send-line");
export const Bot = make("robot-line");
export const User = make("user-line");
export const AlertTriangle = make("exclamation-line");
export const Square = make("stop-circle-line");
export const Check = make("check-line");
export const Coins = make("coins-line");
export const FileText = make("file-text-line");
export const Maximize2 = make("maximize-line");
export const ZoomIn = make("zoom-in-line");
export const ZoomOut = make("zoom-out-line");
export const X = make("close-line");
export const Save = make("save-line");
export const Key = make("key-line");
export const ShieldCheck = make("shield-check-line");
export const SettingsIcon = make("settings-cog-line");
export const Download = make("file-download-line");
export const RefreshCw = make("refresh-line");
export const Cpu = make("cpu-line");
export const HardDriveDownload = make("database-line");
export const Server = make("server-line");
export const Plug = make("link-line");
export const Terminal = make("terminal-line");
export const Braces = make("curly-braces-line");
export const Layers = make("globe-line");
export const ExternalLink = make("external-link-line");
export const XCircle = make("close-circle-line");
export const FileUp = make("cloud-upload-line");
export const ChevronRight = make("arrow-right-line");
export const ChevronLeft = make("arrow-left-line");
export const FolderOpen = make("folder-line");
export const Target = make("flag-line");
export const PartyPopper = make("rocket-3-start-line");
export const Moon = make("moon-line");
export const Sun = make("sun-line");
export const Network = make("share-line");
export const MessageSquare = make("chat-line");
export const Info = make("info-circle-line");

/* Aliase, unter denen Komponenten die Icons lokal kennen */
export const CheckCircle2 = CheckCircle;
export const UserIcon = User;
