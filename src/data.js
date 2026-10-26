/** Datos de demo + definición de las páginas del notch. */

export const TRACKS = [
  {
    title: "Medianoche en Yakarta",
    artist: "Sable Kain",
    album: "Neón húmedo",
    duration: 204,
    art: "linear-gradient(142deg, #8b6bff 0%, #3b1d7a 58%, #120c26 100%)",
    lyrics: `[00:14.00] Luces de neón sobre el asfalto
[00:20.50] Jakarta no duerme, y yo tampoco
[00:27.00] Cuento las horas en el cristal
[00:33.50] Tu voz de fondo, señal digital
[00:41.00] Y si el mundo se apaga
[00:47.50] quedan tus manos en la penumbra
[00:55.00] Media noche, media verdad
[01:02.00] bailando lento en la oscuridad
[01:10.00] No me pidas que me quede quieto
[01:17.00] el ruido es mi forma de estar despierto
[01:26.00] Y si el mundo se apaga
[01:33.00] quedan tus manos en la penumbra
[01:41.00] Media noche, media verdad
[01:49.00] nadie nos busca, nadie nos ve
[02:00.00] Sigo el compás de tu respiración
[02:10.00] la ciudad respira igual que los dos
[02:22.00] Y si el mundo se apaga
[02:30.00] quedan tus manos en la penumbra
[02:42.00] Media noche, media verdad
[02:55.00] Media noche, y nada más`,
  },
  {
    title: "Northbound",
    artist: "Elin Rø",
    album: "Coastal Static",
    duration: 178,
    art: "linear-gradient(142deg, #4fc3f7 0%, #0f4c81 55%, #071a2b 100%)",
    lyrics: `[00:12.00] Packed the car before the light
[00:19.00] Left the keys inside the door
[00:26.00] Every mile a little lighter
[00:33.00] Every exit wanting more
[00:41.00] Northbound, northbound
[00:48.00] chasing something we can't name
[00:56.00] Northbound, northbound
[01:03.00] the road forgets us all the same
[01:12.00] Static on the radio
[01:19.00] singing words we almost know
[01:27.00] You said home is not a place
[01:34.00] it's a hand you hold in the cold
[01:43.00] Northbound, northbound
[01:51.00] chasing something we can't name
[02:02.00] and the sun keeps coming up
[02:12.00] and we keep driving anyway`,
  },
  {
    title: "Sal y Viento",
    artist: "Mateo Cruz",
    album: "Farallón",
    duration: 242,
    art: "linear-gradient(142deg, #fbbf24 0%, #c2410c 56%, #2a1108 100%)",
    lyrics: `[00:16.00] Caminé la orilla sin zapatos
[00:24.00] con la sal quemándome la piel
[00:32.00] Tu risa se perdió en la espuma
[00:40.00] y el viento no la quiso devolver
[00:49.00] Sal y viento, todo lo que fui
[00:57.00] un verano que no supe retener
[01:06.00] Sal y viento, lo que queda de mí
[01:14.00] es la marea aprendiendo a volver
[01:25.00] Hay un faro que ya no ilumina
[01:33.00] hay un barco dormido en el farallón
[01:42.00] Y yo cuento las olas que faltan
[01:50.00] para el día en que regrese el sol
[02:02.00] Sal y viento, todo lo que fui
[02:11.00] un verano que no supe retener
[02:22.00] Sal y viento, lo que queda de mí
[02:33.00] es la marea aprendiendo a volver
[02:50.00] Aprendiendo a volver
[03:10.00] Aprendiendo a volver`,
  },
  {
    title: "Ceramic Sky",
    artist: "Låke",
    album: "Slow Repair",
    duration: 217,
    art: "linear-gradient(142deg, #cbd5e1 0%, #475569 55%, #0f172a 100%)",
    lyrics: `[00:11.00] Morning comes in porcelain
[00:18.00] cracking at the edges, slow
[00:25.00] I collect the little pieces
[00:32.00] line them up and let them go
[00:40.00] Ceramic sky, you break so quietly
[00:48.00] I never heard the fall
[00:56.00] Ceramic sky, I'm sweeping up the light
[01:05.00] and hanging it back on the wall
[01:15.00] Everything I meant to keep
[01:22.00] turned to dust inside my hands
[01:30.00] Still I water what is left
[01:38.00] Still I try to understand
[01:48.00] Ceramic sky, you break so quietly
[01:57.00] I never heard the fall
[02:07.00] Ceramic sky, I'm sweeping up the light
[02:18.00] and hanging it back on the wall
[02:35.00] Back on the wall
[02:55.00] Back on the wall`,
  },
];

/** Convierte un bloque LRC en [{ time, text }]. */
export function parseLRC(src) {
  return src
    .split("\n")
    .map((line) => {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (!m) return null;
      return { time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() };
    })
    .filter((l) => l && l.text);
}

/** Páginas del notch: id, etiqueta, icono y alto expandido. */
export const PAGE_DEFS = [
  { id: "music", label: "Música", icon: "i-music", height: 448 },
  { id: "focus", label: "Enfoque", icon: "i-timer", height: 452 },
  { id: "water", label: "Agua", icon: "i-droplet", height: 430 },
  { id: "shelf", label: "Estante", icon: "i-shelf", height: 404 },
  { id: "tasks", label: "Tareas", icon: "i-tasks", height: 430 },
  { id: "settings", label: "Ajustes", icon: "i-settings", height: 452 },
];

export const FOCUS_MODES = {
  work: { label: "Enfoque", total: 25 * 60, tone: "focus" },
  short: { label: "Pausa corta", total: 5 * 60, tone: "ok" },
  long: { label: "Pausa larga", total: 15 * 60, tone: "water" },
};
