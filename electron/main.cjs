/**
 * Proceso principal: una única ventana sin bordes, transparente, siempre encima y
 * pegada al borde superior de la pantalla. La ventana mide exactamente lo que el
 * notch, así que no bloquea nada del escritorio que no sea el propio notch.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  protocol,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn, execFile } = require("node:child_process");
const { SystemBridge } = require("./system.cjs");
const lyrics = require("./lyrics.cjs");
const artwork = require("./artwork.cjs");

const ROOT = path.join(__dirname, "..");
const SELF_TEST = process.argv.includes("--self-test");
const PROBE = process.argv.includes("--probe");
const COFFEE_PROBE = process.argv.includes("--coffee");
const UNINSTALL_DRY = process.argv.includes("--uninstall-dry");

/**
 * Las pruebas usan un perfil propio: así no compiten por el bloqueo de instancia
 * única con la app abierta ni borran los datos reales del usuario.
 */
if (SELF_TEST || PROBE || COFFEE_PROBE || UNINSTALL_DRY) {
  try {
    app.setPath("userData", path.join(app.getPath("temp"), "focuswalk-probe"));
  } catch {
    /* si falla, se usa el perfil normal */
  }
}

/** Estado de tamaño que manda el renderer. */
let notch = { w: 288, h: 34 };
let overlay = 0;
let win = null;
let tray = null;
let display = null;

const bridge = new SystemBridge();

let lastArtKey = "";

function refreshArtwork(media) {
  if (!media || !media.title) return;
  const key = `${media.title}|${media.artist || ""}`;
  if (key === lastArtKey) return;
  lastArtKey = key;

  artwork
    .get({ title: media.title, artist: media.artist, album: media.album })
    .then((url) => {
      if (url && win && !win.isDestroyed()) win.webContents.send("system:art", { key, url });
    })
    .catch(() => {});
}

bridge.on("state", (state) => {
  refreshArtwork(state.media);
  if (win && !win.isDestroyed()) win.webContents.send("system:state", state);
});
bridge.on("connection", (connected) => {
  if (win && !win.isDestroyed()) win.webContents.send("system:connection", connected);
});
bridge.on("log", (message) => console.log("[bridge]", message));


protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function serve(request) {
  try {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(path.normalize(ROOT))) {
      return new Response("Forbidden", { status: 403 });
    }
    return fs.readFile(filePath).then(
      (data) =>
        new Response(data, {
          headers: { "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" },
        }),
      () => new Response("Not found", { status: 404 }),
    );
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}

/** La pantalla elegida puede desaparecer (monitor desconectado): se re-resuelve. */
function resolveDisplay() {
  const all = screen.getAllDisplays();
  const current = display && all.find((d) => d.id === display.id);
  return current || screen.getPrimaryDisplay();
}

function applyBounds() {
  if (!win || win.isDestroyed()) return;
  display = resolveDisplay();
  const area = display.workArea;
  const width = Math.max(120, Math.round(notch.w));
  const height = Math.max(30, Math.round(notch.h + overlay));
  win.setBounds({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y),
    width,
    height,
  });
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.showInactive();
    win.setAlwaysOnTop(true, "floating");
  }
}

function buildTray() {
  try {
    const img = nativeImage.createFromPath(path.join(ROOT, "assets", "tray.png"));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip("Focus Walk — notch");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Mostrar / ocultar notch", accelerator: "CommandOrControl+Alt+N", click: toggleVisible },
        { label: "Recargar", click: () => win && win.reload() },
        { type: "separator" },
        { label: "Salir", accelerator: "CommandOrControl+Alt+Q", click: () => app.quit() },
      ]),
    );
    tray.on("click", toggleVisible);
  } catch (err) {
    console.error("[focuswalk] no se pudo crear el icono de bandeja:", err.message);
  }
}

function createWindow() {
  display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;

  win = new BrowserWindow({
    width: notch.w,
    height: notch.h,
    x: Math.round(area.x + (area.width - notch.w) / 2),
    y: Math.round(area.y),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    // Sin bordes, redimensionar a mano solo rompería la geometría del notch.
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: path.join(ROOT, "assets", "icon.png"),
    title: "Focus Walk",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setMenu(null);
  win.loadURL("app://focuswalk/index.html");

  win.once("ready-to-show", () => {
    win.showInactive();
    win.setAlwaysOnTop(true, "floating");
  });

  // Nunca navegar fuera de la app.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://focuswalk/")) event.preventDefault();
  });

  if (PROBE) {
    win.webContents.once("did-finish-load", () => runProbe());
  }

  if (SELF_TEST) {
    win.webContents.on("console-message", (...args) => {
      const first = args[0];
      const msg =
        first && typeof first === "object" && "message" in first
          ? `${first.level}: ${first.message}`
          : `${args[1]}: ${args[2]}`;
      console.log("[renderer]", msg);
    });
    win.webContents.once("did-finish-load", () => runSelfTest());
  }
}

async function capture(name) {
  const os = require("node:os");
  const image = await win.webContents.capturePage();
  const file = path.join(os.tmpdir(), name);
  await fs.writeFile(file, image.toPNG());
  const size = image.getSize();
  const bmp = image.toBitmap(); // BGRA
  const at = (x, y) => {
    const i = (y * size.width + x) * 4;
    return [bmp[i + 2], bmp[i + 1], bmp[i], bmp[i + 3]];
  };
  console.log(
    "PIX " +
      JSON.stringify({
        size: [size.width, size.height],
        top: at(size.width >> 1, 8),
        mid: at(size.width >> 1, size.height >> 1),
        bottom: at(size.width >> 1, size.height - 6),
        corner: at(4, size.height - 6),
        column: [0.7, 0.8, 0.88, 0.94, 0.99].map((f) => at(size.width >> 1, Math.round(size.height * f))),
      }),
  );
  console.log("SHOT " + file);
}

async function runProbe() {
  // En arranque en frío el primer pointerenter llegaba antes de que la interfaz
  // hubiera enganchado sus escuchas: se espera a que esté lista de verdad.
  for (let i = 0; i < 60; i++) {
    const ready = await win.webContents.executeJavaScript("document.body.dataset.ready === 'true'");
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await win.webContents.executeJavaScript(
    "document.getElementById('notch').dispatchEvent(new PointerEvent('pointerenter'))",
  );
  await new Promise((r) => setTimeout(r, 900));
  await win.webContents.executeJavaScript("document.querySelector('[data-page=\"settings\"]').click()");
  await new Promise((r) => setTimeout(r, 1600));
  const g = await win.webContents.executeJavaScript(`(() => {
    const n = document.getElementById('notch');
    const r = n.getBoundingClientRect();
    const b = document.querySelector('.notch__body');
    const br = b.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(innerWidth / 2), innerHeight - 8);
    return {
      vw: innerWidth, vh: innerHeight,
      notch: [Math.round(r.top), Math.round(r.height)],
      cssH: getComputedStyle(n).height,
      varH: n.style.getPropertyValue('--h'),
      body: [Math.round(br.top), Math.round(br.height)],
      page: Math.round(document.querySelector('.page').getBoundingClientRect().height),
      bottomEl: el ? (el.className || el.tagName) : null,
      htmlH: Math.round(document.documentElement.getBoundingClientRect().height),
      note: (document.querySelector('.settings__note') || {}).textContent || null,
      title: document.title,
      power: !!document.querySelector('#power-btn'),
      donate: document.querySelector('[data-donate]')?.textContent || null,
      coffeeSwitch: document.querySelector('[data-switch="coffee"]')?.getAttribute('aria-checked') ?? null,
      uninstall: !!document.querySelector('[data-uninstall]'),
      uninstallLast: document.querySelector('.settings__group:last-of-type [data-uninstall]') !== null,
      support: (() => { try { return JSON.parse(localStorage.getItem('focuswalk.mvp.v1') || '{}').support || null; } catch { return null; } })(),
      coffeeAtBoot: !!document.querySelector('.coffee'),
    };
  })()`);

  // El puente debe rechazar cualquier esquema que no sea http(s).
  const blocked = await win.webContents.executeJavaScript(
    "window.notchNative.openExternal('file:///C:/Windows/notepad.exe')",
  );
  console.log("PROBE_EXTERNAL " + JSON.stringify({ blocked }));
  console.log("PROBE " + JSON.stringify(g));
  console.log("PROBE_BOUNDS " + JSON.stringify(win.getBounds()));
  await capture("focuswalk-settings.png");

  // El final de Ajustes queda bajo el scroll: se captura aparte.
  await win.webContents.executeJavaScript(
    "(() => { const s = document.querySelector('.scroll'); if (s) s.scrollTop = s.scrollHeight; })()",
  );
  await new Promise((r) => setTimeout(r, 400));
  const tail = await win.webContents.executeJavaScript(`(() => {
    const labels = [...document.querySelectorAll('.settings__label')].map((l) => l.textContent.trim());
    return { labels, donate: !!document.querySelector('[data-donate]'), uninstall: !!document.querySelector('[data-uninstall]') };
  })()`);
  console.log("PROBE_TAIL " + JSON.stringify(tail));
  await capture("focuswalk-settings-bottom.png");

  if (COFFEE_PROBE) {
    // Fuerza el aviso sin tocar el estado guardado, para verlo y medirlo.
    await win.webContents.executeJavaScript(
      "import('app://focuswalk/src/support.js').then((m) => m.showCoffeeNotice())",
    );
    await new Promise((r) => setTimeout(r, 900));
    const card = await win.webContents.executeJavaScript(`(() => {
      const c = document.querySelector('.coffee');
      const r = c ? c.getBoundingClientRect() : null;
      return {
        card: !!c,
        rect: r ? [Math.round(r.top), Math.round(r.height), Math.round(r.width)] : null,
        title: document.querySelector('.coffee strong')?.textContent || null,
        text: (document.querySelector('.coffee__text')?.textContent || '').trim().replace(/\\s+/g, ' '),
        buttons: [...document.querySelectorAll('.coffee button')].map((b) => b.textContent.trim()),
        cardBottom: r ? Math.round(r.bottom) : null,
        windowH: innerHeight,
      };
    })()`);
    console.log("COFFEE " + JSON.stringify(card));
    console.log("COFFEE_BOUNDS " + JSON.stringify(win.getBounds()));
    await capture("focuswalk-coffee.png");
  }

  app.exit(0);
}

async function runSelfTest() {
  await new Promise((r) => setTimeout(r, 1500));
  try {
    // Espera al puente antes de capturar: así la píldora ya tiene la pista real.
    for (let i = 0; i < 20 && !(bridge.state && bridge.state.media); i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    await new Promise((r) => setTimeout(r, 400));
    await capture("focuswalk-collapsed.png");

    // Inyecta una carátula mínima para comprobar el camino carátula -> interfaz.
    const currentMedia = bridge.state && bridge.state.media;
    if (currentMedia && currentMedia.title) {
      win.webContents.send("system:art", {
        key: `${currentMedia.title}|${currentMedia.artist || ""}`,
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      });
    }

    const result = await win.webContents.executeJavaScript(`(async () => {
      const $ = (s) => document.querySelector(s);
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const out = {};
      out.ready = document.body.dataset.ready === 'true';
      out.native = document.documentElement.dataset.native === 'true';
      out.desktopHidden = getComputedStyle(document.querySelector('.desktop')).display === 'none';
      out.notchOpaque = getComputedStyle(document.querySelector('.notch')).backgroundImage.includes('gradient');
      out.tabs = document.querySelectorAll('.tab').length;
      out.pill = $('#pill-text')?.textContent ?? null;
      out.sizeBefore = { w: innerWidth, h: innerHeight };
      const notch = $('#notch');
      notch.dispatchEvent(new PointerEvent('pointerenter'));
      await wait(900);
      out.expanded = notch.dataset.state;
      out.sizeExpanded = { w: innerWidth, h: innerHeight };
      out.geom = {
        win: { w: innerWidth, h: innerHeight },
        notch: (() => { const r = notch.getBoundingClientRect(); return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })(),
        notchCssH: getComputedStyle(notch).height,
        page: Math.round((document.querySelector('.notch__body .page')?.getBoundingClientRect().height) || 0),
        body: Math.round(document.body.getBoundingClientRect().height),
      };
      // Música real: leemos sin tocar la reproducción del usuario.
      await wait(3500); // margen para que el puente y LRCLIB respondan
      out.musicTitle = $('.music__title')?.textContent ?? null;
      out.musicSource = $('[data-source]')?.textContent ?? null;
      out.playLabel = $('[data-act="play"]')?.getAttribute('aria-label') ?? null;
      out.elapsed = $('[data-elapsed]')?.textContent ?? null;
      out.progressWidth = $('[data-fill]')?.style.width ?? null;
      out.lyricsLines = document.querySelectorAll('.lyric').length;
      out.lyricsActive = $('.lyric[data-state="active"]')?.textContent ?? null;
      out.lyricsNote = $('.lyric__empty')?.textContent ?? null;
      out.pillText = $('#pill-text')?.textContent ?? null;
      out.pillClock = $('#pill-clock')?.textContent ?? null;
      await wait(400);
      // Sin pista (o sin puente) la página muestra su estado vacío: no hay portada.
      out.cover = $('.cover') ? (getComputedStyle($('.cover')).backgroundImage || '').slice(0, 46) : null;
      out.lyricsIdle = document.querySelectorAll('.lyrics__idle span').length;
      $('[data-page="focus"]')?.click(); await wait(400);
      out.focusTime = $('[data-time]')?.textContent ?? null;
      $('[data-start]')?.click(); await wait(400);
      out.focusLabel = $('[data-start-label]')?.textContent ?? null;
      $('[data-page="water"]')?.click(); await wait(400);
      out.water = $('[data-count]')?.textContent ?? null;
      $('[data-act="plus"]')?.click(); await wait(300);
      out.waterAfter = $('[data-count]')?.textContent ?? null;
      $('[data-page="tasks"]')?.click(); await wait(300);
      $('[data-input]').value = 'tarea de prueba';
      $('[data-form]').requestSubmit(); await wait(300);
      out.tasks = document.querySelectorAll('.task').length;
      $('[data-page="settings"]')?.click(); await wait(300);
      out.osdTriggers = document.querySelectorAll('[data-osd-test]').length;
      // Brillo no está soportado en este monitor: prueba el OSD sin cambiar nada.
      document.querySelector('[data-osd-test="brightness"]')?.click(); await wait(400);
      out.osdVisible = !!document.querySelector('.osd');
      out.osdText = $('.osd__head span')?.textContent + ' ' + ($('.osd__value')?.textContent ?? '');
      out.sizeWithOsd = { w: innerWidth, h: innerHeight };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await wait(800);
      out.collapsed = notch.dataset.state;
      out.sizeCollapsed = { w: innerWidth, h: innerHeight };
      localStorage.removeItem('focuswalk.mvp.v1');
      return out;
    })()`);
    console.log("SELF_TEST " + JSON.stringify(result));
    console.log("WINDOW_BOUNDS " + JSON.stringify(win.getBounds()));
    await win.webContents.executeJavaScript(
      "document.getElementById('notch').dispatchEvent(new PointerEvent('pointerenter'))",
    );
    await new Promise((r) => setTimeout(r, 700));
    await win.webContents.executeJavaScript(
      "document.querySelector('[data-page=\"music\"]').click()",
    );
    await new Promise((r) => setTimeout(r, 1200));
    await capture("focuswalk-expanded.png");
    // Deja el equipo como estaba: sin tareas, vasos ni pomodoros de prueba.
    await win.webContents.session.clearStorageData({ storages: ["localstorage"] });
  } catch (err) {
    console.error("SELF_TEST_ERROR", err);
  }
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) win.showInactive();
  });

  app.whenReady().then(() => {
    // Identidad propia en la bandeja de Windows (si no, hereda la de Electron).
    app.setAppUserModelId("com.focuswalk.app");

    // Comprobación del desinstalador sin ejecutarlo: no abre ninguna ventana.
    if (UNINSTALL_DRY) {
      findUninstaller().then((file) => {
        console.log("UNINSTALL " + JSON.stringify({ packaged: app.isPackaged, file }));
        app.exit(0);
      });
      return;
    }
    protocol.handle("app", serve);
    lyrics.load(path.join(app.getPath("userData"), "lyrics-cache.json"));
    bridge.start();
    createWindow();
    buildTray();

    globalShortcut.register("CommandOrControl+Alt+N", toggleVisible);
    globalShortcut.register("CommandOrControl+Alt+Q", () => app.quit());

    screen.on("display-metrics-changed", applyBounds);
    screen.on("display-added", applyBounds);
    screen.on("display-removed", applyBounds);
  });
}

ipcMain.on("notch:bounds", (_event, { w, h }) => {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  notch = { w, h };
  applyBounds();
});

ipcMain.on("notch:overlay", (_event, { extra }) => {
  overlay = Number.isFinite(extra) && extra > 0 ? Math.round(extra) : 0;
  applyBounds();
});

ipcMain.on("app:quit", () => app.quit());

ipcMain.handle("app:open-external", (_event, url) => {
  // Solo http(s): nada de file:// ni rutas locales desde la interfaz.
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  shell.openExternal(url);
  return true;
});

/**
 * Localiza el desinstalador de NSIS. La instalación por usuario lo deja junto al
 * ejecutable; si se instaló en otra carpeta, se pregunta al registro.
 */
async function findUninstaller() {
  const candidates = [
    path.join(path.dirname(process.execPath), "Uninstall Focus Walk.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Focus Walk", "Uninstall Focus Walk.exe"),
  ];

  for (const file of candidates) {
    try {
      await fs.access(file);
      return file;
    } catch {
      /* siguiente */
    }
  }

  const query =
    "$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*';" +
    "try { (Get-ItemProperty $p -ErrorAction Stop | Where-Object { $_.DisplayName -like 'Focus Walk*' } |" +
    " Select-Object -First 1 -ExpandProperty UninstallString) } catch { '' }";

  const raw = await new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", query],
      { windowsHide: true, timeout: 6000 },
      (err, stdout) => resolve(err ? "" : String(stdout).trim()),
    );
  });

  const match = raw.match(/"([^"]+\.exe)"|([^\s"]+\.exe)/i);
  if (!match) return null;
  const file = (match[1] || match[2]).trim();
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

ipcMain.handle("app:uninstall", async () => {
  // En desarrollo el ejecutable es electron.exe: no hay nada que desinstalar.
  if (!app.isPackaged) return { ok: false, reason: "dev" };

  const uninstaller = await findUninstaller();
  if (!uninstaller) return { ok: false, reason: "not-installed" };

  try {
    // Detached: el desinstalador debe sobrevivir a que la app se cierre.
    spawn(uninstaller, [], { detached: true, stdio: "ignore", windowsHide: false }).unref();
    setTimeout(() => app.quit(), 600);
    return { ok: true, path: uninstaller };
  } catch (err) {
    return { ok: false, reason: "error", message: err.message };
  }
});

ipcMain.handle("system:snapshot", () => ({ state: bridge.state, connected: bridge.connected }));
ipcMain.on("system:call", (_event, command) => {
  if (command && typeof command.cmd === "string") bridge.send(command);
});
ipcMain.handle("system:lyrics", (_event, track) => lyrics.get(track));

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  bridge.stop();
});

// También al salir por app.exit(), para no dejar el proceso del puente vivo.
process.on("exit", () => bridge.stop());
