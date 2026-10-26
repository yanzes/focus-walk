/** Motor del notch: estado colapsado/expandido, pestañas, teclado y píldora. */

import { PAGE_DEFS } from "./data.js";
import { state, save, saveNow } from "./store.js";
import { clamp, esc, fmt, mmss, icon, toast } from "./ui.js";
import { currentTrack, onMedia } from "./media.js";
import { isNative } from "./native.js";
import { sys } from "./system.js";
import { setOsdOffset } from "./osd.js";
import { setNotchSize, quitApp } from "./native.js";
import { setNudgeOffset } from "./support.js";

const notch = document.getElementById("notch");
const tabsEl = document.getElementById("tabs");
const pageEl = document.getElementById("page");
const pinBtn = document.getElementById("pin-btn");
const collapseBtn = document.getElementById("collapse-btn");
const powerBtn = document.getElementById("power-btn");
const pill = notch.querySelector(".notch__pill");
const pillText = document.getElementById("pill-text");
const pillMeta = document.getElementById("pill-meta");
const pillClock = document.getElementById("pill-clock");
const pillProgress = document.getElementById("pill-progress");

const COLLAPSED_H = 34;
const COLLAPSED_W = 320;
const EXPANDED_W = 472;

let mountPage = () => null;
let api = null;
let expanded = false;
let pinned = Boolean(state.ui.pinned);
let hoverTimer = 0;

const focusLeft = () =>
  state.focus.running
    ? Math.max(0, (state.focus.endsAt - Date.now()) / 1000)
    : state.focus.remaining;

function defFor(id) {
  return PAGE_DEFS.find((p) => p.id === id) || PAGE_DEFS[0];
}

export function layout() {
  const h = expanded ? defFor(state.ui.page).height : COLLAPSED_H;
  const w = expanded ? EXPANDED_W : COLLAPSED_W;
  notch.style.setProperty("--h", `${h}px`);
  notch.style.setProperty("--w", `${w}px`);
  setOsdOffset(h + 14);
  setNudgeOffset(h + 14);
  // En escritorio la ventana nativa sigue al notch.
  setNotchSize(w, h);
}

export function isExpanded() {
  return expanded;
}

export function setExpanded(next) {
  if (expanded === next) return;
  expanded = next;
  notch.dataset.state = expanded ? "expanded" : "collapsed";
  layout();
}

export function setPinned(next) {
  pinned = next;
  state.ui.pinned = next;
  save();
  pinBtn.setAttribute("aria-pressed", String(next));
  if (next) setExpanded(true);
  else if (!notch.matches(":hover")) setExpanded(false);
}

function setPage(id) {
  if (!PAGE_DEFS.some((p) => p.id === id)) return;
  state.ui.page = id;
  save();
  for (const tab of tabsEl.children) {
    tab.setAttribute("aria-selected", String(tab.dataset.page === id));
  }
  api?.destroy?.();
  pageEl.innerHTML = "";
  api = mountPage(pageEl, id);
  api?.render?.();
  layout();
}

export function goToPage(id) {
  setPage(id);
  setExpanded(true);
}

/* --- Píldora (estado colapsado) ------------------------------------------ */

let lastKey = "\u0000";
let lastPlaying = null;

export function syncPill() {
  const track = currentTrack();
  const connecting = isNative && !sys.connected;
  const key = track ? track.key : connecting ? "connecting" : "none";
  const playing = track ? track.playing : false;

  if (lastKey !== key || lastPlaying !== playing) {
    pillText.innerHTML = track
      ? `<strong>${esc(track.title)}</strong>${
          playing ? "" : ` <span style="opacity:.55">· en pausa</span>`
        }`
      : connecting
        ? `<strong>Conectando…</strong>`
        : `<strong>Sin reproducción</strong>`;
    notch.dataset.playing = String(playing);
    lastKey = key;
    lastPlaying = playing;
  }
  tickPill();
}

export function tickPill() {
  const track = currentTrack();

  if (track && track.duration > 0) {
    pillProgress.style.width = `${clamp((track.position / track.duration) * 100, 0, 100)}%`;
  } else {
    pillProgress.style.width = "0%";
  }

  if (state.focus.running) {
    pillMeta.textContent = mmss(focusLeft());
    pillMeta.style.color = "var(--focus)";
  } else if (track) {
    pillMeta.textContent = track.duration > 0 ? fmt(track.duration - track.position) : "";
    pillMeta.style.color = "";
  } else {
    // La hora ya vive en su propio hueco: aquí no se repite.
    pillMeta.textContent = "";
    pillMeta.style.color = "";
  }
}

/* --- Arranque ------------------------------------------------------------ */

export function initNotch(mountFn) {
  mountPage = mountFn;

  PAGE_DEFS.forEach((p, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.dataset.page = p.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(p.id === state.ui.page));
    tab.setAttribute("aria-controls", "page");
    tab.title = `${p.label} · ${i + 1}`;
    tab.setAttribute("aria-label", p.label);
    tab.innerHTML = icon(p.icon);
    tabsEl.appendChild(tab);
  });

  tabsEl.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) setPage(tab.dataset.page);
  });

  notch.addEventListener("pointerenter", () => {
    clearTimeout(hoverTimer);
    if (state.ui.hoverExpand || pinned) setExpanded(true);
  });

  notch.addEventListener("pointerleave", () => {
    clearTimeout(hoverTimer);
    if (pinned) return;
    hoverTimer = setTimeout(() => setExpanded(false), 240);
  });

  // Toque o clic en la píldora colapsada: abrir y fijar.
  pill.addEventListener("click", () => {
    if (!expanded) setPinned(true);
  });

  pinBtn.addEventListener("click", () => setPinned(!pinned));
  collapseBtn.addEventListener("click", () => {
    setPinned(false);
    setExpanded(false);
  });

  // Apagar: guarda antes de cerrar para no perder el último cambio pendiente.
  powerBtn.addEventListener("click", () => {
    saveNow();
    if (!quitApp()) toast("Solo disponible en la app de escritorio");
  });

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.key === "Escape") {
      setPinned(false);
      setExpanded(false);
      return;
    }
    if (!expanded) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpanded(true);
      }
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = PAGE_DEFS.findIndex((p) => p.id === state.ui.page);
      const next = (i + (e.key === "ArrowRight" ? 1 : PAGE_DEFS.length - 1)) % PAGE_DEFS.length;
      setPage(PAGE_DEFS[next].id);
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= PAGE_DEFS.length) {
      setPage(PAGE_DEFS[n - 1].id);
    }
  });

  const paintClock = () => {
    if (!pillClock) return;
    const text = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (pillClock.textContent !== text) pillClock.textContent = text;
  };
  paintClock();
  setInterval(paintClock, 1000);

  onMedia(syncPill);
  setPage(state.ui.page);
  pinBtn.setAttribute("aria-pressed", String(pinned));
  layout();
  syncPill();

  if (pinned) setExpanded(true);
}

export const getPageApi = () => api;
