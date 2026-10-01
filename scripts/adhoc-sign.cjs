// Ad-hoc-Signatur fuer macOS-Builds.
//
// Ohne Apple-Zertifikat laesst electron-builder das App-Buendel ungesigniert —
// mit CSC_IDENTITY_AUTO_DISCOVERY=false erst recht. Herauskommt ein Buendel ohne
// _CodeSignature, dessen einzige Signatur die linker-signierte der Electron-
// Binaerdatei ist (Identifier=Electron). codesign --verify schlaegt darauf fehl.
//
// Fuer Nutzer ist das schlimmer als "unsigniert": macOS meldet dann haeufig
// "KEPTA ist beschaedigt und kann nicht geoeffnet werden" statt "Entwickler nicht
// verifiziert" — und fuer "beschaedigt" gibt es kein "Trotzdem oeffnen".
//
// Eine Ad-hoc-Signatur kostet nichts und behebt genau das. Sie ersetzt keine
// Notarisierung: die Gatekeeper-Warnung bleibt, aber sie wird zur normalen,
// ueberwindbaren Warnung.
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  Ad-hoc-Signatur: ${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });

  // Nicht signieren und hoffen: pruefen. Ein Buendel mit kaputter Signatur ist
  // schlimmer als eines ohne, deshalb bricht der Build hier lieber ab.
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  // codesign schreibt seine Beschreibung auf stderr. execFileSync liefert aber
  // stdout — mit stdio ["ignore","ignore","pipe"] also null. Genau daran ist der
  // Build einmal gestorben: an der Protokollzeile, nicht am Signieren.
  const beschreibung = spawnSync("codesign", ["-dv", "--verbose=2", app], { encoding: "utf8" });
  const info = beschreibung.stderr ?? "";
  const zeile = [/Identifier=\S+/, /Signature=\S+/]
    .map((r) => (info.match(r) ?? ["?"])[0])
    .join(" ");
  console.log("  geprueft:", zeile);
};
