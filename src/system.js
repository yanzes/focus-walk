/** Estado real del sistema que llega desde la app de escritorio. */

import { isNative } from "./native.js";

const api = isNative ? window.notchNative.system : null;

export const sys = {
  connected: false,
  media: null,
  volume: null,
  muted: null,
  caps: null,
  brightness: null,
  brightnessSupported: false,
  at: 0,
};

const listeners = new Set();
const artwork = new Map();

/** Carátula ya recibida para esa pista (data URL) o null. */
export function artFor(key) {
  return key ? artwork.get(key) || null : null;
}

export function onSystem(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(sys);
}

function apply(payload) {
  if (!payload || payload.type !== "state") return;
  sys.media = payload.media || null;
  if (typeof payload.volume === "number") sys.volume = payload.volume;
  if (typeof payload.muted === "boolean") sys.muted = payload.muted;
  if (typeof payload.caps === "boolean") sys.caps = payload.caps;
  sys.brightness = typeof payload.brightness === "number" ? payload.brightness : null;
  sys.brightnessSupported = Boolean(payload.brightnessSupported);
  sys.at = Date.now();
  emit();
}

export function initSystem() {
  if (!api) return;
  api.onState(apply);
  api.onArt(({ key, url }) => {
    if (!key || !url) return;
    artwork.set(key, url);
    if (artwork.size > 30) artwork.delete(artwork.keys().next().value);
    emit();
  });
  api.onConnection((connected) => {
    sys.connected = connected;
    if (!connected) sys.media = null;
    emit();
  });
  api
    .snapshot()
    .then((snap) => {
      if (!snap) return;
      sys.connected = Boolean(snap.connected);
      apply(snap.state);
    })
    .catch(() => {});
}

/** Envía un comando al puente de Windows. */
export function systemCall(command) {
  api?.call(command);
}

export function requestLyrics(track) {
  if (!api) return Promise.resolve(null);
  return api.lyrics(track).catch(() => null);
}
