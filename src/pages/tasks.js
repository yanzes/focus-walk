/** Página Tareas: lista rápida con persistencia. */

import { state, save, emit, on as subscribe, uid } from "../store.js";
import { esc, icon, on } from "../ui.js";

export function createTasksPage() {
  let els;
  let unsubscribe = null;

  function markup() {
    return `
      <div class="page">
        <div class="page__title">
          <h2>Tareas</h2>
          <span data-summary></span>
        </div>
        <form class="tasks__form" data-form>
          <input type="text" placeholder="¿Qué sigue?" maxlength="120" aria-label="Nueva tarea" data-input />
          <button type="submit" aria-label="Añadir tarea">${icon("i-plus")}</button>
        </form>
        <div class="scroll">
          <div class="task-list" data-list></div>
          <div class="empty" data-empty>
            ${icon("i-sparkle")}
            <span>Sin pendientes. Añade la primera.</span>
          </div>
        </div>
        <div class="shelf__foot">
          <span data-foot>0 tareas</span>
          <button class="chip" data-clear hidden>Limpiar completadas</button>
        </div>
      </div>`;
  }

  function mount(el) {
    el.innerHTML = markup();
    els = {
      form: el.querySelector("[data-form]"),
      input: el.querySelector("[data-input]"),
      list: el.querySelector("[data-list]"),
      empty: el.querySelector("[data-empty]"),
      summary: el.querySelector("[data-summary]"),
      foot: el.querySelector("[data-foot]"),
      clear: el.querySelector("[data-clear]"),
    };

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = els.input.value.trim();
      if (!text) return;
      state.tasks.unshift({ id: uid(), text, done: false, at: Date.now() });
      els.input.value = "";
      save();
      emit("tasks");
    });

    on(el, "[data-toggle]", "click", (_e, btn) => {
      const task = state.tasks.find((t) => t.id === btn.dataset.toggle);
      if (!task) return;
      task.done = !task.done;
      save();
      emit("tasks");
    });

    on(el, "[data-del]", "click", (_e, btn) => {
      state.tasks = state.tasks.filter((t) => t.id !== btn.dataset.del);
      save();
      emit("tasks");
    });

    els.clear.addEventListener("click", () => {
      state.tasks = state.tasks.filter((t) => !t.done);
      save();
      emit("tasks");
    });

    unsubscribe = subscribe("tasks", render);
    render();
  }

  function render() {
    if (!els) return;
    const tasks = state.tasks;
    const done = tasks.filter((t) => t.done).length;

    els.list.innerHTML = tasks
      .map(
        (t) => `
        <div class="task" data-done="${t.done}">
          <button class="task__check" data-toggle="${t.id}" aria-label="${
            t.done ? "Marcar pendiente" : "Marcar hecha"
          }" aria-pressed="${t.done}">${icon("i-check")}</button>
          <span class="task__text">${esc(t.text)}</span>
          <button class="task__del" data-del="${t.id}" aria-label="Eliminar">${icon("i-x")}</button>
        </div>`,
      )
      .join("");

    els.empty.hidden = tasks.length > 0;
    els.summary.textContent = tasks.length ? `${done}/${tasks.length}` : "";
    els.foot.textContent = `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`;
    els.clear.hidden = done === 0;
    els.clear.textContent = `Limpiar ${done}`;
  }

  return {
    mount,
    render,
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
