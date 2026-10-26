/** Overlays del sistema: controlan el volumen, el brillo y Mayús reales. */

import { state, save } from "./store.js";
import { clamp } from "./ui.js";
import { showOSD } from "./osd.js";
import { isNative } from "./native.js";
import { sys, systemCall } from "./system.js";

let demoCaps = false;

const native = () => isNative && sys.connected;

/**
 * @param {"volume"|"brightness"|"caps"|"device"} kind
 * @param {number} direction 1 sube / alterna, -1 baja
 */
export function triggerOSD(kind, direction = 1) {
  if (native()) {
    switch (kind) {
      case "volume": {
        const base = typeof sys.volume === "number" ? sys.volume : 50;
        systemCall({ cmd: "volume", value: clamp(base + 10 * direction, 0, 100) });
        return; // el OSD lo pinta el cambio real que devuelve el sistema
      }
      case "brightness": {
        if (!sys.brightnessSupported) {
          showOSD({ icon: "i-sun", label: "Brillo", value: "No disponible en este monitor" });
          return;
        }
        const base = typeof sys.brightness === "number" ? sys.brightness : 50;
        systemCall({ cmd: "brightness", value: clamp(base + 10 * direction, 0, 100) });
        return;
      }
      case "caps":
        showOSD({
          icon: "i-caps",
          label: "Bloq Mayús",
          value: sys.caps ? "Activado" : "Desactivado",
          percent: sys.caps ? 100 : 0,
          tone: sys.caps ? "ok" : "",
        });
        return;
      case "device":
        showOSD({
          icon: "i-headphones",
          label: "Salida de audio",
          value: "Dispositivo predeterminado",
          percent: 100,
          tone: "ok",
        });
        return;
    }
  }

  /* --- Navegador / puente no disponible: valores de demostración --- */

  switch (kind) {
    case "volume": {
      const value = clamp(state.music.volume + 10 * direction, 0, 100);
      state.music.volume = value;
      save();
      showOSD({ icon: "i-volume", label: "Volumen", value: `${value}%`, percent: value });
      break;
    }
    case "brightness": {
      const value = clamp(state.system.brightness + 10 * direction, 0, 100);
      state.system.brightness = value;
      save();
      showOSD({ icon: "i-sun", label: "Brillo", value: `${value}%`, percent: value });
      break;
    }
    case "caps": {
      if (direction > 0) demoCaps = !demoCaps;
      showOSD({
        icon: "i-caps",
        label: "Bloq Mayús",
        value: demoCaps ? "Activado" : "Desactivado",
        percent: demoCaps ? 100 : 0,
        tone: demoCaps ? "ok" : "",
      });
      break;
    }
    case "device":
      showOSD({
        icon: "i-headphones",
        label: "Auriculares conectados",
        value: "Bluetooth",
        percent: 100,
        tone: "ok",
      });
      break;
  }
}
