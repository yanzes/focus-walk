/**
 * Genera una copia autónoma de la app en dist/FocusWalk/.
 *
 * Reutiliza el binario de Electron que ya está instalado en node_modules, así que
 * no descarga nada. El resultado se abre con doble clic en
 * dist/FocusWalk/FocusWalk.exe, sin Node ni npm ni start.bat.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist", "FocusWalk");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist");
const ICON = path.join(ROOT, "assets", "icon.ico");
const EXE = path.join(OUT, "FocusWalk.exe");

// Locales que no usamos: sobran ~50 paquetes de idioma.
const KEEP_LOCALES = new Set(["en-US.pak", "es.pak", "es-419.pak"]);

const APP_FILES = ["index.html", "src", "styles", "electron", "assets"];

function fail(message) {
  console.error("✗ " + message);
  process.exit(1);
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

/** El icono del .exe vive dentro del binario: hay que escribirlo con rcedit. */
async function stampIcon() {
  if (!fs.existsSync(ICON)) {
    console.log("· sin assets/icon.ico: el .exe conserva el icono de Electron");
    return;
  }
  try {
    const { rcedit } = require("rcedit");
    await rcedit(EXE, {
      icon: ICON,
      "version-string": {
        ProductName: "Focus Walk",
        FileDescription: "Focus Walk — notch de escritorio",
        OriginalFilename: "FocusWalk.exe",
      },
    });
    console.log("· icono y propiedades aplicados al ejecutable");
  } catch (err) {
    console.warn("· no se pudo estampar el icono:", err.message);
  }
}

async function main() {
  if (!fs.existsSync(ELECTRON)) {
    fail("no encuentro node_modules/electron/dist — ejecuta `npm install` primero.");
  }
  if (!fs.existsSync(ICON)) {
    console.log("· aviso: falta assets/icon.ico (genera con python tools/make-icons.py)");
  }

  console.log("· limpiando dist/");
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  console.log("· copiando el runtime de Electron");
  fs.cpSync(ELECTRON, OUT, { recursive: true });
  fs.rmSync(path.join(OUT, "resources", "default_app.asar"), { force: true });

  const locales = path.join(OUT, "locales");
  if (fs.existsSync(locales)) {
    for (const file of fs.readdirSync(locales)) {
      if (!KEEP_LOCALES.has(file)) fs.rmSync(path.join(locales, file), { force: true });
    }
  }

  console.log("· copiando la interfaz");
  const appDir = path.join(OUT, "resources", "app");
  fs.mkdirSync(appDir, { recursive: true });
  for (const name of APP_FILES) {
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) fail(`falta ${name}/ en el proyecto`);
    fs.cpSync(from, path.join(appDir, name), {
      recursive: true,
      filter: (src) => !path.basename(src).startsWith("_"),
    });
  }

  // Manifest mínimo: Electron solo necesita name y main. Sin devDependencies ni
  // scripts, para que la copia no parezca un entorno de desarrollo.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        productName: "Focus Walk",
        version: pkg.version,
        description: pkg.description,
        main: pkg.main,
      },
      null,
      2,
    ) + "\n",
  );

  console.log("· nombrar el ejecutable");
  const exe = path.join(OUT, "electron.exe");
  if (!fs.existsSync(exe)) fail("el runtime no trae electron.exe");
  fs.renameSync(exe, EXE);

  await stampIcon();

  const mb = (dirSize(OUT) / (1024 * 1024)).toFixed(0);
  console.log(`\n✓ listo: dist/FocusWalk/FocusWalk.exe  (${mb} MB)\n`);
  console.log("  Doble clic en FocusWalk.exe. Para actualizar la app tras cambiar el código:");
  console.log("  npm run build\n");
}

main();
