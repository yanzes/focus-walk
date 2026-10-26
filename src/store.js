/**
 * Store mínimo: estado en memoria + persistencia en localStorage + bus de eventos.
 * Sin dependencias. Toda la app comparte una sola instancia de `state`.
 */

const KEY = "focuswalk.mvp.v1";

const listeners = new Map();

function defaults() {
  return {
    ui: { page: "music", pinned: false, accent: "violet", hoverExpand: true },
    music: { track: 0, playing: true, position: 16, volume: 68, shuffle: false },
    focus: {
      mode: "work", // work | short | long
      running: false,
      endsAt: 0,
      remaining: 25 * 60,
      sessions: 0,
      cycle: 0, // pomodoros completados en la ronda actual (0..3)
    },
    water: { log: {}, goal: 8 },
    tasks: [],
    shelf: [],
    system: { brightness: 78 },
    // Apoyo al proyecto: cuándo toca recordar el café y si se pidió no volver a hacerlo.
    support: { nextAt: 0, never: false, seen: 0 },
  };
}

/** Merge superficial + un nivel de profundidad: suficiente para este estado. */
function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const loaded = merge(base, JSON.parse(raw));
    // La página y el pin no se recuerdan: la app siempre abre como píldora.
    loaded.ui.page = base.ui.page;
    loaded.ui.pinned = false;
    return loaded;
  } catch {
    return base;
  }
}

export let state = load();

let saveTimer = 0;

/** Persiste con debounce para no escribir en cada frame. */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* cuota llena: seguimos en memoria */
    }
  }, 400);
}

export function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignorado */
  }
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorado */
  }
  state = defaults();
  document.documentElement.dataset.accent = state.ui.accent;
  emit("all");
}

/* --- Bus de eventos ------------------------------------------------------ */

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event) {
  for (const fn of listeners.get(event) || []) fn(state);
  if (event !== "all") for (const fn of listeners.get("all") || []) fn(state);
}

/* --- Utilidades ---------------------------------------------------------- */

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveNow();
});
