/** Página Ajustes: acento, comportamiento y datos. */

import { state, save, emit, on as subscribe, reset, dateKey } from "../store.js";
import { setPinned, goToPage, syncPill } from "../notch.js";
import { triggerOSD } from "../overlays.js";
import { icon } from "../ui.js";
import { isNative, uninstall } from "../native.js";
import { isCoffeePaused, openDonation, setCoffeePaused } from "../support.js";

const ACCENTS = [
  { id: "violet", color: "#7c5cff", label: "Violeta" },
  { id: "cyan", color: "#22d3ee", label: "Cian" },
  { id: "amber", color: "#fbbf24", label: "Ámbar" },
  { id: "rose", color: "#fb7185", label: "Rosa" },
  { id: "emerald", color: "#34d399", label: "Esmeralda" },
];

export function createSettingsPage() {
  let els;
  let unsubscribe = null;
  let confirmTimer = 0;

  function note() {
    return isNative
      ? "<b>App de escritorio.</b> Todo se guarda en tu equipo, en la carpeta de datos de " +
          "Focus Walk. La ventana es nativa: sin bordes, siempre encima y transparente."
      : "<b>Modo navegador.</b> Aquí los datos se guardan en este navegador, no en la app " +
          "instalada. Úsalo solo para depurar: la app real es la del escritorio.";
  }

  function markup() {
    return `
      <div class="page">
        <div class="page__title">
          <h2>Ajustes</h2>
          <span class="brand"><img class="brand__mark" src="assets/tray.png" alt="" />Focus Walk</span>
        </div>

        <div class="scroll">
          <div class="settings__group">
            <div class="settings__label">Apariencia</div>
            <div class="row">
              <div class="row__text">
                <strong>Color de acento</strong>
                <span>Se aplica a todo el notch</span>
              </div>
              <div class="swatches">
                ${ACCENTS.map(
                  (a) =>
                    `<button class="swatch" data-accent="${a.id}" style="background:${a.color}" title="${a.label}" aria-label="${a.label}" aria-pressed="false"></button>`,
                ).join("")}
              </div>
            </div>
          </div>

          <div class="settings__group">
            <div class="settings__label">Comportamiento</div>
            <div class="row">
              <div class="row__text">
                <strong>Abrir al pasar el cursor</strong>
                <span>Como el notch de un portátil</span>
              </div>
              <button class="switch" role="switch" aria-checked="true" data-switch="hover" aria-label="Abrir al pasar el cursor"></button>
            </div>
            <div class="row">
              <div class="row__text">
                <strong>Mantener abierto</strong>
                <span>No se cierra al salir con el cursor</span>
              </div>
              <button class="switch" role="switch" aria-checked="false" data-switch="pin" aria-label="Mantener abierto"></button>
            </div>
          </div>

          <div class="settings__group">
            <div class="settings__label">Overlays del sistema</div>
            <div class="row">
              <div class="row__text">
                <strong>Probar avisos</strong>
                <span>Volumen, brillo y Mayús</span>
              </div>
              <div class="swatches" style="gap: 4px">
                <button class="chip chip--icon" data-osd-test="volume" title="Volumen" aria-label="Probar volumen">${icon("i-volume")}</button>
                <button class="chip chip--icon" data-osd-test="brightness" title="Brillo" aria-label="Probar brillo">${icon("i-sun")}</button>
                <button class="chip chip--icon" data-osd-test="caps" title="Mayús" aria-label="Probar Mayús">${icon("i-caps")}</button>
              </div>
            </div>
          </div>

          <div class="settings__group">
            <div class="settings__label">Datos</div>
            <div class="row">
              <div class="row__text">
                <strong>Restablecer</strong>
                <span data-stats></span>
              </div>
              <button class="chip" data-reset>Restablecer</button>
            </div>
          </div>

          <div class="settings__group">
            <div class="settings__label">Apoyo</div>
            <div class="row">
              <div class="row__text">
                <strong>Invítame a un café</strong>
                <span>Gratis y sin anuncios: un café paga el mantenimiento</span>
              </div>
              <button class="chip chip--accent" data-donate>Café</button>
            </div>
            <div class="row">
              <div class="row__text">
                <strong>Recordarme</strong>
                <span>Un aviso cada 15 días</span>
              </div>
              <button class="switch" role="switch" aria-checked="true" data-switch="coffee" aria-label="Recordarme con un café cada 15 días"></button>
            </div>
          </div>

          ${
            isNative
              ? `<div class="settings__group">
            <div class="settings__label">Desinstalar</div>
            <div class="row">
              <div class="row__text">
                <strong>Quitar Focus Walk del equipo</strong>
                <span data-uninstall-hint>Se abre el desinstalador de Windows. Tus datos se conservan.</span>
              </div>
              <button class="chip chip--danger" data-uninstall>Desinstalar</button>
            </div>
          </div>`
              : ""
          }

          <p class="settings__note">${note()}</p>
        </div>
      </div>`;
  }

  function mount(el) {
    el.innerHTML = markup();
    els = {
      swatches: [...el.querySelectorAll("[data-accent]")],
      hover: el.querySelector('[data-switch="hover"]'),
      pin: el.querySelector('[data-switch="pin"]'),
      coffee: el.querySelector('[data-switch="coffee"]'),
      donate: el.querySelector("[data-donate]"),
      uninstallBtn: el.querySelector("[data-uninstall]"),
      uninstallHint: el.querySelector("[data-uninstall-hint]"),
      resetBtn: el.querySelector("[data-reset]"),
      stats: el.querySelector("[data-stats]"),
    };

    els.swatches.forEach((s) =>
      s.addEventListener("click", () => {
        state.ui.accent = s.dataset.accent;
        document.documentElement.dataset.accent = s.dataset.accent;
        save();
        emit("ui");
      }),
    );

    els.hover.addEventListener("click", () => {
      state.ui.hoverExpand = !state.ui.hoverExpand;
      save();
      emit("ui");
    });

    els.pin.addEventListener("click", () => {
      setPinned(!state.ui.pinned);
      emit("ui");
    });

    el.querySelectorAll("[data-osd-test]").forEach((btn) =>
      btn.addEventListener("click", () => triggerOSD(btn.dataset.osdTest, 1)),
    );

    els.donate.addEventListener("click", openDonation);
    els.coffee.addEventListener("click", () => setCoffeePaused(!isCoffeePaused()));

    // Desinstalar: dos pasos, y luego el desinstalador de Windows toma el relevo.
    els.uninstallBtn?.addEventListener("click", async () => {
      if (els.uninstallBtn.dataset.confirm !== "1") {
        els.uninstallBtn.dataset.confirm = "1";
        els.uninstallBtn.textContent = "¿Seguro?";
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          els.uninstallBtn.dataset.confirm = "0";
          els.uninstallBtn.textContent = "Desinstalar";
        }, 4000);
        return;
      }

      clearTimeout(confirmTimer);
      els.uninstallBtn.disabled = true;
      els.uninstallBtn.textContent = "Abriendo…";
      const result = await uninstall();
      if (result?.ok) return; // la app se cierra y el desinstalador sigue solo
      els.uninstallBtn.disabled = false;
      els.uninstallBtn.dataset.confirm = "0";
      els.uninstallBtn.textContent = "Desinstalar";
      els.uninstallHint.textContent =
        "No encontré el desinstalador: esta copia no está instalada (versión portable o de desarrollo).";
    });

    els.resetBtn.addEventListener("click", () => {
      if (els.resetBtn.dataset.confirm !== "1") {
        els.resetBtn.dataset.confirm = "1";
        els.resetBtn.textContent = "¿Seguro?";
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          els.resetBtn.dataset.confirm = "0";
          els.resetBtn.textContent = "Restablecer";
        }, 3200);
        return;
      }
      clearTimeout(confirmTimer);
      reset();
      for (const ev of ["music", "focus", "water", "tasks", "shelf", "ui"]) emit(ev);
      syncPill();
      goToPage("music");
    });

    unsubscribe = subscribe("all", render);
    render();
  }

  function render() {
    if (!els) return;
    els.swatches.forEach((s) =>
      s.setAttribute("aria-pressed", String(s.dataset.accent === state.ui.accent)),
    );
    els.hover.setAttribute("aria-checked", String(Boolean(state.ui.hoverExpand)));
    els.pin.setAttribute("aria-checked", String(Boolean(state.ui.pinned)));
    els.coffee.setAttribute("aria-checked", String(!isCoffeePaused()));

    const n = (q, one, many) => `${q} ${q === 1 ? one : many}`;
    const open = state.tasks.filter((t) => !t.done).length;
    const glasses = state.water.log[dateKey()] || 0;
    els.stats.textContent = [
      `${n(state.tasks.length, "tarea", "tareas")} (${open} abiertas)`,
      n(state.shelf.length, "archivo", "archivos"),
      `${n(glasses, "vaso", "vasos")} hoy`,
    ].join(" · ");
  }

  return {
    mount,
    render,
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      clearTimeout(confirmTimer);
    },
  };
}
