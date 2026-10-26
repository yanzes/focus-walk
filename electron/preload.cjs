/** Puente mínimo entre la interfaz y el sistema: ventana y estado real de Windows. */

const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel, cb) => {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("notchNative", {
  isNative: true,

  /** Redimensiona la ventana para que mida exactamente lo que el notch. */
  setNotchSize: (w, h) => ipcRenderer.send("notch:bounds", { w, h }),
  /** Espacio extra debajo del notch para los avisos (OSD). */
  setOverlay: (extra) => ipcRenderer.send("notch:overlay", { extra }),
  quit: () => ipcRenderer.send("app:quit"),
  /** Abre un enlace en el navegador del sistema (nunca dentro del notch). */
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  /** Abre el desinstalador de Windows. Devuelve { ok, reason }. */
  uninstall: () => ipcRenderer.invoke("app:uninstall"),

  system: {
    snapshot: () => ipcRenderer.invoke("system:snapshot"),
    call: (command) => ipcRenderer.send("system:call", command),
    lyrics: (track) => ipcRenderer.invoke("system:lyrics", track),
    onState: (cb) => listen("system:state", cb),
    onConnection: (cb) => listen("system:connection", cb),
    onArt: (cb) => listen("system:art", cb),
  },
});
