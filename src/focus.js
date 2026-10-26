/** Lógica del pomodoro compartida entre el notch y la página. */

import { FOCUS_MODES } from "./data.js";
import { state, save, emit } from "./store.js";
import { mmss } from "./ui.js";
import { showOSD } from "./osd.js";

export const remaining = () =>
  state.focus.running
    ? Math.max(0, (state.focus.endsAt - Date.now()) / 1000)
    : state.focus.remaining;

export const total = () => FOCUS_MODES[state.focus.mode].total;

export function start() {
  state.focus.endsAt = Date.now() + remaining() * 1000;
  state.focus.running = true;
  save();
  emit("focus");
}

export function pause() {
  state.focus.remaining = remaining();
  state.focus.running = false;
  save();
  emit("focus");
}

export function toggle() {
  if (state.focus.running) pause();
  else start();
}

export function reset(mode = state.focus.mode) {
  state.focus.mode = mode;
  state.focus.running = false;
  state.focus.remaining = FOCUS_MODES[mode].total;
  save();
  emit("focus");
}

/** Se llama cuando el temporizador llega a cero. */
export function complete() {
  if (!state.focus.running) return;
  const finished = state.focus.mode;

  if (finished === "work") {
    state.focus.sessions += 1;
    state.focus.cycle = (state.focus.cycle + 1) % 4;
    const nextMode = state.focus.cycle === 0 ? "long" : "short";
    state.focus.mode = nextMode;
    state.focus.remaining = FOCUS_MODES[nextMode].total;
    state.focus.endsAt = Date.now() + state.focus.remaining * 1000;
    state.focus.running = true;
    showOSD({
      icon: "i-timer",
      label: "Enfoque completado",
      value: `${FOCUS_MODES[nextMode].label} · ${mmss(state.focus.remaining)}`,
      percent: 100,
      tone: "focus",
    });
  } else {
    state.focus.mode = "work";
    state.focus.remaining = FOCUS_MODES.work.total;
    state.focus.endsAt = 0;
    state.focus.running = false;
    showOSD({
      icon: "i-timer",
      label: "Pausa terminada",
      value: "Listo para enfocar",
      percent: 100,
      tone: "ok",
    });
  }

  save();
  emit("focus");
}
