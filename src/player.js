/**
 * Reproductor simulado. No hay audio: el tiempo avanza con el reloj del sistema,
 * igual que haría un wrapper sobre SMTC (Windows.Media.Control).
 * Cambiar esto por el reproductor real es reemplazar este módulo.
 */

import { TRACKS } from "./data.js";
import { state, save, emit } from "./store.js";
import { clamp } from "./ui.js";

export const current = () => TRACKS[state.music.track];

export function setTrack(index, { keepPlaying = true } = {}) {
  const total = TRACKS.length;
  state.music.track = ((index % total) + total) % total;
  state.music.position = 0;
  if (!keepPlaying) state.music.playing = false;
  save();
  emit("music");
}

export function next() {
  setTrack(state.music.shuffle ? Math.floor(Math.random() * TRACKS.length) : state.music.track + 1);
}

export function prev() {
  if (state.music.position > 4) {
    seek(0);
    return;
  }
  setTrack(state.music.track - 1);
}

export function toggle() {
  state.music.playing = !state.music.playing;
  save();
  emit("music");
}

export function seek(seconds) {
  state.music.position = clamp(seconds, 0, current().duration - 0.05);
  save();
  emit("music");
}

export function toggleShuffle() {
  state.music.shuffle = !state.music.shuffle;
  save();
  emit("music");
}

/** Avanza el reloj; devuelve true si cambió de pista. */
export function advance(dt) {
  if (!state.music.playing) return false;
  state.music.position += dt;
  if (state.music.position >= current().duration) {
    next();
    return true;
  }
  return false;
}

export function isLastFrame() {
  return state.music.position >= current().duration - 0.6;
}
