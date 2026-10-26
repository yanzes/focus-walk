/** Página Enfoque: pomodoro con anillo de progreso. */

import { FOCUS_MODES } from "../data.js";
import { state, on as subscribe } from "../store.js";
import { mmss, icon } from "../ui.js";
import { remaining, total, toggle, reset } from "../focus.js";

const R = 52;
const C = 2 * Math.PI * R;

export function createFocusPage() {
  let els;
  let unsubscribe = null;

  function markup() {
    return `
      <div class="page focus">
        <div class="ring">
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="var(--focus)" />
                <stop offset="100%" stop-color="var(--accent-3)" />
              </linearGradient>
            </defs>
            <circle class="ring__track" cx="60" cy="60" r="${R}" />
            <circle class="ring__fill" cx="60" cy="60" r="${R}"
              stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-ring />
          </svg>
          <div class="ring__inner">
            <div class="ring__time" data-time>25:00</div>
            <div class="ring__mode" data-label>Enfoque</div>
          </div>
        </div>

        <div class="focus__presets">
          ${Object.entries(FOCUS_MODES)
            .map(
              ([key, m]) =>
                `<button class="chip" data-preset="${key}" aria-pressed="false">${m.label} · ${
                  m.total / 60
                }m</button>`,
            )
            .join("")}
        </div>

        <div class="focus__actions">
          <button class="btn btn--primary" data-start>${icon("i-play")}<span data-start-label>Empezar</span></button>
          <button class="btn btn--ghost" data-reset aria-label="Reiniciar">${icon("i-reset")}Reiniciar</button>
        </div>

        <div class="focus__meta">
          <span class="dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span data-sessions>0 sesiones</span>
        </div>
      </div>`;
  }

  function mount(el) {
    el.innerHTML = markup();
    els = {
      ring: el.querySelector("[data-ring]"),
      time: el.querySelector("[data-time]"),
      label: el.querySelector("[data-label]"),
      start: el.querySelector("[data-start]"),
      startLabel: el.querySelector("[data-start-label]"),
      dots: [...el.querySelectorAll(".dots i")],
      sessions: el.querySelector("[data-sessions]"),
      presets: [...el.querySelectorAll("[data-preset]")],
    };

    el.querySelector("[data-start]").addEventListener("click", toggle);
    el.querySelector("[data-reset]").addEventListener("click", () => reset());
    els.presets.forEach((b) =>
      b.addEventListener("click", () => reset(b.dataset.preset)),
    );

    unsubscribe = subscribe("focus", render);
    render();
  }

  function render() {
    if (!els) return;
    const mode = FOCUS_MODES[state.focus.mode];
    const secs = remaining();
    const progress = 1 - secs / total();

    els.time.textContent = mmss(secs);
    els.label.textContent = state.focus.running ? mode.label : `${mode.label} · en pausa`;
    els.ring.style.strokeDashoffset = String(C * (1 - Math.min(1, Math.max(0, progress))));
    els.ring.style.stroke = mode.tone === "focus" ? "var(--focus)" : "var(--accent)";
    els.startLabel.textContent = state.focus.running
      ? "Pausar"
      : secs < total() && secs > 0
        ? "Reanudar"
        : "Empezar";
    els.start.innerHTML = `${icon(state.focus.running ? "i-pause" : "i-play")}<span data-start-label>${
      els.startLabel.textContent
    }</span>`;
    els.startLabel = els.start.querySelector("[data-start-label]");

    els.presets.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === state.focus.mode)));
    els.dots.forEach((d, i) => d.setAttribute("data-done", String(i < state.focus.cycle)));
    els.sessions.textContent = `${state.focus.sessions} ${
      state.focus.sessions === 1 ? "sesión" : "sesiones"
    }`;
    document.title = state.focus.running
      ? `${mmss(secs)} · ${mode.label} — Focus Walk`
      : "Focus Walk — notch de escritorio";
  }

  return {
    mount,
    render,
    tick() {
      if (!els) return;
      const secs = remaining();
      els.time.textContent = mmss(secs);
      const progress = 1 - secs / total();
      els.ring.style.strokeDashoffset = String(C * (1 - Math.min(1, Math.max(0, progress))));
    },
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      document.title = "Focus Walk — notch de escritorio";
    },
  };
}
