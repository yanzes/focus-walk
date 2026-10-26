/** Arranque: registro de páginas, bucle de relojes y disparadores de OSD. */

import { state, emit, on } from "./store.js";
import { initNative, isNative } from "./native.js";
import { sys, initSystem, onSystem } from "./system.js";
import { currentTrack, onMedia } from "./media.js";
import { showOSD } from "./osd.js";
import { triggerOSD } from "./overlays.js";
import { initNotch, syncPill, tickPill, getPageApi, layout } from "./notch.js";
import { advance } from "./player.js";
import { complete } from "./focus.js";
import { createMusicPage } from "./pages/music.js";
import { createFocusPage } from "./pages/focus.js";
import { createWaterPage } from "./pages/water.js";
import { createShelfPage } from "./pages/shelf.js";
import { createTasksPage } from "./pages/tasks.js";
import { createSettingsPage } from "./pages/settings.js";
import { initCoffeeNudge } from "./support.js";

const registry = {
  music: createMusicPage,
  focus: createFocusPage,
  water: createWaterPage,
  shelf: createShelfPage,
  tasks: createTasksPage,
  settings: createSettingsPage,
};

/* --- Tema -------------------------------------------------------------- */

initNative();
initSystem();
document.documentElement.dataset.accent = state.ui.accent;

/* --- Notch ------------------------------------------------------------- */

initNotch((el, id) => {
  const page = (registry[id] || createMusicPage)();
  page.mount(el);
  return page;
});

/* --- Bucle de relojes -------------------------------------------------- */

let last = performance.now();
let lastPill = 0;
let rafId = 0;

/** El bucle solo vive mientras hay algo que animar (música o pomodoro). */
function wake() {
  syncPill();
  if (!rafId) {
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

/** En escritorio manda la sesión real; en navegador, el reloj de demo. */
const isPlaying = () =>
  isNative ? Boolean(currentTrack()?.playing) : Boolean(state.music.playing);

function frame(now) {
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;

  if (!isNative && state.music.playing) {
    const changed = advance(dt);
    if (changed) syncPill();
  }

  if (state.focus.running && Date.now() >= state.focus.endsAt) {
    complete();
    syncPill();
  }

  getPageApi()?.tick?.(now, dt);

  if (now - lastPill > 120) {
    tickPill();
    lastPill = now;
  }

  if (isPlaying() || state.focus.running) {
    rafId = requestAnimationFrame(frame);
  } else {
    rafId = 0; // reposo: cero trabajo hasta el próximo evento
  }
}

on("music", wake);
on("focus", wake);
onMedia(wake);
wake();

/* --- Cambios reales del sistema -> overlays ---------------------------- */

let previous = { volume: null, caps: null, brightness: null, ready: false };

onSystem(() => {
  if (!sys.connected) return;

  if (previous.ready) {
    if (sys.volume !== null && previous.volume !== null && sys.volume !== previous.volume) {
      showOSD({
        icon: "i-volume",
        label: sys.muted ? "Silenciado" : "Volumen",
        value: `${sys.volume}%`,
        percent: sys.volume,
      });
    } else if (
      sys.brightness !== null &&
      previous.brightness !== null &&
      sys.brightness !== previous.brightness
    ) {
      showOSD({
        icon: "i-sun",
        label: "Brillo",
        value: `${sys.brightness}%`,
        percent: sys.brightness,
      });
    } else if (sys.caps !== null && previous.caps !== null && sys.caps !== previous.caps) {
      showOSD({
        icon: "i-caps",
        label: "Bloq Mayús",
        value: sys.caps ? "Activado" : "Desactivado",
        percent: sys.caps ? 100 : 0,
        tone: sys.caps ? "ok" : "",
      });
    }
  }

  previous = { volume: sys.volume, caps: sys.caps, brightness: sys.brightness, ready: true };
});

/* --- Reloj de la taskbar ----------------------------------------------- */

const tbTime = document.getElementById("tb-time");
const tbDate = document.getElementById("tb-date");

function paintClock() {
  const now = new Date();
  tbTime.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  tbDate.textContent = now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

paintClock();
setInterval(paintClock, 1000 * 15);

/* --- Overlays del sistema ---------------------------------------------- */

document.querySelectorAll("[data-osd]").forEach((btn) => {
  const kind = btn.dataset.osd;
  btn.title =
    kind === "caps" || kind === "device"
      ? "Mostrar overlay"
      : "Clic suma · clic derecho resta";
  btn.addEventListener("click", () => triggerOSD(kind, 1));
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    triggerOSD(kind, -1);
  });
});

/* --- Listo ------------------------------------------------------------- */

layout();
syncPill();
initCoffeeNudge();
document.body.dataset.ready = "true";
emit("ui");
