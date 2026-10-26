/**
 * Adaptación a la ventana nativa (Electron). En el navegador todo esto es inerte.
 */

const api = typeof window !== "undefined" ? window.notchNative : null;

export const isNative = Boolean(api && api.isNative);

let lastW = 0;
let lastH = 0;
let timer = 0;

export function initNative() {
  if (!isNative) return false;
  document.documentElement.dataset.native = "true";
  return true;
}

/**
 * La ventana debe medir exactamente lo que el notch: crece al instante y se
 * encoge cuando termina la animación de cierre, para no recortarla.
 */
export function setNotchSize(w, h) {
  if (!isNative) return;
  clearTimeout(timer);
  const grows = w > lastW || h > lastH || lastW === 0;
  const apply = () => {
    lastW = w;
    lastH = h;
    api.setNotchSize(Math.round(w), Math.round(h));
  };
  if (grows) apply();
  else timer = setTimeout(apply, 520);
}

/* --- Espacio debajo del notch ------------------------------------------- */

/**
 * Varios avisos pueden vivir a la vez (OSD del sistema y recordatorio del
 * café). Se suman por consumidor: si uno se va, la ventana conserva el hueco
 * del otro en vez de recortarlo.
 */
const overlaySlots = new Map();

function pushOverlay() {
  let total = 0;
  for (const px of overlaySlots.values()) total += px;
  api.setOverlay(Math.round(total));
}

export function reserveOverlay(key, px) {
  if (!isNative) return;
  if (px > 0) overlaySlots.set(key, px);
  else overlaySlots.delete(key);
  pushOverlay();
}

export function releaseOverlay(key) {
  if (!isNative) return;
  overlaySlots.delete(key);
  pushOverlay();
}

/** Hueco extra debajo del notch para que quepan los avisos del sistema. */
export function setOverlaySpace(px) {
  reserveOverlay("osd", px);
}

/* --- Acciones del sistema ------------------------------------------------ */

/** Abre un enlace en el navegador del sistema, nunca dentro de la app. */
export function openExternal(url) {
  if (isNative) {
    api.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

/** Cierra la app (en el navegador no hay nada que cerrar). */
export function quitApp() {
  if (isNative) api.quit();
  return isNative;
}

/** Lanza el desinstalador de Windows. Solo existe si la app está instalada. */
export function uninstall() {
  if (!isNative) return Promise.resolve({ ok: false, reason: "browser" });
  return api.uninstall();
}
