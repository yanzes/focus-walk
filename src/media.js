/**
 * Fuente de reproducción de la interfaz.
 * En la app de escritorio sale de la sesión multimedia real de Windows (SMTC);
 * en el navegador usa las pistas de demo de data.js.
 */

import { TRACKS } from "./data.js";
import { state, save, on as onStore } from "./store.js";
import { clamp } from "./ui.js";
import { isNative } from "./native.js";
import { sys, onSystem, systemCall, requestLyrics, artFor } from "./system.js";
import * as player from "./player.js";

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

// Una sola suscripción para todo el módulo.
onSystem(emit);
onStore("music", emit);

export function onMedia(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** ¿Estamos mostrando la sesión del sistema? */
export const usesSystem = () => isNative;

/**
 * Pista actual. `null` significa que en el escritorio no hay nada reproduciéndose.
 */
export function currentTrack() {
  if (isNative) {
    const m = sys.media;
    if (!m || !m.title) return null;
    const elapsed = m.playing ? Math.max(0, (Date.now() - sys.at) / 1000) : 0;
    const duration = m.duration || 0;
    let position = (m.position || 0) + elapsed;
    if (duration > 0) position = Math.min(position, duration);
    return {
      key: `${m.title}|${m.artist || ""}|${Math.round(duration)}`,
      artKey: `${m.title}|${m.artist || ""}`,
      artUrl: artFor(`${m.title}|${m.artist || ""}`),
      title: m.title,
      artist: m.artist || "",
      album: m.album || "",
      app: m.app || "",
      duration,
      position,
      playing: Boolean(m.playing),
      canSeek: Boolean(m.canSeek),
      canSkip: Boolean(m.canSkip),
      system: true,
    };
  }

  const t = TRACKS[state.music.track];
  return {
    key: `demo-${state.music.track}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    app: "Demo",
    duration: t.duration,
    position: state.music.position,
    playing: state.music.playing,
    canSeek: true,
    canSkip: true,
    system: false,
  };
}

export function playPause() {
  if (isNative) systemCall({ cmd: "toggle" });
  else player.toggle();
}

export function next() {
  if (isNative) systemCall({ cmd: "next" });
  else player.next();
}

export function prev() {
  if (isNative) systemCall({ cmd: "prev" });
  else player.prev();
}

export function seek(seconds) {
  if (isNative) systemCall({ cmd: "seek", seconds: Math.max(0, seconds) });
  else player.seek(seconds);
}

export function toggleMute() {
  if (isNative) systemCall({ cmd: "mute", value: !sys.muted });
}

/** Volumen actual (0..100): el del sistema en escritorio, el de demo en el navegador. */
export function currentVolume() {
  return isNative && typeof sys.volume === "number" ? sys.volume : state.music.volume;
}

/**
 * Ajusta el volumen del equipo. En escritorio solo pide el cambio: el valor
 * definitivo vuelve con el estado real del sistema, no se inventa aquí.
 * @returns {number} el nivel aplicado (0..100)
 */
export function setVolume(value) {
  const level = clamp(Math.round(Number(value) || 0), 0, 100);
  if (isNative) {
    systemCall({ cmd: "volume", value: level });
  } else {
    state.music.volume = level;
    save();
    emit();
  }
  return level;
}

/** Letras: LRCLIB en escritorio, demo en el navegador. */
export async function lyricsFor(track) {
  if (!track) return { synced: null, plain: null };
  if (!track.system) {
    return { synced: TRACKS[state.music.track].lyrics, plain: null };
  }
  const result = await requestLyrics({
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
  });
  return {
    synced: result?.synced || null,
    plain: result?.plain || null,
  };
}

