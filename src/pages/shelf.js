/** Página Estante: arrastrar archivos dentro y sacarlos otra vez. */

import { state, save, emit, on as subscribe, uid } from "../store.js";
import { esc, fmtBytes, icon, toast, on } from "../ui.js";

const MAX_ITEMS = 12;
const MAX_INLINE = 256 * 1024; // guardamos el contenido en localStorage solo si es pequeño

const extOf = (name) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1, dot + 5) : "file";
};

export function createShelfPage() {
  let els;
  let unsubscribe = null;

  function markup() {
    return `
      <div class="page shelf">
        <div class="dropzone" data-drop>
          <div class="dropzone__icon">${icon("i-upload")}</div>
          <h3>Arrastra archivos aquí</h3>
          <p>Suelta lo que quieras tener a mano. Se guardan entre sesiones y puedes arrastrarlos de vuelta al escritorio.</p>
          <button class="btn btn--ghost" data-pick>Elegir archivos</button>
          <input type="file" multiple hidden data-input />
        </div>
        <div class="shelf__list" data-list></div>
        <div class="shelf__foot">
          <span data-note>Sin archivos</span>
          <span>Arrastra fuera para sacarlos</span>
        </div>
      </div>`;
  }

  function mount(el) {
    el.innerHTML = markup();
    els = {
      drop: el.querySelector("[data-drop]"),
      input: el.querySelector("[data-input]"),
      list: el.querySelector("[data-list]"),
      note: el.querySelector("[data-note]"),
    };

    el.querySelector("[data-pick]").addEventListener("click", () => els.input.click());
    els.input.addEventListener("change", () => {
      addFiles([...els.input.files]);
      els.input.value = "";
    });

    let depth = 0;
    els.drop.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      els.drop.dataset.over = "true";
    });
    els.drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    els.drop.addEventListener("dragleave", () => {
      if (--depth <= 0) {
        depth = 0;
        els.drop.dataset.over = "false";
      }
    });
    els.drop.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      els.drop.dataset.over = "false";
      addFiles([...e.dataTransfer.files]);
    });

    on(el, "[data-remove]", "click", (_e, btn) => {
      state.shelf = state.shelf.filter((f) => f.id !== btn.dataset.remove);
      save();
      emit("shelf");
    });

    on(el, "[data-get]", "click", (_e, btn) => {
      const item = state.shelf.find((f) => f.id === btn.dataset.get);
      if (!item) return;
      if (!item.dataUrl) {
        toast("Contenido grande: solo se guardaron los metadatos");
        return;
      }
      const a = document.createElement("a");
      a.href = item.dataUrl;
      a.download = item.name;
      a.click();
    });

    unsubscribe = subscribe("shelf", render);
    render();
  }

  function addFiles(files) {
    if (!files.length) return;
    const room = MAX_ITEMS - state.shelf.length;
    if (room <= 0) {
      toast(`El estante está lleno (${MAX_ITEMS} archivos)`);
      return;
    }

    const batch = files.slice(0, room);
    let pending = batch.length;

    batch.forEach((file) => {
      const entry = {
        id: uid(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        dataUrl: "",
      };
      state.shelf.unshift(entry);

      if (file.size <= MAX_INLINE) {
        const reader = new FileReader();
        reader.onload = () => {
          entry.dataUrl = String(reader.result);
          if (--pending === 0) commit(batch.length);
        };
        reader.onerror = () => {
          if (--pending === 0) commit(batch.length);
        };
        reader.readAsDataURL(file);
      } else if (--pending === 0) {
        commit(batch.length);
      }
    });

    save();
    render();
    if (batch.length < files.length) toast(`Solo caben ${room} archivos más`);
  }

  function commit(count) {
    save();
    emit("shelf");
    toast(count === 1 ? "1 archivo en el estante" : `${count} archivos en el estante`);
  }

  function render() {
    if (!els) return;
    const items = state.shelf;

    els.list.innerHTML = items
      .map(
        (f) => `
        <div class="file" draggable="true" data-id="${f.id}">
          <span class="file__ext">${esc(extOf(f.name))}</span>
          <span class="file__name" title="${esc(f.name)}">${esc(f.name)}</span>
          <span class="file__size">${fmtBytes(f.size)}</span>
          <button class="file__btn" data-get="${f.id}" title="Descargar" aria-label="Descargar ${esc(f.name)}">${icon("i-download")}</button>
          <button class="file__btn file__btn--danger" data-remove="${f.id}" title="Quitar" aria-label="Quitar ${esc(f.name)}">${icon("i-x")}</button>
        </div>`,
      )
      .join("");

    els.note.textContent =
      items.length === 0
        ? "Sin archivos"
        : `${items.length} ${items.length === 1 ? "archivo" : "archivos"}`;

    // Arrastrar fuera del navegador: Chrome permite soltar con DownloadURL.
    els.list.querySelectorAll(".file").forEach((row) => {
      row.addEventListener("dragstart", (e) => {
        const item = items.find((f) => f.id === row.dataset.id);
        if (!item?.dataUrl) return;
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("DownloadURL", `${item.type}:${item.name}:${item.dataUrl}`);
      });
    });
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
